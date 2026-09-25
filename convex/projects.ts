// Projects functions (create)

import { v } from "convex/values";
import {
  internalMutation,
  mutation,
  query,
  QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { ProjectRole, verifyAuth, verifyProjectAccess } from "./auth";

export const updateSettings = mutation({
  args: {
    projectId: v.id("projects"),
    settings: v.object({
      installCommand: v.optional(v.string()),
      devCommand: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    //Contributors may change the preview commands too: they only run inside
    //each viewer's own in-browser WebContainer, never on a server
    await verifyProjectAccess(ctx, args.projectId);

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

// #region Projects list (owned + shared with me)
// Scenario:
// The home page / command palette list every project the user can open:
//   1- projects they OWN      → "by_owner" index on projects
//   2- projects SHARED with them → their ACTIVE "projectContributors" rows
//      ("by_user_status" index), then each project loaded by id
// Both lists are index-backed (no table scans), merged, and sorted newest
// first by _creationTime — the same order the "by_owner" index used to give.
//
// Every project carries the caller's "role" (owner / admin / contributor) so
// the UI can tell shared projects apart and hide actions they can't perform.
//
// "limit" (getPartial) caps each source before merging; the merged list is then
// cut to the limit again, so the result is still the newest N overall.
// #endregion
const listAccessibleProjects = async (
  ctx: QueryCtx,
  userId: string,
  limit?: number,
) => {
  const ownedQuery = ctx.db
    .query("projects")
    .withIndex("by_owner", (q) => q.eq("ownerId", userId))
    .order("desc");

  const owned =
    limit === undefined
      ? await ownedQuery.collect()
      : await ownedQuery.take(limit);

  //Memberships are few per user, so collecting them all is fine
  const memberships = await ctx.db
    .query("projectContributors")
    .withIndex("by_user_status", (q) =>
      q.eq("userId", userId).eq("status", "active"),
    )
    .collect();

  const shared = (
    await Promise.all(
      memberships.map(async (membership) => {
        const project = await ctx.db.get("projects", membership.projectId);
        //Their role on this project ("admin" or "contributor")
        return project
          ? { ...project, role: membership.role as ProjectRole }
          : null;
      }),
    )
  )
    //A project deleted a moment ago may still have a member row being cleaned up
    .filter((project) => project !== null);

  const projects = [
    ...owned.map((project) => ({ ...project, role: "owner" as ProjectRole })),
    ...shared,
  ].sort((a, b) => b._creationTime - a._creationTime);

  return limit === undefined ? projects : projects.slice(0, limit);
};

export const getPartial = query({
  args: {
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await verifyAuth(ctx);

    return await listAccessibleProjects(ctx, identity.subject, args.limit);
  },
});

export const get = query({
  args: {},
  handler: async (ctx) => {
    const identity = await verifyAuth(ctx);

    return await listAccessibleProjects(ctx, identity.subject);
  },
});

export const getById = query({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const { project, role } = await verifyProjectAccess(ctx, args.projectId);

    return { ...project, role };
  },
});

export const rename = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    //Renaming is a project-level action → owner or admin
    await verifyProjectAccess(ctx, args.projectId, { minimum: "admin" });

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
    //Only the owner can delete — not even an admin can wipe the owner's project
    const { project } = await verifyProjectAccess(ctx, args.projectId, {
      minimum: "owner",
    });

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

    //3- contributors / invites (a project has only a handful, one batch is plenty)
    const contributors = await ctx.db
      .query("projectContributors")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .take(DELETE_BATCH_SIZE);

    for (const contributor of contributors) {
      await ctx.db.delete("projectContributors", contributor._id);
    }

    //4- presence rows (one per user who had the project open)
    const presence = await ctx.db
      .query("presence")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .take(DELETE_BATCH_SIZE);

    for (const row of presence) {
      await ctx.db.delete("presence", row._id);
    }

    //Anything done this round? -> there may be more, run another batch
    if (
      files.length > 0 ||
      conversation ||
      contributors.length > 0 ||
      presence.length > 0
    ) {
      await ctx.scheduler.runAfter(0, internal.projects.deleteProjectData, {
        projectId: args.projectId,
      });
    }
  },
});
