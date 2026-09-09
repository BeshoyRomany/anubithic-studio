import { z } from "zod";
import { createTool } from "@inngest/agent-kit";

import { convex } from "@/lib/convex-client";

import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";

interface CreateFilesToolOptions {
  projectId: Id<"projects">;
  internalKey: string;
  messageId: Id<"messages">;
}

const paramsSchema = z.object({
  parentId: z.string(),
  files: z
    .array(
      z.object({
        name: z.string().min(1, "File name cannot be empty"),
        content: z.string(),
      }),
    )
    .min(1, "Provide at least one file to create"),
});

export const createCreateFilesTool = ({
  projectId,
  internalKey,
  messageId,
}: CreateFilesToolOptions) => {
  return createTool({
    name: "createFiles",
    description:
      "Create multiple files at once in the same folder. Use this to batch create files that share the same parent folder. More efficient than creating files one by one.",
    parameters: z.object({
      parentId: z
        .string()
        .describe(
          "The ID of the parent folder. Use empty string for root level. Must be a valid folder ID from listFiles.",
        ),
      files: z
        .array(
          z.object({
            name: z.string().describe("The file name including extension"),
            content: z.string().describe("The file content"),
          }),
        )
        .describe("Array of files to create"),
    }),
    handler: async (params, { step: toolStep }) => {
      const parsed = paramsSchema.safeParse(params);
      if (!parsed.success) {
        return `Error: ${parsed.error.issues[0].message}`;
      }

      const { parentId, files } = parsed.data;

      return await toolStep?.run("create-files", async () => {
        const stepId = crypto.randomUUID();
        let resolvedParentId: Id<"files"> | undefined;

        //show file names in the status
        const fileNames = files.map((f) => f.name).join(", ");
        const stepLabel =
          files.length === 1
            ? `Creating ${files[0].name}...`
            : `Creating ${files.length} files (${fileNames})...`;

        //update the step state in the database
        await convex.mutation(api.system.addMessageStep, {
          internalKey,
          messageId,
          stepId,
          label: stepLabel,
        });

        try {
          // validate the parent folder
          if (parentId && parentId !== "") {
            resolvedParentId = parentId as Id<"files">;

            //query the parent folder
            const parentFolder = await convex.query(api.system.getFileById, {
              internalKey,
              fileId: resolvedParentId,
            });

            //validate the parent folder
            if (!parentFolder) {
              await convex.mutation(api.system.failMessageStep, {
                internalKey,
                messageId,
                stepId,
              });
              return `Error: Parent folder with ID "${parentId}" not found. Use listFiles to get valid folder IDs.`;
            }

            //type folder check
            if (parentFolder.type !== "folder") {
              await convex.mutation(api.system.failMessageStep, {
                internalKey,
                messageId,
                stepId,
              });
              return `Error: The ID "${parentId}" is a file, not a folder. Use a folder ID as parentId.`;
            }
          }

          //create the files
          const results = await convex.mutation(api.system.createFiles, {
            internalKey,
            projectId,
            parentId: resolvedParentId,
            files,
          });

          //check the creating successfully files, and failed files
          const created = results.filter((r) => !r.error);
          const failed = results.filter((r) => r.error);

          let response = `Created ${created.length} file(s)`;
          if (created.length > 0) {
            response += `: ${created.map((r) => r.name).join(", ")}`;
          }
          if (failed.length > 0) {
            response += `. Failed: ${failed.map((r) => `${r.name} (${r.error})`).join(", ")}`;
          }

          //update the step if it successes
          await convex.mutation(api.system.completeMessageStep, {
            internalKey,
            messageId,
            stepId,
          });

          return response;
        } catch (error) {
          // fail in any runtime error
          await convex.mutation(api.system.failMessageStep, {
            internalKey,
            messageId,
            stepId,
          });

          return `Error creating files: ${error instanceof Error ? error.message : "Unknown error"}`;
        }
      });
    },
  });
};
