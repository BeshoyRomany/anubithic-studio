import { inngest } from "@/inngest/client";
import { Id } from "../../../../convex/_generated/dataModel";
import { anthropic, NonRetriableError, openai } from "inngest";
import { convex } from "@/lib/convex-client";
import { api } from "../../../../convex/_generated/api";

import { DEFAULT_CONVERSATION_TITLE } from "../constants";
import {
  CODING_AGENT_SYSTEM_PROMPT,
  TITLE_GENERATOR_SYSTEM_PROMPT,
} from "../prompts/process-message-prompt";
import { createAgent, createNetwork } from "@inngest/agent-kit";
import { createListFilesTool } from "./tools/list-files";
import { createReadFilesTool } from "./tools/read-files";
import { createUpdateFileTool } from "./tools/update-files";
import { createCreateFilesTool } from "./tools/create-files";
import { createCreateFolderTool } from "./tools/create-folders";
import { createRenameFileTool } from "./tools/rename-file";
import { createDeleteFilesTool } from "./tools/delete-files";
import { createScrapeUrlsTool } from "./tools/scrape-urls";

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
        if: "event.data.messageId == async.data.messageId",
      },
    ],
    onFailure: async ({ event, step }) => {
      const { messageId } = event.data.event.data as MessageEvent;
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
    const { messageId, conversationId, message, projectId } =
      event.data as MessageEvent;

    const internalKey = process.env.ANUBITHIC_STUDIO_CONVEX_INTERNAL_KEY;

    if (!internalKey) {
      throw new NonRetriableError("Internal key not configured");
    }

    await step.run("set-initial-thinking", async () => {
      await convex.mutation(api.system.updateMessageContent, {
        messageId,
        internalKey,
        content: "Analyzing...",
      });
    });

    await step.sleep("wait-for-db-sync", "1s");

    const conversation = await step.run("get-conversation", async () => {
      return await convex.query(api.system.getConversationById, {
        internalKey,
        conversationId,
      });
    });

    if (!conversation) {
      throw new NonRetriableError("Conversation not found");
    }

    const recentMessages = await step.run("get-recent-messages", async () => {
      return await convex.query(api.system.getRecentMessages, {
        internalKey,
        conversationId,
        limit: 10,
      });
    });

    let systemPrompt = CODING_AGENT_SYSTEM_PROMPT;

    const contextMessages = recentMessages.filter(
      (msg) => msg._id !== messageId && msg.content.trim() !== "",
    );

    if (contextMessages.length > 0) {
      const historyText = contextMessages
        .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
        .join("\n\n");

      systemPrompt += `\n\n## Previous Conversation (for context only - do NOT repeat these responses):\n${historyText}\n\n## Current Request:\nRespond ONLY to the user's new message below. Do not repeat or reference your previous responses.`;
    }

    // 1- [Agent] generate title
    const shouldGenerateTitle =
      conversation.title === DEFAULT_CONVERSATION_TITLE;

    if (shouldGenerateTitle) {
      // const titleAgent = createAgent({
      //   name: "title-generator",
      //   system: TITLE_GENERATOR_SYSTEM_PROMPT,
      //   model: anthropic({
      //     model: "claude-haiku-4-5-20251001",
      //     defaultParameters: { temperature: 0.3, max_tokens: 50 },
      //   }),
      // });
      const titleAgent = createAgent({
        name: "title-generator",
        system: TITLE_GENERATOR_SYSTEM_PROMPT,
        model: openai({
          model: "gpt-4.1-mini",
          defaultParameters: { temperature: 0.3 },
        }),
      });
      const { output } = await titleAgent.run(message, { step });

      const textMessage = output.find(
        (m) => m.type === "text" && m.role === "assistant",
      );

      if (textMessage?.type === "text") {
        const title =
          typeof textMessage.content === "string"
            ? textMessage.content.trim()
            : textMessage.content
                .map((c) => c.text)
                .join("")
                .trim();

        if (title) {
          await step.run("update-conversation-title", async () => {
            await convex.mutation(api.system.updateConversationTitle, {
              internalKey,
              conversationId,
              title,
            });
          });
        }
      }
    }

    // 2- [Agent] coding
    // const codingAgent = createAgent({
    //   name: "anubithic-studio",
    //   description: "An expert AI coding assistant",
    //   system: systemPrompt,
    //   model: anthropic({
    //     model: "claude-haiku-4-5-20251001",
    //     defaultParameters: { temperature: 0.3, max_tokens: 16000 },
    //   }),
    //   tools: [
    //     createListFilesTool({ internalKey, projectId, messageId }),
    //     createReadFilesTool({ internalKey, messageId }),
    //     createUpdateFileTool({ internalKey, messageId }),
    //     createCreateFilesTool({ internalKey, projectId, messageId }),
    //     createCreateFolderTool({ internalKey, projectId, messageId }),
    //     createRenameFileTool({ internalKey, messageId }),
    //     createDeleteFilesTool({ internalKey, messageId }),
    //     createScrapeUrlsTool({ internalKey, messageId }),
    //   ],
    // });

    const codingAgent = createAgent({
      name: "anubithic-studio",
      description: "An expert AI coding assistant",
      system: systemPrompt,
      model: openai({
        model: "gpt-4.1-mini",
        defaultParameters: { temperature: 0.3 },
      }),
      tools: [
        createListFilesTool({ internalKey, projectId, messageId }),
        createReadFilesTool({ internalKey, messageId }),
        createUpdateFileTool({ internalKey, messageId }),
        createCreateFilesTool({ internalKey, projectId, messageId }),
        createCreateFolderTool({ internalKey, projectId, messageId }),
        createRenameFileTool({ internalKey, messageId }),
        createDeleteFilesTool({ internalKey, messageId }),
        createScrapeUrlsTool({ internalKey, messageId }),
      ],
    });

    // Create network with single agent
    // Create an autonomous agentic network (max 20 iterations) to avoid infinite loops and handle multi-step
    // execution loops: reasoning, calling tools (file scanning/reading, etc...), and returning the final response.
    const network = createNetwork({
      name: "anubithic-studio-network",
      agents: [codingAgent],
      maxIter: 20,
      router: ({ network }) => {
        const lastResult = network.state.results.at(-1);
        const hasTextResponse = lastResult?.output.some(
          (m) => m.type === "text" && m.role === "assistant",
        );
        const hasToolCalls = lastResult?.output.some(
          (m) => m.type === "tool_call",
        );

        // Anthropic outputs text AND tool calls together
        // Only stop if there's text WITHOUT tool calls (final response)
        if (hasTextResponse && !hasToolCalls) {
          return undefined;
        }
        // If the agent hasn't finished yet (still needs tools or more steps),
        // return the codingAgent to trigger the next iteration in the loop.
        return codingAgent;
      },
    });

    // Run the agent
    const result = await network.run(message);

    // Extract the assistant's text response from the last agent result
    const lastResult = result.state.results.at(-1);
    const textMessage = lastResult?.output.find(
      (m) => m.type === "text" && m.role === "assistant",
    );

    // Default fallback message in case the agent finishes without generating explicit text
    let assistantResponse =
      "I processed your request. Let me know if you need anything else!";

    // Extract and format the final text response (handling both string and array content blocks from the model)
    if (textMessage?.type === "text") {
      assistantResponse =
        typeof textMessage.content === "string"
          ? textMessage.content
          : textMessage.content.map((c) => c.text).join("");
    }

    // Update the assistant message with the response (this also sets status to completed)
    await step.run("update-assistant-message", async () => {
      await convex.mutation(api.system.updateMessageContent, {
        internalKey,
        messageId,
        content: assistantResponse,
        status: "completed",
      });
    });

    return { success: true, messageId, conversationId };
  },
);
