import ky from "ky";
import { Octokit } from "octokit";
import { NonRetriableError } from "inngest";

import { convex } from "@/lib/convex-client";
import { inngest } from "@/inngest/client";

import { api } from "../../../../convex/_generated/api";
import { Doc, Id } from "../../../../convex/_generated/dataModel";

//Interface for the project we will export to github
interface ExportToGithubEvent {
  projectId: Id<"projects">;
  repoName: string;
  visibility: "public" | "private";
  description?: string;
  githubToken: string;
}

//Intersection Type for file with URL
type FileWithUrl = Doc<"files"> & {
  storageUrl: string | null;
};

export const exportToGithub = inngest.createFunction(
  {
    id: "export-to-github",
    triggers: {
      event: "github/export.repo",
    },
    //handle the cancel
    cancelOn: [
      {
        event: "github/export.cancel",
        if: "event.data.projectId == async.data.projectId",
      },
    ],
    //handle on fail
    onFailure: async ({ event, step }) => {
      const internalKey = process.env.ANUBITHIC_STUDIO_CONVEX_INTERNAL_KEY!;

      if (!internalKey) return;
      const { projectId } = event.data.event.data as ExportToGithubEvent;

      await step.run("set-failed-status", async () => {
        await convex.mutation(api.system.updateExportStatus, {
          internalKey,
          projectId,
          status: "failed",
        });
      });
    },
  },
  async ({ event, step }) => {
    // 1. Receive the event and verify the presence of the internal key and authentication token.
    const { projectId, repoName, visibility, description, githubToken } =
      event.data as ExportToGithubEvent;
    const internalKey = process.env.ANUBITHIC_STUDIO_CONVEX_INTERNAL_KEY!;
    if (!internalKey) {
      throw new NonRetriableError("Internal key not configured");
    }

    // Set status to exporting
    // 2. Update the project status in the database to exporting to indicate the export has started.
    await step.run("set-exporting-status", async () => {
      await convex.mutation(api.system.updateExportStatus, {
        internalKey,
        projectId,
        status: "exporting",
      });
    });

    // 3. Initialize the GitHub client (Octokit) using the user's personal access token.
    const octokit = new Octokit({ auth: githubToken });

    // Get authenticated user
    // 4. Fetch the authenticated user's profile data from the GitHub API.
    const { data: user } = await step.run("get-github-user", async () => {
      return await octokit.rest.users.getAuthenticated();
    });

    // Create the new repository with auto_init to have an initial commit
    // (auto_init: true tells GitHub to automatically create an initial commit
    // with a README.md file, ensuring the repo isn't empty so we have a base to build upon)
    // 5. Create a new repository on GitHub with auto_init enabled to generate an initial commit and base structure.
    const { data: repo } = await step.run("create-repo", async () => {
      return await octokit.rest.repos.createForAuthenticatedUser({
        name: repoName,
        description: description || `Exported from Anubithic/studio`,
        private: visibility === "private",
        auto_init: true,
      });
    });

    // Wait for GitHub to initialize the repo (auto_init is async on GitHub's side)
    // 6. Wait for 3 seconds to ensure the repository initialization is fully processed on GitHub's servers.
    await step.sleep("wait-for-repo-init", "3s");

    // Get the initial commit SHA (we need this as parent for our commit)
    // (SHA is a unique 40-character cryptographic hash/fingerprint that Git uses
    // to track commits and maintain the history chain, acting as the parent for new changes)
    // 7. Fetch the initial commit SHA of the main branch to use it as the parent commit.
    const initialCommitSha = await step.run("get-initial-commit", async () => {
      const { data: ref } = await octokit.rest.git.getRef({
        owner: user.login,
        repo: repoName,
        ref: "heads/main",
      });
      return ref.object.sha;
    });

    // Fetch all project files with storage URLs from convex database
    // 8. Retrieve all project files and their corresponding storage URLs from the Convex database.
    const files = await step.run("fetch-project-files", async () => {
      return (await convex.query(api.system.getProjectFilesWithUrls, {
        internalKey,
        projectId,
      })) as FileWithUrl[];
    });

    /* buildFilePaths() - Core Idea:
      -----------------------------
      1. Problem: We have a flat list of files/folders in memory (no extra DB calls needed).
      2. Goal: Find all parents and ancestors for each file to build its full path (e.g., "src/components/Button.tsx").
      3. Strategy:
         - Step A: Map all files into a fast lookup map (`fileId => file object`).
         - Step B: Use a recursive function to climb up the parent chain using `parentId`
           until reaching the root, then assemble the final path.
     */
    const buildFilePaths = (files: FileWithUrl[]) => {
      const fileMap = new Map<Id<"files">, FileWithUrl>();
      files.forEach((f) => fileMap.set(f._id, f));
      /* Example Output Map:
      // Map(2) {
      //   "jd742k9x..." => { _id: "jd742k9x...", name: "components", type: "folder", parentId: undefined, ... },
      //   "jd748m2p..." => { _id: "jd748m2p...", name: "Button.tsx", type: "file", parentId: "jd742k9x...", storageUrl: "...", ... }
      // }
      */

      const getFullPath = (file: FileWithUrl): string => {
        //root folder/file -> get it's name only
        if (!file.parentId) {
          return file.name;
        }

        //else -> get the parent by parentId from the map (not root element)
        const parent = fileMap.get(file.parentId);

        // If the parent ID points to a deleted or non-existent folder,
        // fallback gracefully by treating the file as a root item to prevent crashes
        if (!parent) {
          return file.name;
        }

        /* How Recursion builds the path step-by-step (Bottom-Up approach & Call Stack):
        
        Example: File "Button.tsx" inside "components" inside "src"
        
        1st Call (Button.tsx): 
           - parent is "components"
           - Pauses/Suspends here, waiting for `getFullPath(components)` to resolve.
           - Returns: `${getFullPath(components)}` + `/` + `Button.tsx`
        
        2nd Call (components): 
           - parent is "src"
           - Pauses/Suspends here, waiting for `getFullPath(src)` to resolve.
           - Returns: `${getFullPath(src)}` + `/` + `components`
        
        3rd Call (src - Root): 
           - No parentId (hits base case - no more waiting!)
           - Returns: `src`
           
        Quick Trace:
        1. Button.tsx asks for its parent "components" -> waits.
        2. components asks for its parent "src" -> waits.
        3. src has no parent, returns "src".
        4. They return backwards, attaching names: "src/components/Button.tsx"
           
        Final Assembled Result: "src/components/Button.tsx"
        */
        return `${getFullPath(parent)}/${file.name}`;
      };

      //save each file with it's path
      const paths: Record<string, FileWithUrl> = {};
      files.forEach((file) => {
        paths[getFullPath(file)] = file;
      });

      return paths;
    };

    //build & store the files paths
    // 9. Construct full file paths using a recursive function that links child items to their parent folders (e.g., src/components/Button.tsx).
    const filePaths = buildFilePaths(files);

    // Filter to only actual files (not folders)
    // 10. Filter the entries to isolate actual files while excluding empty or raw folder objects.
    const fileEntries = Object.entries(filePaths).filter(
      ([, file]) => file.type === "file",
    );

    //throw error if we have no files to export
    // 11. Validate that files exist and throw a non-retriable error if the file list is empty.
    if (fileEntries.length === 0) {
      throw new NonRetriableError("No files to export");
    }

    // Create blobs for each file
    // 12. Iterate through each file to upload its content (handling plain text or base64-encoded binary buffers) to create individual Git blobs and obtain their unique SHAs.
    const treeItems = await step.run("create-blobs", async () => {
      // Define an array to hold the GitHub tree items metadata
      const items: {
        path: string;
        mode: "100644";
        type: "blob";
        sha: string;
      }[] = [];

      // Loop through each file path and file object in our entries
      for (const [path, file] of fileEntries) {
        // Initialize the content variable for the file data
        let content: string;
        // Set the default text encoding to utf-8
        let encoding: "utf-8" | "base64" = "utf-8";

        // Check if the file contains direct text content
        if (file.content !== undefined) {
          // Text file
          // Assign the text content directly
          content = file.content;
        } else if (file.storageUrl) {
          // Binary file - fetch and base64 encode
          // Fetch the binary file from storage using its URL
          const response = await ky.get(file.storageUrl);
          // Convert the fetched response into a Node Buffer
          const buffer = Buffer.from(await response.arrayBuffer());
          // Encode the binary buffer into a base64 string
          content = buffer.toString("base64");
          // Switch encoding type to base64 for GitHub API
          encoding = "base64";
        } else {
          // Skip files with no content
          // Skip this iteration if the file has neither content nor URL
          continue;
        }

        // Send the file content to GitHub to create a Git Blob and get its SHA
        const { data: blob } = await octokit.rest.git.createBlob({
          owner: user.login,
          repo: repoName,
          content,
          encoding,
        });

        // Push the file metadata item into our items array for the tree
        items.push({
          path,
          mode: "100644",
          type: "blob",
          sha: blob.sha,
        });
      }

      // Return the complete list of tree items
      return items;
    });

    // Check if no file blobs were successfully created
    if (treeItems.length === 0) {
      // Throw a non-retriable error if the items array is empty
      throw new NonRetriableError("Failed to create any file blobs");
    }

    /* 
    Summary of the two-step Git process:
    1. createBlob (done above inside loop): Uploads each file's content individually to get its unique SHA.
    2. createTree (done below): Bundles all paths and SHAs together into a single tree structure (folders are built implicitly by paths).
    */

    // Create the tree
    // 14. Send the tree items array to GitHub to create the complete repository file tree structure.
    const { data: tree } = await step.run("create-tree", async () => {
      // Call GitHub API to create a new Git tree containing all file blobs and paths
      return await octokit.rest.git.createTree({
        owner: user.login,
        repo: repoName,
        tree: treeItems,
      });
    });

    // Create the commit with the initial commit as parent
    // 15. Create a new Git commit linking the newly generated tree to the previous initial commit parent.
    const { data: commit } = await step.run("create-commit", async () => {
      // Call GitHub API to create a new Git commit pointing to our tree and parent commit
      return await octokit.rest.git.createCommit({
        // Define the GitHub username or organization owning the repository
        owner: user.login,
        // Define the target repository name where the commit will be created
        repo: repoName,
        // Set the commit message describing the changes being pushed
        message: "Initial commit from Anubithic/Studio",
        // Pass the SHA of the Git tree containing all our files and folders
        tree: tree.sha,
        // Specify the parent commit SHA to connect this commit to the history
        parents: [initialCommitSha],
      });
    });

    // Update the main branch reference to point to our new commit
    // 16. Force-update the main branch reference to point to the new commit SHA, successfully finalizing the repository export.
    await step.run("update-branch-ref", async () => {
      // Call GitHub API to update the reference pointer of the branch
      return await octokit.rest.git.updateRef({
        // Define the GitHub username or organization owning the repository
        owner: user.login,
        // Define the target repository name
        repo: repoName,
        // Specify the target branch reference to update (the head of the main branch)
        ref: "heads/main",
        // Pass the SHA of the new commit for the branch to point to
        sha: commit.sha,
        // Force the reference update to overwrite history if necessary
        force: true,
      });
    });

    //Update the project status in the database to completed and save the repository URL.
    // 17. Update the project status in the database to completed and save the repository URL.
    await step.run("set-completed-status", async () => {
      await convex.mutation(api.system.updateExportStatus, {
        internalKey,
        projectId,
        status: "completed",
        repoUrl: repo.html_url,
      });
    });

    // Return a success response containing the repository URL and the total count of exported files.
    // 18. Return a success response containing the repository URL and the total count of exported files.
    return {
      success: true,
      repoUrl: repo.html_url,
      filesExported: treeItems.length,
    };
  },
);

