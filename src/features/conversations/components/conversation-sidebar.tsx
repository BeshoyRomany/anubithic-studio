import ky from "ky";
import { toast } from "sonner";
import { useState } from "react";
import { CopyIcon, HistoryIcon, LoaderIcon, PlusIcon } from "lucide-react";
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

interface ConversationSidebarProps {
  projectId: Id<"projects">;
}

export const ConversationSidebar = ({
  projectId,
}: ConversationSidebarProps) => {
  //states
  const [selectedConversationId, setSelectedConversationIds] =
    useState<Id<"conversations"> | null>(null);

  const [input, setInput] = useState<string>("");

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

  //Hooks
  const createConversation = useCreateConversation();
  const handleCreateConversation = async () => {
    try {
      const newConversationId = await createConversation({
        projectId,
        title: DEFAULT_CONVERSATION_TITLE,
      });
      setSelectedConversationIds(newConversationId);
      return newConversationId;
    } catch (error) {
      toast.error("Unable to create a new conversation!");
      return null;
    }
  };

  const handleSubmit = async (message: PromptInputMessage) => {
    //If processing and no new message, this is just a stop function
    if (isProcessing && !message.text) {
      //TODO: Handle cancel
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
    <div className="flex flex-col h-full bg-sidebar">
      <div className="h-8.75 flex items-center justify-between border-b">
        <div className="text-sm truncate pl-3">
          {activeConversation?.title ?? DEFAULT_CONVERSATION_TITLE}
        </div>
        <div className="flex items-centers px-1 gap-1">
          <Button variant="highlight" size="icon-xs">
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
          {conversationMessages?.map((message, messageIndex) => (
            <Message key={message._id} from={message.role}>
              <MessageContent>
                {message.status === "processing" ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <LoaderIcon className="size-4 animate-spin" />
                    <span>Thinking...</span>
                  </div>
                ) : (
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
          ))}
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
  );
};
