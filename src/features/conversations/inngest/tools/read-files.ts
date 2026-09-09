import { z } from "zod";
import { createTool } from "@inngest/agent-kit";

import { convex } from "@/lib/convex-client";

import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";

interface ReadFilesToolOptions {
  internalKey: string;
  messageId: Id<"messages">;
}

const paramsSchema = z.object({
  fileIds: z
    .array(z.string().min(1, "File ID cannot be empty"))
    .min(1, "Provide at least one file ID"),
});

// Read files tool
export const createReadFilesTool = ({
  internalKey,
  messageId,
}: ReadFilesToolOptions) => {
  return createTool({
    name: "readFiles",
    description:
      "Read the content of files from the project. Returns file contents.",
    parameters: z.object({
      fileIds: z.array(z.string()).describe("Array of file IDs to read"),
    }),
    handler: async (params, { step: toolStep }) => {
      const parsed = paramsSchema.safeParse(params);
      if (!parsed.success) {
        return `Error: ${parsed.error.issues[0].message}`;
      }

      const { fileIds } = parsed.data;

      return await toolStep?.run("read-file", async () => {
        const stepId = crypto.randomUUID();

        //update the step state in the database
        await convex.mutation(api.system.addMessageStep, {
          internalKey,
          messageId,
          stepId,
          label: `Reading ${fileIds.length} file(s)...`,
        });

        try {
          const results: { id: string; name: string; content: string }[] = [];

          for (const fileId of fileIds) {
            const file = await convex.query(api.system.getFileById, {
              internalKey,
              fileId: fileId as Id<"files">,
            });

            if (file && file.content) {
              results.push({
                id: file._id,
                name: file.name,
                content: file.content,
              });
            }
          }

          if (results.length === 0) {
            // fail if we didn't get files
            await convex.mutation(api.system.failMessageStep, {
              internalKey,
              messageId,
              stepId,
            });
            return "Error: no files found with provided IDs. Use listFiles to get valid fileIDs.";
          }

          // update to complete status if we succeed
          await convex.mutation(api.system.completeMessageStep, {
            internalKey,
            messageId,
            stepId,
          });

          return JSON.stringify(results);
        } catch (error) {
          // fail in any runtime error
          await convex.mutation(api.system.failMessageStep, {
            internalKey,
            messageId,
            stepId,
          });

          return `Error reading files: ${error instanceof Error ? error.message : "Unknown error"}`;
        }
      });
    },
  });
};
