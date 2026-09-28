import { mutation, query } from "./_generated/server";
import { verifyAuth } from "./auth";
import { aiKeyProvider } from "./aiKeyProviders";

//Client-facing: returns what the keys panel shows, never the ciphertext.
//Saving goes through /api/ai-keys (it must encrypt first), so there is no public "save".
export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await verifyAuth(ctx);

    const keys = await ctx.db
      .query("aiKeys")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .collect();

    return keys.map(({ provider, last4, createdAt, lastUsedAt }) => ({
      provider,
      last4,
      createdAt,
      lastUsedAt,
    }));
  },
});

export const remove = mutation({
  args: { provider: aiKeyProvider },
  handler: async (ctx, { provider }) => {
    const identity = await verifyAuth(ctx);

    const key = await ctx.db
      .query("aiKeys")
      .withIndex("by_user_provider", (q) =>
        q.eq("userId", identity.subject).eq("provider", provider),
      )
      .unique();

    //Deleted in this transaction; every AI request re-reads the row, so the key stops
    //working for the next request (nothing caches decrypted keys)
    if (key) {
      await ctx.db.delete("aiKeys", key._id);
      await ctx.db.insert("aiKeyAudit", {
        userId: identity.subject,
        provider,
        action: "deleted",
        actor: "user",
        keyVersion: key.keyVersion,
        at: Date.now(),
      });
    }
  },
});
