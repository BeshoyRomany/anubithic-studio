// Presence functions (heartbeat, leave, list)

import { v } from "convex/values";
import { mutation, query, QueryCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { verifyAuth, verifyProjectAccess } from "./auth";

//#region heartbeat
//Called by the browser (see "usePresenceHeartbeat") right away when the
//project opens or the active file changes, and then on an interval.
//
//Upserts the caller's single row for this project. Access is checked on every
//beat, so a contributor who was just removed stops showing up (their next beat
//throws instead of writing).
//#endregion
export const heartbeat = mutation({
  args: {
    projectId: v.id("projects"),
    fileId: v.optional(v.id("files")),
  },
  handler: async (ctx, args) => {
    const { identity } = await verifyProjectAccess(ctx, args.projectId);

    //Never trust the client's fileId blindly: it must be a file of THIS project
    //(otherwise the status bar could be made to show another project's file)
    let fileId: Id<"files"> | undefined = undefined;
    if (args.fileId) {
      const file = await ctx.db.get("files", args.fileId);
      if (file && file.projectId === args.projectId) {
        fileId = file._id;
      }
    }

    const existing = await ctx.db
      .query("presence")
      .withIndex("by_project_user", (q) =>
        q.eq("projectId", args.projectId).eq("userId", identity.subject),
      )
      .first();

    const lastSeenAt = Date.now();

    if (existing) {
      //patching "fileId: undefined" removes the field → "no file open"
      await ctx.db.patch("presence", existing._id, { fileId, lastSeenAt });
    } else {
      await ctx.db.insert("presence", {
        projectId: args.projectId,
        userId: identity.subject,
        fileId,
        lastSeenAt,
      });
    }

    //The server's clock: the client compares it with its own to measure the
    //skew, so "online" is decided in server time (see "usePresence")
    return lastSeenAt;
  },
});

//#region leave
//Best-effort cleanup when the user closes the project. Only needs "who am I" —
//not project access — so it still works if the project was just deleted or
//the user was just removed from it.
//#endregion
export const leave = mutation({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const identity = await verifyAuth(ctx);

    const existing = await ctx.db
      .query("presence")
      .withIndex("by_project_user", (q) =>
        q.eq("projectId", args.projectId).eq("userId", identity.subject),
      )
      .first();

    if (existing) {
      await ctx.db.delete("presence", existing._id);
    }
  },
});

//Build "src/components/button.tsx" by walking parentId up to the root
//(same approach as files.getFilePath; trees are shallow, so this is cheap)
const getFilePath = async (ctx: QueryCtx, file: Doc<"files">) => {
  const parts = [file.name];
  let parentId = file.parentId;

  while (parentId) {
    const parent: Doc<"files"> | null = await ctx.db.get("files", parentId);
    if (!parent) break;
    parts.unshift(parent.name);
    parentId = parent.parentId;
  }

  return parts.join("/");
};

//#region list (the presence status bar)
//Everyone with a presence row in this project, joined with their profile
//("users") and the name/path of the file they're on.
//
//Why return "lastSeenAt" instead of filtering stale rows here?
//A Convex query only re-runs when the data it read changes — not when time
//passes. If it filtered by Date.now(), a user who closed their laptop would
//stay "online" until someone else's heartbeat happened to re-run it. So the
//client filters with its own ticking clock (see "PresenceBar").
//#endregion
export const list = query({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    await verifyProjectAccess(ctx, args.projectId);

    const rows = await ctx.db
      .query("presence")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    return await Promise.all(
      rows.map(async (row) => {
        const user = await ctx.db
          .query("users")
          .withIndex("by_clerk_id", (q) => q.eq("clerkId", row.userId))
          .unique();

        //The file may have been deleted since the last heartbeat
        const file = row.fileId ? await ctx.db.get("files", row.fileId) : null;

        return {
          _id: row._id,
          userId: row.userId,
          lastSeenAt: row.lastSeenAt,
          name: user?.name,
          email: user?.email,
          imageUrl: user?.imageUrl,
          fileId: file?._id,
          fileName: file?.name,
          filePath: file ? await getFilePath(ctx, file) : undefined,
        };
      }),
    );
  },
});
