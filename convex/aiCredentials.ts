import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { getProjectRole, verifyAuth } from "./auth";
import { aiKeyProvider } from "./aiKeyProviders";
import { validateAiCredentialsKey } from "./serverCredentials";

//#region AI credential functions (server-only)
//Every function needs AI_CREDENTIALS_CONVEX_KEY, which only the Next.js server holds —
//the general internal key cannot reach these. On top of that:
//  - WRITES (saveKey, saveLocalModel) also need the user's own Clerk session: the owner
//    comes from ctx.auth, never from an argument, so the server credential alone
//    cannot write another user's key or local-model URL.
//  - READS take a userId because the agent proxy has no user session (Inngest calls it);
//    its userId comes from a signed proxy token.
//  - Nothing here lists keys across users; that needs the rotation key (aiKeyRotation.ts).
//#endregion

const encryptedFields = {
  ciphertext: v.string(),
  iv: v.string(),
  authTag: v.string(),
  keyVersion: v.number(),
};

export const saveKey = mutation({
  args: {
    credentialsKey: v.string(),
    provider: aiKeyProvider,
    last4: v.string(),
    ...encryptedFields,
  },
  handler: async (ctx, { credentialsKey, ...key }) => {
    validateAiCredentialsKey(credentialsKey);
    const { subject: userId } = await verifyAuth(ctx);

    if (key.last4.length !== 4) throw new Error("Invalid last4");

    const existing = await ctx.db
      .query("aiKeys")
      .withIndex("by_user_provider", (q) =>
        q.eq("userId", userId).eq("provider", key.provider),
      )
      .unique();

    const now = Date.now();
    //replace() drops the old ciphertext in the same transaction: the previous key is gone
    if (existing) {
      await ctx.db.replace("aiKeys", existing._id, {
        userId,
        ...key,
        createdAt: now,
      });
    } else {
      await ctx.db.insert("aiKeys", { userId, ...key, createdAt: now });
    }

    await ctx.db.insert("aiKeyAudit", {
      userId,
      provider: key.provider,
      action: existing ? "replaced" : "saved",
      actor: "user",
      keyVersion: key.keyVersion,
      at: now,
    });
  },
});

export const getKey = query({
  args: {
    credentialsKey: v.string(),
    userId: v.string(),
    provider: aiKeyProvider,
  },
  handler: async (ctx, { credentialsKey, userId, provider }) => {
    validateAiCredentialsKey(credentialsKey);

    const key = await ctx.db
      .query("aiKeys")
      .withIndex("by_user_provider", (q) =>
        q.eq("userId", userId).eq("provider", provider),
      )
      .unique();

    return key
      ? {
          ciphertext: key.ciphertext,
          iv: key.iv,
          authTag: key.authTag,
          keyVersion: key.keyVersion,
        }
      : null;
  },
});

//"Last used" in the keys panel. Throttled to one write a minute.
export const markKeyUsed = mutation({
  args: {
    credentialsKey: v.string(),
    userId: v.string(),
    provider: aiKeyProvider,
  },
  handler: async (ctx, { credentialsKey, userId, provider }) => {
    validateAiCredentialsKey(credentialsKey);

    const key = await ctx.db
      .query("aiKeys")
      .withIndex("by_user_provider", (q) =>
        q.eq("userId", userId).eq("provider", provider),
      )
      .unique();

    const now = Date.now();
    if (key && now - (key.lastUsedAt ?? 0) > 60_000) {
      await ctx.db.patch("aiKeys", key._id, { lastUsedAt: now });
    }
  },
});

