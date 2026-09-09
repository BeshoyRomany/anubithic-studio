import { z } from "zod";
import { createTool } from "@inngest/agent-kit";

import { convex } from "@/lib/convex-client";

import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";

interface ListFilesToolOptions {
  projectId: Id<"projects">;
  internalKey: string;
  messageId: Id<"messages">;
}

// List files tool
export const createListFilesTool = ({
  projectId,
  internalKey,
  messageId,
}: ListFilesToolOptions) => {
  return createTool({
    name: "listFiles",
    description:
      "List all files and folders in the project. Returns names, IDs, types, and parentId for each item. Items with parentId: null are at root level. Use the parentId to understand the folder structure - items with the same parentId are in the same folder.",
    parameters: z.object({}),

    handler: async (_, { step: toolStep }) => {
      return await toolStep?.run("list-file", async () => {
        const stepId = crypto.randomUUID();

        //update the step state in the database
        await convex.mutation(api.system.addMessageStep, {
          internalKey,
          messageId,
          stepId,
          label: "Scanning project files...",
        });

        try {
          //query the files from the database
          const files = await convex.query(api.system.getProjectFiles, {
            internalKey,
            projectId,
          });

          // Sort: folders first, then files, alphabetically
          const sorted = files.sort((a, b) => {
            if (a.type !== b.type) {
              return a.type === "folder" ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
          });

          const fileList = sorted.map((f) => ({
            id: f._id,
            name: f.name,
            type: f.type,
            parentId: f.parentId ?? null,
          }));
          //update the step if it successes
          await convex.mutation(api.system.completeMessageStep, {
            internalKey,
            messageId,
            stepId,
          });

          return JSON.stringify(fileList);
        } catch (error) {
          // fail in any runtime error
          await convex.mutation(api.system.failMessageStep, {
            internalKey,
            messageId,
            stepId,
          });

          return `Error listing files: ${error instanceof Error ? error.message : "Unknown error"}`;
        }
      });
    },
  });
};
