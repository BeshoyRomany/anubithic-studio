import { z } from "zod";
import { createTool } from "@inngest/agent-kit";

import { convex } from "@/lib/convex-client";

import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";

interface CreateFolderToolOptions {
  projectId: Id<"projects">;
  internalKey: string;
  messageId: Id<"messages">;
}

const paramsSchema = z.object({
  name: z.string().min(1, "Folder name is required"),
  parentId: z.string(),
});

export const createCreateFolderTool = ({
  projectId,
  internalKey,
  messageId,
}: CreateFolderToolOptions) => {
  return createTool({
    name: "createFolder",
    description: "Create a new folder in the project",
    parameters: z.object({
      name: z.string().describe("The name of the folder to create"),
      parentId: z
        .string()
        .describe(
          "The ID (not name!) of the parent folder from listFiles, or empty string for root level",
        ),
    }),
    handler: async (params, { step: toolStep }) => {
      const parsed = paramsSchema.safeParse(params);
      if (!parsed.success) {
        return `Error: ${parsed.error.issues[0].message}`;
      }

      const { name, parentId } = parsed.data;

      return await toolStep?.run("create-folder", async () => {
        const stepId = crypto.randomUUID();

        // Update the step state in the database with pending status
        await convex.mutation(api.system.addMessageStep, {
          internalKey,
          messageId,
          stepId,
          label: `Creating ${name} folder...`,
        });

        try {
          // Resolve parentId properly (convert empty string to undefined for root level)
          const resolvedParentId =
            parentId && parentId !== "" ? (parentId as Id<"files">) : undefined;

          // Validate parentId if provided
          if (resolvedParentId) {
            const parentFolder = await convex.query(api.system.getFileById, {
              internalKey,
              fileId: resolvedParentId,
            });

            // Check if the parent folder exists
            if (!parentFolder) {
              await convex.mutation(api.system.failMessageStep, {
                internalKey,
                messageId,
                stepId,
              });
              return `Error: Parent folder with ID "${parentId}" not found. Use listFiles to get valid folder IDs.`;
            }

            // Validate parent type
            if (parentFolder.type !== "folder") {
              await convex.mutation(api.system.failMessageStep, {
                internalKey,
                messageId,
                stepId,
              });
              return `Error: The ID "${parentId}" is a file, not a folder. Use a folder ID as parentId.`;
            }
          }

          // #region Reject path separators in folder names.
          // Names map 1:1 onto WebContainer FileSystemTree keys, which must be
          // single path segments. A name like "src/components" mounts as an
          // invalid key and the preview dies with `EIO: invalid file name`.
          // Nesting is expressed through parentId, never through the name.
          if (name.includes("/") || name.includes("\\")) {
            await convex.mutation(api.system.failMessageStep, {
              internalKey,
              messageId,
              stepId,
            });

            return `Error: Folder name "${name}" must not contain "/" or "\\". Create each level separately and nest it using the parent's ID as parentId.`;
          }
          // #endregion

          // Create the folder in the database
          const folderId = await convex.mutation(api.system.createFolder, {
            internalKey,
            projectId,
            name,
            parentId: resolvedParentId, // if resolvedParentId === undefined means that start create from root
          });

          // Complete the step successfully
          await convex.mutation(api.system.completeMessageStep, {
            internalKey,
            messageId,
            stepId,
          });

          return `Folder created successfully with name: ${name} (ID: ${folderId})`;
        } catch (error) {
          // Fail the step on any runtime or database error to prevent zombie states
          await convex.mutation(api.system.failMessageStep, {
            internalKey,
            messageId,
            stepId,
          });

          return `Error creating folder: ${error instanceof Error ? error.message : "Unknown error"}`;
        }
      });
    },
  });
};
