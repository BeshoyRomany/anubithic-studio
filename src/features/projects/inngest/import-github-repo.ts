import ky from "ky";
import { Octokit } from "octokit";
import { isBinaryFile } from "isbinaryfile";
import { NonRetriableError } from "inngest";

import { convex } from "@/lib/convex-client";
import { inngest } from "@/inngest/client";

import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";

interface ImportGithubRepoEvent {
  owner: string;
  repo: string;
  projectId: Id<"projects">;
  githubToken: string; // the logged in user github token
}

export const importGithubRepo = inngest.createFunction(
  {
    id: "import-github-repo",
    triggers: {
      event: "github/import.repo",
    },
    //handle on fail
    onFailure: async ({ event, step }) => {
      const internalKey = process.env.ANUBITHIC_STUDIO_CONVEX_INTERNAL_KEY!;

      if (!internalKey) return;
      const { projectId } = event.data.event.data as ImportGithubRepoEvent;

      //indicate to the user that the background job failed
      await step.run("set-failed-status", async () => {
        await convex.mutation(api.system.updateImportStatus, {
          internalKey,
          projectId,
          status: "failed",
        });
      });
    },
  },
  async ({ event, step }) => {
    // 1. Receive the event and verify the internal key and GitHub credentials.
    const { owner, repo, projectId, githubToken } =
      event.data as ImportGithubRepoEvent;

    const internalKey = process.env.ANUBITHIC_STUDIO_CONVEX_INTERNAL_KEY!;

    if (!internalKey) {
      throw new NonRetriableError("Internal key not configured");
    }

    //authenticate to github by using github token we extract from clerk through octoKit
    const octokit = new Octokit({ auth: githubToken });

    //Clean up any existing file in the project before we import from github
    // 2. Clear any existing files in the project from database storage before starting the import.
    await step.run("cleanup-project", async () => {
      let hasMore = true;
      while (hasMore) {
        const result = await convex.mutation(api.system.cleanup, {
          internalKey,
          projectId,
        });
        hasMore = result.hasMore;
      }
    });

    // fetch the repo tree first
    const tree = await step.run("fetch-rep-tree", async () => {
      try {
        // 3. Fetch the repository information to determine its default branch (e.g., main or master).
        const { data: repoData } = await octokit.rest.repos.get({
          owner,
          repo,
        });

        const defaultBranch = repoData.default_branch || "main";

        // 4. Retrieve the complete recursive file and folder tree from GitHub using the default branch SHA.
        const { data } = await octokit.rest.git.getTree({
          owner,
          repo,
          tree_sha: defaultBranch,
          recursive: "1",
        });

        return data;
      } catch (error) {
        // Handle error here if needed
        throw error;
      }
    });

    /* Sort folders by depth so parent directories are created before their children.
    // GitHub's API returns the tree items in an arbitrary/unsorted order,
    // Sort folders by depth so parent directories are created before their children.

    // Original list (Before sorting):
    // [
    //   { path: "src/components/ui" }, // Index 0 -> a
    //   { path: "src" },                // Index 1 -> b
    //   { path: "src/components" }      // Index 2 -> c
    // ]
    //
    // Iteration 1:
    // a = { path: "src/components/ui" } (depth = 3)
    // b = { path: "src" } (depth = 1)

    // Calculation: 3 - 1 = 2 (Positive)
    // Action: .sort() swaps them so the shallower path comes first.

    // List becomes:
    // [
    //   { path: "src" },
    //   { path: "src/components/ui" },
    //   { path: "src/components" }
    // ]
    //
    // Iteration 2:
    // a = { path: "src/components/ui" } (depth = 3)
    // b = { path: "src/components" } (depth = 2)

    // Calculation: 3 - 2 = 1 (Positive)
    // Action: Since the result is positive (a is deeper than b), .sort() swaps them so the shorter path comes first.

    // Final sorted list:
    // [
    //   { path: "src" },                // depth 1
    //   { path: "src/components" },      // depth 2
    //   { path: "src/components/ui" }    // depth 3
    // ]
    */
    // 5. Filter and sort folders by depth to ensure parent directories are created before their children.
    const folders = tree.tree
      .filter((item) => item.type === "tree" && item.path)
      .sort((a, b) => {
        const aDepth = a.path ? a.path.split("/").length : 0;
        const bDepth = b.path ? b.path.split("/").length : 0;

        return aDepth - bDepth;
      });

    /* Return the folder map from the step so it can be used in subsequent steps
    // (Inngest serializes step results, so we use a plain object instead of Map)
    // How folder creation & mapping works (Step-by-Step Example):
    //
    // Sorted folders input:
    // [
    //   { path: "src" },
    //   { path: "src/components" },
    //   { path: "src/components/ui" }
    // ]
    //
    // Iteration 1 (Folder: "src"):
    // - pathParts = ["src"]
    // - name = "src" (extracted via pop())
    // - parentPath = "" (empty string because no parent left)
    // - parentId = undefined (since parentPath is empty)
    // - Convex creates folder -> returns database ID
    // - map["src"] = folderId (stores the ID against the "src" path key)
    //
    // Iteration 2 (Folder: "src/components"):
    // - pathParts = ["src", "components"]
    // - name = "components" (extracted via pop())
    // - parentPath = "src" (joined back using join("/"))
    // - parentId = map[parentPath] -> map["src"] (retrieves the ID using the parent path key!)
    // - Convex creates subfolder -> returns database ID
    // - map["src/components"] = folderId (stores the ID against the "src/components" path key)
    //
    // Iteration 3 (Folder: "src/components/ui"):
    // - pathParts = ["src", "components", "ui"]
    // - name = "ui" (extracted via pop())
    // - parentPath = "src/components" (joined back using join("/"))
    // - parentId = map[parentPath] -> map["src/components"] (retrieves the ID using the parent path key!)
    // - Convex creates sub-subfolder -> returns database ID
    // - map["src/components/ui"] = folderId (stores the ID against the "src/components/ui" path key)
    */

    // 6. Iterate through the sorted folders, create them in the database, and map their paths to their IDs.
    const folderIdMap = await step.run("create-folders", async () => {
      const map: Record<string, Id<"files">> = {};

      for (const folder of folders) {
        if (!folder.path) {
          continue;
        }

        const pathParts = folder.path.split("/");
        const name = pathParts.pop()!;
        const parentPath = pathParts.join("/");
        const parentId = parentPath ? map[parentPath] : undefined;

        const folderId = await convex.mutation(api.system.createFolder, {
          internalKey,
          projectId,
          name,
          parentId,
        });

        map[folder.path] = folderId;
      }

      return map;
    });

    // 7. Filter the tree elements to isolate actual file blobs containing valid paths and SHAs.
    const allFiles = tree.tree.filter(
      (item) => item.type === "blob" && item.path && item.sha,
    );

    /* Get all files (blobs) from the tree
        // How file creation, type checking, and upload work:
        // 1. Fetches each file's content from GitHub using its unique `sha` (returns base64).
        // 2. Converts the content to a Buffer and checks if it's a binary file (e.g., images) or text.
        // 3. Extracts the file's name using pop() and its parent path using join("/") to look up
        //    the correct `parentId` from `folderIdMap`.
        // 4. If binary: generates an upload URL from Convex, uploads the raw buffer to storage via `ky`,
        //    and saves the record using `createBinaryFile`.
        // 5. If text: converts the buffer to a utf-8 string and saves it directly using `createFile`.
        // 6. Uses try/catch on each file to ensure a single failing file doesn't crash the entire import job.
    */
    await step.run("create-files", async () => {
      for (const file of allFiles) {
        if (!file.path || !file.sha) {
          continue;
        }

        try {
          const { data: blob } = await octokit.rest.git.getBlob({
            owner,
            repo,
            file_sha: file.sha,
          });

          const buffer = Buffer.from(blob.content, "base64");
          const isBinary = await isBinaryFile(buffer);

          const pathParts = file.path.split("/");
          const name = pathParts.pop()!;
          const parentPath = pathParts.join("/");
          const parentId = parentPath ? folderIdMap[parentPath] : undefined;

          if (isBinary) {
            // 9. If the file is binary, generate a storage upload URL, post the buffer to storage, and save the binary record.
            const uploadUrl = await convex.mutation(
              api.system.generateUploadUrl,
              { internalKey },
            );

            const { storageId } = await ky
              .post(uploadUrl, {
                headers: { "Content-Type": "application/octet-stream" },
                body: buffer,
              })
              .json<{ storageId: Id<"_storage"> }>();

            await convex.mutation(api.system.createBinaryFile, {
              internalKey,
              projectId,
              name,
              storageId,
              parentId,
            });
          } else {
            // 10. If the file is text, convert the buffer to a utf-8 string and save it directly as a text file record.
            const content = buffer.toString("utf-8");

            await convex.mutation(api.system.createFile, {
              internalKey,
              projectId,
              name,
              content,
              parentId,
            });
          }
        } catch {
          // 11. Wrap file creation in a try-catch block to prevent a single failing file from crashing the entire import job.
          console.error(`Failed to import file: ${file.path}`);
        }
      }
    });

    // 12. Update the project status in the database to completed, marking a successful GitHub repository import.
    await step.run("set-completed-status", async () => {
      await convex.mutation(api.system.updateImportStatus, {
        internalKey,
        projectId,
        status: "completed",
      });
    });

    return { success: true, projectId };
  },
);

//######### THE FLOW #########//
// 1. Receive the event and verify the internal key and GitHub credentials.
// 2. Clear any existing files in the project from database storage before starting the import.
// 3. Fetch the repository information to determine its default branch (e.g., main or master).
// 4. Retrieve the complete recursive file and folder tree from GitHub using the default branch SHA.
// 5. Filter and sort folders by depth to ensure parent directories are created before their children.
// 6. Iterate through the sorted folders, create them in the database, and map their paths to their IDs.
// 7. Filter the tree elements to isolate actual file blobs containing valid paths and SHAs.
// 8. Iterate through each file blob to fetch its content, decode it, and check whether it is binary or text.
// 9. If the file is binary, generate a storage upload URL, post the buffer to storage, and save the binary record.
// 10. If the file is text, convert the buffer to a utf-8 string and save it directly as a text file record.
// 11. Wrap file creation in a try-catch block to prevent a single failing file from crashing the entire import job.
// 12. Update the project status in the database to completed, marking a successful GitHub repository import.
