import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { verifyAuth, verifyProjectAccess } from "./auth";

//Create conversation
export const create = mutation({
  args: {
    projectId: v.id("projects"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    //Owner or active contributor of the project
    await verifyProjectAccess(ctx, args.projectId);

    //insert return an Id, and we gonna using it in the front end to select the active conversion
    const conversationId = await ctx.db.insert("conversations", {
      projectId: args.projectId,
      title: args.title,
      updatedAt: Date.now(),
    });

    return conversationId;
  },
});

//Get conversation by -> id
export const getById = query({
  args: {
    id: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    await verifyAuth(ctx);

    //get the conversation
    const conversation = await ctx.db.get("conversations", args.id);

    if (!conversation) {
      throw new Error("Conversation not found");
    }

    //the caller must own or contribute to the conversation's project
    await verifyProjectAccess(ctx, conversation.projectId);

    return conversation;
  },
});

//Get all the conversations that belong to this project
export const getByProject = query({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    //Owner or active contributor of the project
    await verifyProjectAccess(ctx, args.projectId);

    //query all the conversation for this specific project Id
    return await ctx.db
      .query("conversations")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect();
  },
});

//Get all the messages that belong to this conversation
export const getMessages = query({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    await verifyAuth(ctx);

    const conversation = await ctx.db.get("conversations", args.conversationId);

    if (!conversation) {
      throw new Error("Conversation not found");
    }

    await verifyProjectAccess(ctx, conversation.projectId);

    //query all the messages for this specific conversation id
    return await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .order("asc")
      .collect();
  },
});

//#region Remove conversation
//Deletes a conversation AND every message that belongs to it (cascade delete).
//Convex has no foreign-key cascades, so we collect the messages through the
//"by_conversation" index and delete them one by one inside the same mutation —
//a mutation is a transaction, so either everything is removed or nothing is.
//
//We refuse to delete while a message is still "processing": the Inngest
//"processMessage" job would keep patching rows that no longer exist and fail.
//The user must cancel (or wait for) the running request first.
//#endregion
export const remove = mutation({
  args: {
    id: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    await verifyAuth(ctx);

    const conversation = await ctx.db.get("conversations", args.id);

    if (!conversation) {
      throw new Error("Conversation not found");
    }

    await verifyProjectAccess(ctx, conversation.projectId);

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.id))
      .collect();

    if (messages.some((message) => message.status === "processing")) {
      throw new Error(
        "Cannot delete a conversation while a message is processing",
      );
    }

    for (const message of messages) {
      await ctx.db.delete("messages", message._id);
    }

    await ctx.db.delete("conversations", args.id);
  },
});
