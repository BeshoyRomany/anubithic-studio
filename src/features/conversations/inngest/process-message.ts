import { inngest } from "@/inngest/client";
import { Id } from "../../../../convex/_generated/dataModel";
import { NonRetriableError } from "inngest";
import { convex } from "@/lib/convex-client";
import { api } from "../../../../convex/_generated/api";

import { DEFAULT_CONVERSATION_TITLE } from "../constants";
import {
  buildCodingAgentPrompt,
  PLAIN_REPLY_SYSTEM_PROMPT,
  TITLE_GENERATOR_SYSTEM_PROMPT,
} from "@/features/ai/prompts/coding-agent";
import {
  getChosenModel,
  hasProviderKey,
  NoKeyError,
} from "@/features/ai/server/credentials";
import { createAgentModel } from "@/features/ai/server/resolve-model";
import { AI_LIMITS } from "@/features/ai/server/ai-limits";
import {
  looksLikeFakeToolCall,
  stripThinking,
} from "@/features/ai/utils/clean-output";
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
  //Who sent it: the agent runs on this user's model and key
  userId: string;
}

export const processMessage = inngest.createFunction(
  {
    id: "process-message",
    triggers: {
      event: "message/sent",
    },
    //Caps how many agent runs (each billed to the sender's key) one user has in flight
    concurrency: [
      { key: "event.data.userId", limit: AI_LIMITS.agentConcurrencyPerUser },
    ],
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
    const { messageId, conversationId, message, projectId, userId } =
      event.data as MessageEvent;

    const internalKey = process.env.ANUBITHIC_STUDIO_CONVEX_INTERNAL_KEY;

    if (!internalKey) {
      throw new NonRetriableError("Internal key not configured");
    }

    // Ends the run with a plain explanation instead of the generic failure message.
    const finishWithMessage = async (content: string, errorCode?: "no_key") => {
      await step.run("finish-with-message", async () => {
        await convex.mutation(api.system.updateMessageContent, {
          internalKey,
          messageId,
          content,
          status: "completed",
          errorCode,
        });
      });
      return { success: false, messageId, conversationId };
    };

    if (!userId) {
      throw new NonRetriableError("Message event has no userId");
    }

    // Safe to store in Inngest: a model id and a yes/no, never the key itself.
    // The whole definition is stored: a local model only exists in the user's settings.
    const { definition, hasKey } = await step.run(
      "load-model-choice",
      async () => {
        const model = await getChosenModel(userId);
        return {
          definition: model,
          hasKey: await hasProviderKey(userId, model.provider),
        };
      },
    );

    if (!hasKey) {
      return finishWithMessage(
        new NoKeyError(definition.provider).message,
        "no_key",
      );
    }

    if (!definition.supportsTools) {
      return finishWithMessage(
        `${definition.label} can't call tools, so it can't edit your files. Pick a model with tool support to use the coding agent.`,
      );
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

    const historyText = recentMessages
      .filter((msg) => msg._id !== messageId && msg.content.trim() !== "")
      .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
      .join("\n\n");

    const systemPrompt = buildCodingAgentPrompt(
      definition.promptProfile,
      historyText,
    );

    // 1- [Agent] generate title
    const shouldGenerateTitle =
      conversation.title === DEFAULT_CONVERSATION_TITLE;

    if (shouldGenerateTitle) {
      const titleAgent = createAgent({
        name: "title-generator",
        system: TITLE_GENERATOR_SYSTEM_PROMPT,
        // Roomy token budget: reasoning models spend tokens thinking before the few-word title
        model: createAgentModel(
          definition,
          { userId, projectId, runId: messageId },
          {
            maxTokens: 1024,
            temperature: 0.3,
          },
        ),
      });
      const { output } = await titleAgent.run(message, { step });

      const textMessage = output.find(
        (m) => m.type === "text" && m.role === "assistant",
      );

      if (textMessage?.type === "text") {
        const title = stripThinking(
          typeof textMessage.content === "string"
            ? textMessage.content
            : textMessage.content.map((c) => c.text).join(""),
        );

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

    //2- [Agent] coding
    const codingAgent = createAgent({
      name: "anubithic-studio",
      description: "An expert AI coding assistant",
      system: systemPrompt,
      model: createAgentModel(
        definition,
        { userId, projectId, runId: messageId },
        {
          maxTokens: 16000,
          temperature: 0.3,
        },
      ),
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
        // A call that returned nothing (provider error): retrying just repeats it, up to maxIter times
        if (lastResult && !hasTextResponse && !hasToolCalls) {
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
      assistantResponse = stripThinking(
        typeof textMessage.content === "string"
          ? textMessage.content
          : textMessage.content.map((c) => c.text).join(""),
      );
    }

    // Small models may print a made-up tool call instead of answering: ask once more, no tools
    if (looksLikeFakeToolCall(assistantResponse)) {
      const plainAgent = createAgent({
        name: "plain-reply",
        system: historyText
          ? `${PLAIN_REPLY_SYSTEM_PROMPT}\n\nRecent conversation:\n${historyText}`
          : PLAIN_REPLY_SYSTEM_PROMPT,
        model: createAgentModel(
          definition,
          { userId, projectId, runId: messageId },
          { maxTokens: 1024, temperature: 0.3 },
        ),
      });
      const { output } = await plainAgent.run(message, { step });
      const plain = output.find(
        (m) => m.type === "text" && m.role === "assistant",
      );
      const plainText =
        plain?.type === "text"
          ? stripThinking(
              typeof plain.content === "string"
                ? plain.content
                : plain.content.map((c) => c.text).join(""),
            )
          : "";

      assistantResponse =
        plainText && !looksLikeFakeToolCall(plainText)
          ? plainText
          : `${definition.label} couldn't answer this properly. Small models often struggle with the agent: try a 7B model or larger, like qwen2.5-coder:7b.`;
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
