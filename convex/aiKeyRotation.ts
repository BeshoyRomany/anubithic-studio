import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { validateAiRotationKey } from "./serverCredentials";

//#region Master-key rotation (operator only)
//Used by scripts/rotate-ai-keys.mts. Requires AI_KEY_ROTATION_CONVEX_KEY, which is set on
//the Convex deployment only for the duration of a rotation and never in the app runtime,
//so the running app has no way to list keys across users.
//Convex only ever sees ciphertext: decryption and re-encryption happen in the script.
//#endregion

export const countByVersion = query({
  args: { rotationKey: v.string() },
  handler: async (ctx, { rotationKey }) => {
    validateAiRotationKey(rotationKey);

    const counts: Record<string, number> = {};
    for await (const row of ctx.db.query("aiKeys")) {
      counts[row.keyVersion] = (counts[row.keyVersion] ?? 0) + 1;
    }
    return counts;
  },
});

export const listByVersion = query({
  args: {
    rotationKey: v.string(),
    keyVersion: v.number(),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, { rotationKey, keyVersion, cursor }) => {
    validateAiRotationKey(rotationKey);

    const page = await ctx.db
      .query("aiKeys")
      .withIndex("by_key_version", (q) => q.eq("keyVersion", keyVersion))
      .paginate({ cursor, numItems: 50 });

    return {
      ...page,
      page: page.page.map((row) => ({
        id: row._id,
        userId: row.userId,
        provider: row.provider,
        ciphertext: row.ciphertext,
        iv: row.iv,
        authTag: row.authTag,
        keyVersion: row.keyVersion,
      })),
    };
  },
});

//Compare-and-swap: only replaces the row if it still holds exactly the ciphertext the
//script decrypted. A key the user replaced or deleted meanwhile is left alone.
export const rewrap = mutation({
  args: {
    rotationKey: v.string(),
    id: v.id("aiKeys"),
    expectedCiphertext: v.string(),
    expectedKeyVersion: v.number(),
    ciphertext: v.string(),
    iv: v.string(),
    authTag: v.string(),
    keyVersion: v.number(),
  },
  handler: async (ctx, args) => {
    validateAiRotationKey(args.rotationKey);

    const row = await ctx.db.get("aiKeys", args.id);
    if (
      !row ||
      row.ciphertext !== args.expectedCiphertext ||
      row.keyVersion !== args.expectedKeyVersion
    ) {
      return { status: "skipped_changed" as const };
    }

    await ctx.db.patch("aiKeys", args.id, {
      ciphertext: args.ciphertext,
      iv: args.iv,
      authTag: args.authTag,
      keyVersion: args.keyVersion,
    });
    await ctx.db.insert("aiKeyAudit", {
      userId: row.userId,
      provider: row.provider,
      action: "rewrapped",
      actor: "rotation",
      keyVersion: args.keyVersion,
      at: Date.now(),
    });
    return { status: "rewrapped" as const };
  },
});
