"use client";

import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Trash2Icon } from "lucide-react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";

import {
  useConversations,
  useRemoveConversation,
} from "@/features/conversations/hooks/use-conversation";

import { Id } from "../../../../convex/_generated/dataModel";

interface ConversationsHistoryDialogProps {
  projectId: Id<"projects">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (conversationId: Id<"conversations">) => void;
  onRemove: (conversationId: Id<"conversations">) => void;
}

export const ConversationsHistoryDialog = ({
  projectId,
  open,
  onOpenChange,
  onSelect,
  onRemove,
}: ConversationsHistoryDialogProps) => {
  const conversations = useConversations(projectId);
  const removeConversation = useRemoveConversation(projectId);

  const handleSelect = (conversationId: Id<"conversations">) => {
    onSelect(conversationId);
    onOpenChange(false);
  };

  const handleRemove = async (conversationId: Id<"conversations">) => {
    try {
      await removeConversation({ id: conversationId });
      //let the sidebar drop its selection if it was pointing at this conversation
      onRemove(conversationId);
    } catch {
      toast.error(
        "Unable to delete the conversation. Cancel any running request first.",
      );
    }
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Conversations history"
      description="Search and select from the history conversations"
    >
      <CommandInput placeholder="Search conversations..." />
      <CommandList>
        <CommandEmpty>No conversations found.</CommandEmpty>
        <CommandGroup heading="Conversations">
          {conversations?.map((conversation) => (
            <CommandItem
              key={conversation._id}
              value={`${conversation.title}-${conversation._id}`}
              onSelect={() => handleSelect(conversation._id)}
            >
              <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                <span className="truncate">{conversation.title}</span>
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(conversation._creationTime, {
                    addSuffix: true,
                  })}
                </span>
              </div>
              {/* stopPropagation -> the click must not bubble up to the CommandItem,
                  otherwise cmdk would also "select" the conversation we are deleting */}
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Delete conversation ${conversation.title}`}
                className="shrink-0 text-muted-foreground hover:text-destructive"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemove(conversation._id);
                }}
              >
                <Trash2Icon className="size-3.5" />
              </Button>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
};
