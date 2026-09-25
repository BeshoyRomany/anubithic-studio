// Projects functions (create)

import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { verifyAuth } from "./auth";

export const updateSettings = mutation({
  args: {
    projectId: v.id("projects"),
    settings: v.object({
      installCommand: v.optional(v.string()),
      devCommand: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const identity = await verifyAuth(ctx);

    const project = await ctx.db.get("projects", args.projectId);

    if (!project) {
      throw new Error("Project not found");
    }

    if (project.ownerId !== identity.subject) {
      throw new Error("Unauthorized to update this project");
    }

    await ctx.db.patch("projects", args.projectId, {
      settings: args.settings,
      updatedAt: Date.now(),
    });
  },
});

export const create = mutation({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await verifyAuth(ctx);

    //insert in "Convex" returns the ID primary key
    const projectId = await ctx.db.insert("projects", {
      name: args.name,
      ownerId: identity.subject,
      updatedAt: Date.now(),
    });

    console.log(projectId);

    return projectId;
  },
});

// #region getPartial Projects List
// Scenario:
// Fetch a limited, secure subset of projects owned exclusively by the authenticated user for sidebar navigation and quick
// lists, avoiding heavy full-table scans by utilizing the index.
//#endregion
export const getPartial = query({
  args: {
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await verifyAuth(ctx);

    return await ctx.db
      .query("projects")
      // Skip table scan and jump directly to the user's sorted data via the index
      // return -> the logged in user ownerId data only
      .withIndex("by_owner", (q) => q.eq("ownerId", identity.subject))
      .order("desc")
      .take(args.limit);
  },
});

export const get = query({
  args: {},
  handler: async (ctx) => {
    const identity = await verifyAuth(ctx);

    return await ctx.db
      .query("projects")
      // Skip table scan and jump directly to the user's sorted data via the index
      // return -> the logged in user ownerId data only
      .withIndex("by_owner", (q) => q.eq("ownerId", identity.subject))
      .order("desc")
      .collect();
  },
});

export const getById = query({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const identity = await verifyAuth(ctx);
    const project = await ctx.db.get("projects", args.projectId);

    if (!project) {
      throw new Error("Project not found!");
    }

    if (project.ownerId !== identity.subject) {
      throw new Error("Unauthorized access to this project");
    }

    return project;
  },
});

export const rename = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await verifyAuth(ctx);
    const project = await ctx.db.get("projects", args.projectId);

    if (!project) {
      throw new Error("Project not found!");
    }

    if (project.ownerId !== identity.subject) {
      throw new Error("Unauthorized access to this project");
    }

    await ctx.db.patch("projects", args.projectId, {
      name: args.name,
      updatedAt: Date.now(),
    });
  },
});

//#region Remove project (cascade delete)
//Deleting a project must also remove everything that hangs off it:
//  files (+ their binary blobs in Convex storage) → conversations → messages.
//
//Why two functions?
//A single Convex mutation is a transaction with read/write limits, and a big
//GitHub import can easily hold thousands of files. So "remove" (public) only
//authorizes, validates and deletes the project row itself — the UI updates
//instantly — then schedules "deleteProjectData" (internal, NOT callable from the
//browser) which deletes the children in small batches and re-schedules itself
//until nothing is left. Same batching idea as "system.cleanup" for imports.
//
//We refuse to delete while background work is still touching the project
//(an import, an export, or an agent message that is "processing"): those Inngest
//jobs would keep writing to rows that no longer exist and fail.
//#endregion
export const remove = mutation({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const identity = await verifyAuth(ctx);
    const project = await ctx.db.get("projects", args.projectId);

    if (!project) {
      throw new Error("Project not found!");
    }

    if (project.ownerId !== identity.subject) {
      throw new Error("Unauthorized access to this project");
    }

    if (project.importStatus === "importing") {
      throw new Error("Cannot delete a project while it is being imported");
    }

    if (project.exportStatus === "exporting") {
      throw new Error("Cannot delete a project while it is being exported");
    }

    const processingMessage = await ctx.db
      .query("messages")
      .withIndex("by_project_status", (q) =>
        q.eq("projectId", args.projectId).eq("status", "processing"),
      )
      .first();

    if (processingMessage) {
      throw new Error("Cannot delete a project while a message is processing");
    }

    await ctx.db.delete("projects", args.projectId);

    await ctx.scheduler.runAfter(0, internal.projects.deleteProjectData, {
      projectId: args.projectId,
    });
  },
});

const DELETE_BATCH_SIZE = 100;

export const deleteProjectData = internalMutation({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    //1- files (and their stored binaries)
    const files = await ctx.db
      .query("files")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .take(DELETE_BATCH_SIZE);

    for (const file of files) {
      if (file.storageId) {
        await ctx.storage.delete(file.storageId);
      }
      await ctx.db.delete("files", file._id);
    }

    //2- one conversation at a time: its messages first, then the conversation
    //itself once it has no messages left
    const conversation = await ctx.db
      .query("conversations")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first();

    if (conversation) {
      const messages = await ctx.db
        .query("messages")
        .withIndex("by_conversation", (q) =>
          q.eq("conversationId", conversation._id),
        )
        .take(DELETE_BATCH_SIZE);

      for (const message of messages) {
        await ctx.db.delete("messages", message._id);
      }

      if (messages.length < DELETE_BATCH_SIZE) {
        await ctx.db.delete("conversations", conversation._id);
      }
    }

    //Anything done this round? -> there may be more, run another batch
    if (files.length > 0 || conversation) {
      await ctx.scheduler.runAfter(0, internal.projects.deleteProjectData, {
        projectId: args.projectId,
      });
    }
  },
});