//######### THE FLOW #########//
// 1. Receive the event and verify the presence of the internal key and authentication token.
// 2. Update the project status in the database to exporting to indicate the export has started.
// 3. Initialize the GitHub client (Octokit) using the user's personal access token.
// 4. Fetch the authenticated user's profile data from the GitHub API.
// 5. Create a new repository on GitHub with auto_init enabled to generate an initial commit and base structure.
// 6. Wait for 3 seconds to ensure the repository initialization is fully processed on GitHub's servers.
// 7. Fetch the initial commit SHA of the main branch to use it as the parent commit.
// 8. Retrieve all project files and their corresponding storage URLs from the Convex database.
// 9. Construct full file paths using a recursive function that links child items to their parent folders (e.g., src/components/Button.tsx).
// 10. Filter the entries to isolate actual files while excluding empty or raw folder objects.
// 11. Validate that files exist and throw a non-retriable error if the file list is empty.
// 12. Iterate through each file to upload its content (handling plain text or base64-encoded binary buffers) to create individual Git blobs and obtain their unique SHAs.
// 13. Bundle all file paths, modes, types, and SHAs into a comprehensive metadata array (treeItems).
// 14. Send the tree items array to GitHub to create the complete repository file tree structure.
// 15. Create a new Git commit linking the newly generated tree to the previous initial commit parent.
// 16. Force-update the main branch reference to point to the new commit SHA, successfully finalizing the repository export.
// 17. Update the project status in the database to completed and save the repository URL.
// 18. Return a success response containing the repository URL and the total count of exported files.
