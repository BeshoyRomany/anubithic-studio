// Projects functions (create)

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { verifyAuth } from "./auth";

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
