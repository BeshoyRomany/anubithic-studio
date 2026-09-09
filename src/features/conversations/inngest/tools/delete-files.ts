import { z } from "zod";
import { createTool } from "@inngest/agent-kit";

import { convex } from "@/lib/convex-client";

import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";

interface DeleteFilesToolOptions {
  internalKey: string;
  messageId: Id<"messages">;
}

const paramsSchema = z.object({
  fileIds: z
    .array(z.string().min(1, "File ID cannot be empty"))
    .min(1, "Provide at least one file ID"),
});

export const createDeleteFilesTool = ({
  internalKey,
  messageId,
}: DeleteFilesToolOptions) => {
  return createTool({
    name: "deleteFiles",
    description:
      "Delete files or folders from the project. If deleting a folder, all contents will be deleted recursively.",
    parameters: z.object({
      fileIds: z
        .array(z.string())
        .describe("Array of file or folder IDs to delete"),
    }),
    handler: async (params, { step: toolStep }) => {
      const parsed = paramsSchema.safeParse(params);
      if (!parsed.success) {
        return `Error: ${parsed.error.issues[0].message}`;
      }

      const { fileIds } = parsed.data;

      // Validate all files exist before running the step
      const filesToDelete: {
        id: string;
        name: string;
        type: string;
      }[] = [];

      for (const fileId of fileIds) {
        const file = await convex.query(api.system.getFileById, {
          internalKey,
          fileId: fileId as Id<"files">,
        });

        if (!file) {
          return `Error: File with ID "${fileId}" not found. Use listFiles to get valid file IDs.`;
        }

        filesToDelete.push({
          id: file._id,
          name: file.name,
          type: file.type,
        });
      }

      return await toolStep?.run("delete-files", async () => {
        const results: string[] = [];

        const stepId = crypto.randomUUID();

        //show file names in the status
        const fileNames = filesToDelete.map((f) => f.name).join(", ");
        const stepLabel =
          filesToDelete.length === 1
            ? `Deleting [${filesToDelete[0].name}] ${filesToDelete[0].type}...`
            : `Deleting ${filesToDelete.length} [${fileNames}] folder(s)/file(s)...`;

        //update the step state in the database
        await convex.mutation(api.system.addMessageStep, {
          internalKey,
          messageId,
          stepId,
          label: stepLabel,
        });

        try {
          //Deleting the files
          for (const file of filesToDelete) {
            await convex.mutation(api.system.deleteFile, {
              internalKey,
              fileId: file.id as Id<"files">,
            });

            results.push(`Deleted ${file.type} "${file.name}" successfully`);
          }

          //update the step if it successes
          await convex.mutation(api.system.completeMessageStep, {
            internalKey,
            messageId,
            stepId,
          });

          //return results.join("\n");
        } catch (error) {
          // fail in any runtime error
          await convex.mutation(api.system.failMessageStep, {
            internalKey,
            messageId,
            stepId,
          });
          return `Error deleting files: ${error instanceof Error ? error.message : "Unknown error"}`;
        }
      });
    },
  });
};
