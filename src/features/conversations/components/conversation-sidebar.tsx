import ky from "ky";
import { toast } from "sonner";
import { useState } from "react";
import {
  CheckIcon,
  CopyIcon,
  HistoryIcon,
  LoaderIcon,
  PlusIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
  MessageActions,
  MessageAction,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";

import { Button } from "@/components/ui/button";
import { Id } from "../../../../convex/_generated/dataModel";

import {
  useConversation,
  useConversations,
  useCreateConversation,
  useMessages,
} from "@/features/conversations/hooks/use-conversation";
import { DEFAULT_CONVERSATION_TITLE } from "../constants";
import { ConversationsHistoryDialog } from "./conversation-history-dialog";
import Image from "next/image";

interface ConversationSidebarProps {
  projectId: Id<"projects">;
}

// NEW: parses "***bold italic***" segments inside a step label and renders them accordingly
function renderStepLabel(label: string) {
  const parts = label.split(/(\*\*\*.*?\*\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("***") && part.endsWith("***") ? (
      <strong key={i} className="italic">
        {part.slice(3, -3)}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

export const ConversationSidebar = ({
  projectId,
}: ConversationSidebarProps) => {
  //states
  const [input, setInput] = useState<string>("");

  const [selectedConversationId, setSelectedConversationId] =
    useState<Id<"conversations"> | null>(null);

  const [conversationsHistoryOpen, setConversationsHistoryOpen] =
    useState(false);

  //Hooks -> fetch all the conversations
  const conversations = useConversations(projectId);

  //Computing -> to set active conversation id
  const activeConversationId =
    (selectedConversationId ?? conversations?.[0]?._id) || null;

  //Hooks -> fetch the individual active conversation by id
  const activeConversation = useConversation(activeConversationId);
  //Hooks -> fetch the individual active conversation by id
  const conversationMessages = useMessages(activeConversationId);

  //Computing -> check if any message is currently processing -> if one message still "processing"
  //the user will not be able to send a new message -- he can only cancel
  const isProcessing = conversationMessages?.some(
    (msg) => msg.status === "processing",
  );

  //handel cancel processing message background job
  const handleCancel = async () => {
    try {
      await ky.post("/api/messages/cancel", {
        json: { projectId },
      });
    } catch {
      toast.error("Unable to cancel request");
    }
  };
  //Hooks
  const createConversation = useCreateConversation();
  const handleCreateConversation = async () => {
    try {
      const newConversationId = await createConversation({
        projectId,
        title: DEFAULT_CONVERSATION_TITLE,
      });
      setSelectedConversationId(newConversationId);
      return newConversationId;
    } catch (error) {
      toast.error("Unable to create a new conversation!");
      return null;
    }
  };

  const handleSubmit = async (message: PromptInputMessage) => {
    //If processing and no new message, this is just a stop function
    if (isProcessing && !message.text) {
      await handleCancel();
      setInput("");
      return;
    }

    // If no active conversation exists, create a new one on the fly before sending the message
    let conversationId = activeConversationId;

    if (!conversationId) {
      conversationId = await handleCreateConversation();
      if (!conversationId) {
        return;
      }
    }

    //Trigger inngest function via API
    try {
      await ky.post("/api/messages", {
        json: {
          conversationId,
          message: message.text,
        },
      });
    } catch {
      toast.error("Message Failed to send");
    }
    setInput("");
  };

  return (
    <>
      <ConversationsHistoryDialog
        projectId={projectId}
        open={conversationsHistoryOpen}
        onOpenChange={setConversationsHistoryOpen}
        onSelect={setSelectedConversationId}
      />
      <div className="flex flex-col h-full bg-sidebar">
        <div className="h-8.75 flex items-center justify-between border-b">
          <div className="text-sm truncate pl-3">
            {activeConversation?.title ?? DEFAULT_CONVERSATION_TITLE}
          </div>
          <div className="flex items-centers px-1 gap-1">
            <Button
              variant="highlight"
              size="icon-xs"
              onClick={() => setConversationsHistoryOpen(true)}
            >
              <HistoryIcon size="size-3.5" />
            </Button>
            <Button
              variant="highlight"
              size="icon-xs"
              onClick={handleCreateConversation}
            >
              <PlusIcon size="size-3.5" />
            </Button>
          </div>
        </div>
        <Conversation className="flex-1">
          <ConversationContent>
            {conversationMessages?.map((message, messageIndex) => {
              const hasSteps = message.steps && message.steps.length > 0;
              const hasRunningStep = message.steps?.some(
                (s) => s.status === "running",
              );
              const isMessageProcessing = message.status === "processing";

              const showInitialThinking = isMessageProcessing && !hasSteps;
              const showGapIndicator =
                isMessageProcessing && hasSteps && !hasRunningStep;

              return (
                <Message key={message._id} from={message.role}>
                  <MessageContent>
                    {hasSteps && (
                      <div className="flex flex-col gap-1 mb-2">
                        {message.steps!.map((step) => (
                          <div
                            key={step.id}
                            className="flex items-center gap-2 text-sm text-muted-foreground"
                          >
                            {step.status === "running" ? (
                              <LoaderIcon className="size-3.5 shrink-0 animate-spin" />
                            ) : step.status === "error" ? (
                              <XIcon className="size-3.5 shrink-0 text-red-500" />
                            ) : (
                              <CheckIcon className="size-3.5 shrink-0 text-green-500" />
                            )}
                            <span>{renderStepLabel(step.label)}</span>
                            {step.completedAt && (
                              <span className="text-xs shrink-0">
                                (
                                {(
                                  (step.completedAt - step.startedAt) /
                                  1000
                                ).toFixed(1)}
                                s)
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {showInitialThinking && (
                      <div
                        key="processing-state"
                        className="flex items-center gap-2 text-muted-foreground"
                      >
                        <LoaderIcon className="size-4 animate-spin" />
                        <span>{message.content}</span>
                      </div>
                    )}
                    {showGapIndicator && (
                      <div
                        key="gap-indicator"
                        className="flex items-center gap-2 text-muted-foreground"
                      >
                        <Image
                          src={"/anubithic-thinking.svg"}
                          alt="Anubithic/Studio"
                          className="animate-pulse opacity-100"
                          width={18}
                          height={18}
                        />
                        <span>Thinking...</span>
                      </div>
                    )}

                    {message.status === "cancelled" && (
                      <span className="text-muted-foreground italic">
                        Request cancelled
                      </span>
                    )}

                    {/* CHANGED: الشرط بقى عكسي - يعرض إلا لو processing أو cancelled */}
                    {!isMessageProcessing && message.status !== "cancelled" && (
                      <MessageResponse>{message.content}</MessageResponse>
                    )}
                  </MessageContent>

                  {message.role === "assistant" &&
                    message.status === "completed" &&
                    conversationMessages.length > 0 &&
                    messageIndex === conversationMessages.length - 1 && (
                      <MessageActions>
                        <MessageAction
                          onClick={() => {
                            navigator.clipboard.writeText(message.content);
                          }}
                          label="Copy"
                        >
                          <CopyIcon className="size-3" />
                        </MessageAction>
                      </MessageActions>
                    )}
                </Message>
              );
            })}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
        <div className="p-3">
          <PromptInput onSubmit={handleSubmit} className="mt-2">
            <PromptInputBody>
              <PromptInputTextarea
                placeholder="Ask Anubithic Studio anything..."
                onChange={(e) => setInput(e.target.value)}
                value={input}
                disabled={isProcessing}
              />
            </PromptInputBody>
            <PromptInputFooter>
              <PromptInputTools />
              <PromptInputSubmit
                // Keep submit enabled during processing so it acts as a cancel button
                disabled={isProcessing ? false : !input}
                status={isProcessing ? "streaming" : undefined}
              />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </div>
    </>
  );
};