export const getSettings = query({
  args: { credentialsKey: v.string(), userId: v.string() },
  handler: async (ctx, { credentialsKey, userId }) => {
    validateAiCredentialsKey(credentialsKey);

    return await ctx.db
      .query("userAiSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
  },
});

//Written by /api/ai-local after it reached the user's Ollama. The owner comes from the
//caller's Clerk session, so nobody can redirect another user's local model.
export const saveLocalModel = mutation({
  args: {
    credentialsKey: v.string(),
    ollamaBaseUrl: v.optional(v.string()),
    localModel: v.string(),
    localModelSupportsTools: v.boolean(),
    localModelParameterSize: v.optional(v.string()),
  },
  handler: async (ctx, { credentialsKey, ...local }) => {
    validateAiCredentialsKey(credentialsKey);
    const { subject: userId } = await verifyAuth(ctx);

    const settings = await ctx.db
      .query("userAiSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    //Connecting a local model also selects it, so it's used right away
    const modelId = `ollama/${local.localModel}`;

    if (settings) {
      await ctx.db.patch("userAiSettings", settings._id, {
        ...local,
        modelId,
        updatedAt: Date.now(),
      });
      return;
    }

    await ctx.db.insert("userAiSettings", {
      userId,
      ...local,
      modelId,
      updatedAt: Date.now(),
    });
  },
});

//Fixed-window counter; `key` is "<action>:<userId>[:<scope>]".
export const consumeRateLimit = mutation({
  args: {
    credentialsKey: v.string(),
    key: v.string(),
    limit: v.number(),
    windowMs: v.number(),
  },
  handler: async (ctx, { credentialsKey, key, limit, windowMs }) => {
    validateAiCredentialsKey(credentialsKey);

    const now = Date.now();
    const row = await ctx.db
      .query("rateLimits")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();

    if (!row || now - row.windowStart >= windowMs) {
      if (row) {
        await ctx.db.patch("rateLimits", row._id, {
          windowStart: now,
          count: 1,
        });
      } else {
        await ctx.db.insert("rateLimits", { key, windowStart: now, count: 1 });
      }
      return { ok: true, retryAfterMs: 0 };
    }

    if (row.count >= limit) {
      return { ok: false, retryAfterMs: row.windowStart + windowMs - now };
    }

    await ctx.db.patch("rateLimits", row._id, { count: row.count + 1 });
    return { ok: true, retryAfterMs: 0 };
  },
});

//#region consumeProxyToken
//Called by /api/ai-proxy for every request, after the token's signature was checked.
//The token is only honoured while ALL of these hold:
//  - the run (message) exists and belongs to the token's project (no cross-project reuse)
//  - the run is still "processing" (a finished or cancelled run kills its tokens)
//  - the token's user is still a member of the project
//  - the token has been used fewer than `maxUses` times (replay budget = Inngest retries)
//#endregion
export const consumeProxyToken = mutation({
  args: {
    credentialsKey: v.string(),
    jti: v.string(),
    userId: v.string(),
    projectId: v.string(),
    runId: v.string(),
    expiresAt: v.number(),
    maxUses: v.number(),
  },
  handler: async (ctx, args) => {
    validateAiCredentialsKey(args.credentialsKey);
    const now = Date.now();

    if (args.expiresAt <= now) return { ok: false as const, reason: "expired" };

    const messageId = ctx.db.normalizeId("messages", args.runId);
    const message = messageId ? await ctx.db.get("messages", messageId) : null;
    if (!message) return { ok: false as const, reason: "wrong_run" };
    if (message.projectId !== args.projectId) {
      return { ok: false as const, reason: "wrong_project" };
    }
    if (message.status !== "processing") {
      return { ok: false as const, reason: "run_finished" };
    }

    const project = await ctx.db.get("projects", message.projectId);
    if (!project || !(await getProjectRole(ctx, project, args.userId))) {
      return { ok: false as const, reason: "not_member" };
    }

    const usage = await ctx.db
      .query("proxyTokenUses")
      .withIndex("by_jti", (q) => q.eq("jti", args.jti))
      .unique();

    if (usage) {
      if (usage.userId !== args.userId || usage.runId !== args.runId) {
        return { ok: false as const, reason: "wrong_run" };
      }
      if (usage.uses >= args.maxUses) {
        return { ok: false as const, reason: "replayed" };
      }
      await ctx.db.patch("proxyTokenUses", usage._id, { uses: usage.uses + 1 });
    } else {
      await ctx.db.insert("proxyTokenUses", {
        jti: args.jti,
        userId: args.userId,
        runId: args.runId,
        uses: 1,
        expiresAt: args.expiresAt,
      });
    }

    //Bounded cleanup of expired budgets
    const expired = await ctx.db
      .query("proxyTokenUses")
      .withIndex("by_expires", (q) => q.lt("expiresAt", now))
      .take(20);
    for (const row of expired) await ctx.db.delete("proxyTokenUses", row._id);

    return { ok: true as const };
  },
});

//Gemini 3 thought signatures (see src/features/ai/server/gemini-signatures.ts)
export const getGeminiSignatures = query({
  args: { credentialsKey: v.string(), keys: v.array(v.string()) },
  handler: async (ctx, { credentialsKey, keys }) => {
    validateAiCredentialsKey(credentialsKey);

    const found: Record<string, string> = {};
    for (const key of keys.slice(0, 100)) {
      const row = await ctx.db
        .query("geminiSignatures")
        .withIndex("by_key", (q) => q.eq("key", key))
        .first();
      if (row) found[key] = row.signature;
    }
    return found;
  },
});

export const saveGeminiSignatures = mutation({
  args: {
    credentialsKey: v.string(),
    userId: v.string(),
    entries: v.array(v.object({ key: v.string(), signature: v.string() })),
  },
  handler: async (ctx, { credentialsKey, userId, entries }) => {
    validateAiCredentialsKey(credentialsKey);

    const now = Date.now();
    for (const { key, signature } of entries.slice(0, 50)) {
      const existing = await ctx.db
        .query("geminiSignatures")
        .withIndex("by_key", (q) => q.eq("key", key))
        .first();
      if (existing) {
        await ctx.db.patch("geminiSignatures", existing._id, {
          signature,
          createdAt: now,
        });
      } else {
        await ctx.db.insert("geminiSignatures", {
          userId,
          key,
          signature,
          createdAt: now,
        });
      }
    }

    const stale = await ctx.db
      .query("geminiSignatures")
      .withIndex("by_user_created", (q) =>
        q.eq("userId", userId).lt("createdAt", now - 24 * 60 * 60 * 1000),
      )
      .take(50);
    for (const row of stale) await ctx.db.delete("geminiSignatures", row._id);
  },
});
