import { v } from "convex/values";

//Cloud providers a user can store a key for (local Ollama needs none).
//Mirrors the cloud providers in src/features/ai/models.ts.
export const aiKeyProvider = v.union(
  v.literal("anthropic"),
  v.literal("openai"),
  v.literal("google"),
  v.literal("deepseek"),
  v.literal("qwen"),
);
