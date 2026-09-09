import { z } from "zod";
import { createTool } from "@inngest/agent-kit";

import { convex } from "@/lib/convex-client";

import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { NonRetriableError } from "inngest";

interface UpdateFileToolOptions {
  internalKey: string;
  messageId: Id<"messages">;
}

const paramsSchema = z.object({
  fileId: z.string().min(1, "File ID is required"),
  content: z.string(),
});

export const createUpdateFileTool = ({
  internalKey,
  messageId,
}: UpdateFileToolOptions) => {
  return createTool({
    name: "updateFile",
    description: "Update the content of an existing file",
    parameters: z.object({
      fileId: z.string().describe("The ID of the file to update"),
      content: z.string().describe("The new content for the file"),
    }),
    handler: async (params, { step: toolStep }) => {
      const parsed = paramsSchema.safeParse(params);
      if (!parsed.success) {
        return `Error: ${parsed.error.issues[0].message}`;
      }

      const { fileId, content } = parsed.data;

      const file = await convex.query(api.system.getFileById, {
        internalKey,
        fileId: fileId as Id<"files">,
      });

      if (!file) {
        return `Error: File with ID "${fileId}" not found.`;
      }

      if (file.type === "folder") {
        return `Error: "${fileId}" is a folder, not a file.`;
      }
      return await toolStep?.run("update-file", async () => {
        const stepId = crypto.randomUUID();

        //update the step state in the database
        await convex.mutation(api.system.addMessageStep, {
          internalKey,
          messageId,
          stepId,
          label: `Updating ${file.name} file...`,
        });

        try {
          //update the file
          await convex.mutation(api.system.updateFile, {
            internalKey,
            fileId: fileId as Id<"files">,
            content,
          });

          //update the step if it successes
          await convex.mutation(api.system.completeMessageStep, {
            internalKey,
            messageId,
            stepId,
          });

          return `File "${file.name}" updated successfully`;
        } catch (error) {
          // fail in any runtime error
          await convex.mutation(api.system.failMessageStep, {
            internalKey,
            messageId,
            stepId,
          });

          return `Error updating file: ${error instanceof Error ? error.message : "Unknown error"}`;
        }
      });
    },
  });
};
