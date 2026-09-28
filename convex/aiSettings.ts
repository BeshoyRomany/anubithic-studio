import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { verifyAuth } from "./auth";
import {
  DEFAULT_MODEL_ID,
  getModelDefinition,
  LOCAL_MODEL_PREFIX,
} from "../src/features/ai/models";

//Client-facing: the signed-in user's chosen model and local model (null → defaults).
export const get = query({
  args: {},
  handler: async (ctx) => {
    const identity = await verifyAuth(ctx);

    const settings = await ctx.db
      .query("userAiSettings")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .unique();

    if (!settings) return null;

    const {
      modelId,
      ollamaBaseUrl,
      localModel,
      localModelSupportsTools,
      localModelParameterSize,
    } = settings;
    return {
      modelId,
      ollamaBaseUrl,
      localModel,
      localModelSupportsTools,
      localModelParameterSize,
    };
  },
});

//One choice for every AI feature: a registry model, or the user's connected local model.
export const setModel = mutation({
  args: { modelId: v.string() },
  handler: async (ctx, { modelId }) => {
    const identity = await verifyAuth(ctx);

    const settings = await ctx.db
      .query("userAiSettings")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .unique();

    if (!getModelDefinition(modelId, settings)) {
      throw new Error("Unknown model");
    }

    if (settings) {
      await ctx.db.patch("userAiSettings", settings._id, {
        modelId,
        updatedAt: Date.now(),
      });
      return;
    }

    await ctx.db.insert("userAiSettings", {
      userId: identity.subject,
      modelId,
      updatedAt: Date.now(),
    });
  },
});

//Disconnects the local model; if it was the chosen one, falls back to the default.
export const removeLocalModel = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await verifyAuth(ctx);

    const settings = await ctx.db
      .query("userAiSettings")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .unique();

    if (!settings) return;

    await ctx.db.patch("userAiSettings", settings._id, {
      modelId: settings.modelId.startsWith(LOCAL_MODEL_PREFIX)
        ? DEFAULT_MODEL_ID
        : settings.modelId,
      ollamaBaseUrl: undefined,
      localModel: undefined,
      localModelSupportsTools: undefined,
      localModelParameterSize: undefined,
      updatedAt: Date.now(),
    });
  },
});
