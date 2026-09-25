import { useMutation, useQuery } from "convex/react";

import { api } from "../../../../convex/_generated/api";
import { Doc, Id } from "../../../../convex/_generated/dataModel";
import { title } from "process";

export const useConversation = (id: Id<"conversations"> | null) => {
  return useQuery(api.conversations.getById, id ? { id } : "skip");
};

export const useMessages = (conversationId: Id<"conversations"> | null) => {
  return useQuery(
    api.conversations.getMessages,
    conversationId ? { conversationId } : "skip",
  );
};

export const useConversations = (projectId: Id<"projects">) => {
  return useQuery(api.conversations.getByProject, { projectId });
};

export const useCreateConversation = () => {
  return useMutation(api.conversations.create).withOptimisticUpdate(
    (localStore, args) => {
      const existingConversations = localStore.getQuery(
        api.conversations.getByProject,
        { projectId: args.projectId },
      );

      if (existingConversations !== undefined) {
        const now = Date.now();
        const newConversation: Doc<"conversations"> = {
          _id: crypto.randomUUID() as Id<"conversations">,
          _creationTime: now,
          projectId: args.projectId,
          title: args.title,
          updatedAt: now,
        };

        localStore.setQuery(
          api.conversations.getByProject,
          { projectId: args.projectId },
          [...existingConversations, newConversation],
        );
      }
    },
  );
};

//Removes the conversation (and its messages, server side).
//The optimistic update needs the projectId to find the cached list, so the
//caller passes it alongside the id — it is only used on the client.
export const useRemoveConversation = (projectId: Id<"projects">) => {
  return useMutation(api.conversations.remove).withOptimisticUpdate(
    (localStore, args) => {
      const existingConversations = localStore.getQuery(
        api.conversations.getByProject,
        { projectId },
      );

      if (existingConversations !== undefined) {
        localStore.setQuery(
          api.conversations.getByProject,
          { projectId },
          existingConversations.filter(
            (conversation) => conversation._id !== args.id,
          ),
        );
      }
    },
  );
};
