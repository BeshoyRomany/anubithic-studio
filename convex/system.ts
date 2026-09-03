import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const validateInternalKey = (key: string) => {
  const internalKey = process.env.ANUBITHIC_STUDIO_CONVEX_INTERNAL_KEY;

  if (!internalKey) {
    throw new Error("Internal key not configured");
  }

  if (key !== internalKey) {
    throw new Error("Invalid internal key");
  }
};

/**
 * SECURITY NOTE: Internal System Query (`getConversationById`).
 *
 * 1. This function is completely isolated from the outside world and browser clients
 *    because external callers do not possess the required Internal Key.
 * 2. It can ONLY be invoked via our secure Next.js API Routes.
 * 3. Even if this endpoint or file is exposed, it remains safe because direct calls
 *    from unauthorized sources will fail. It relies strictly on server-to-server
 *    communication (e.g., verified third-party apps like Inngest through our API routes).
 */

export const getConversationById = query({
  args: {
    conversationId: v.id("conversations"),
    internalKey: v.string(),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey); //pass or break;
    return await ctx.db.get("conversations", args.conversationId);
  },
});

/**
 * SECURITY NOTE: Internal System Mutation (`createMessage`).
 *
 * 1. This function is NOT client-facing and cannot be called directly from the browser.
 * 2. It requires a valid `internalKey` to execute, ensuring database protection.
 * 3. It serves two main server-to-server entry points (via Next.js API Routes):
 *    - User Flow: The user submits a message from the browser to our API Route,
 *      which validates user auth (Clerk) and invokes this function with the internal key.
 *    - Assistant/AI Flow: Background workers (like Inngest) or AI streaming processes
 *      invoke our API Route to save the assistant's generated response using the internal key.
 */
export const createMessage = mutation({
  args: {
    internalKey: v.string(),
    conversationId: v.id("conversations"),
    projectId: v.id("projects"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    status: v.optional(
      v.union(
        v.literal("processing"),
        v.literal("completed"),
        v.literal("cancelled"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    const messageId = await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      projectId: args.projectId,
      role: args.role,
      content: args.content,
      status: args.status,
    });

    // Update conversation's updatedAt
    await ctx.db.patch(args.conversationId, {
      updatedAt: Date.now(),
    });

    return messageId;
  },
});

/**
 * SECURITY NOTE: Internal System Mutation (`updateMessageContent`).
 *
 * 1. This function is NOT client-facing and cannot be called directly from the browser.
 * 2. It requires a valid `internalKey` to execute, ensuring database protection.
 * 3. It serves server-to-server entry points (typically via Next.js API Routes or background workers like Inngest):
 *    - Assistant Streaming Flow: Background jobs process the AI stream, update the message content dynamically, and mark its status as "completed" using the internal key.
 */
export const updateMessageContent = mutation({
  args: {
    internalKey: v.string(),
    messageId: v.id("messages"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    await ctx.db.patch(args.messageId, {
      content: args.content,
      status: "completed" as const, // Enforce literal type using as const for schema compliance
    });
  },
});
