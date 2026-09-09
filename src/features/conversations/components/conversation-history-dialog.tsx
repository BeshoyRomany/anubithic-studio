"use client";

import { formatDistanceToNow } from "date-fns";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

import { useConversations } from "@/features/conversations/hooks/use-conversation";

import { Id } from "../../../../convex/_generated/dataModel";

interface ConversationsHistoryDialogProps {
  projectId: Id<"projects">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (conversationId: Id<"conversations">) => void;
}

export const ConversationsHistoryDialog = ({
  projectId,
  open,
  onOpenChange,
  onSelect,
}: ConversationsHistoryDialogProps) => {
  const conversations = useConversations(projectId);

  const handleSelect = (conversationId: Id<"conversations">) => {
    onSelect(conversationId);
    onOpenChange(false);
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
              <div className="flex flex-col gap-0.5">
                <span>{conversation.title}</span>
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(conversation._creationTime, {
                    addSuffix: true,
                  })}
                </span>
              </div>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
};
