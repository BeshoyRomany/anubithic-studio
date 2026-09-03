import { inngest } from "@/inngest/client";
import { Id } from "../../../../convex/_generated/dataModel";
import { NonRetriableError } from "inngest";
import { convex } from "@/lib/convex-client";
import { api } from "../../../../convex/_generated/api";
interface MessageEvent {
  messageId: Id<"messages">;
  conversationId: Id<"conversations">;
  projectId: Id<"projects">;
  message: string;
}

export const processMessage = inngest.createFunction(
  {
    id: "process-message",
    triggers: {
      event: "message/sent",
    },
    cancelOn: [
      {
        event: "message/cancel",
        // Match the incoming browser request (event) with the running Inngest job data (async) to ensure precise cancellation
        if: "event.data.messageId == async.data.messageId",
      },
    ],
    onFailure: async ({ event, step }) => {
      const { messageId } = event.data.event.data as MessageEvent;
      //init the internal key
      const internalKey = process.env.ANUBITHIC_STUDIO_CONVEX_INTERNAL_KEY;

      if (!internalKey) {
        throw new NonRetriableError("Internal key not configured");
      }

      await step.run("update-message-on-failure", async () => {
        await convex.mutation(api.system.updateMessageContent, {
          internalKey,
          messageId,
          content:
            "My apologies, I encountered an error while processing your request. Let me know if you need anything else.",
        });
      });
    },
  },
  async ({ event, step }) => {
    // user sent event.data
    const { messageId } = event.data as MessageEvent;
    //init the internal key
    const internalKey = process.env.ANUBITHIC_STUDIO_CONVEX_INTERNAL_KEY;

    if (!internalKey) {
      throw new NonRetriableError("Internal key not configured");
    }

    await step.sleep("wait-for-ai-processing", "3s");

    //Testing error
    // await step.run("throw-on-purpose", async () => {
    //   throw new NonRetriableError("Purposely throw this error");
    // });

    await step.run("update-assistant-message", async () => {
      await convex.mutation(api.system.updateMessageContent, {
        messageId,
        internalKey,
        content: "AI processed this message (TODO)",
      });
    });
  },
);
