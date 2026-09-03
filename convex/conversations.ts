import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { verifyAuth } from "./auth";

//Create conversation
export const create = mutation({
  args: {
    projectId: v.id("projects"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await verifyAuth(ctx);
    const project = await ctx.db.get("projects", args.projectId);

    if (!project) {
      throw new Error("Project not found");
    }

    if (project.ownerId !== identity.subject) {
      throw new Error("Unauthorized to access this project");
    }

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
    const identity = await verifyAuth(ctx);

    //get the conversation
    const conversation = await ctx.db.get("conversations", args.id);

    if (!conversation) {
      throw new Error("Conversation not found");
    }

    //get the project for the specific conversation
    const project = await ctx.db.get("projects", conversation.projectId);

    if (!project) {
      throw new Error("Project not found");
    }

    if (project.ownerId !== identity.subject) {
      throw new Error("Unauthorized to access this project");
    }

    return conversation;
  },
});

//Get all the conversations that belong to this project
export const getByProject = query({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const identity = await verifyAuth(ctx);

    const project = await ctx.db.get("projects", args.projectId);

    if (!project) {
      throw new Error("Project not found");
    }

    if (project.ownerId !== identity.subject) {
      throw new Error("Unauthorized to access this project");
    }

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
    const identity = await verifyAuth(ctx);

    const conversation = await ctx.db.get("conversations", args.conversationId);

    if (!conversation) {
      throw new Error("Conversation not found");
    }

    const project = await ctx.db.get("projects", conversation.projectId);

    if (!project) {
      throw new Error("Project not found");
    }

    if (project.ownerId !== identity.subject) {
      throw new Error("Unauthorized to access this project");
    }

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
