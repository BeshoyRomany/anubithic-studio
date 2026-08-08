// src/inngest/functions.ts
import { inngest } from "./client";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { anthropic } from "@ai-sdk/anthropic";

export const anthropicGenerate = inngest.createFunction(
  {
    id: "anthropic-generate",
    triggers: { event: "anthropic-generate" },
    retries: 3,
  },
  async ({ step }) => {
    await step.run("anthropic-generate", async () => {
      return await generateText({
        model: anthropic("claude-haiku-4-5"),
        prompt: "Write a vegetarian lasagna recipe for 4 people.",
      });
    });
  },
);

export const googleGenerate = inngest.createFunction(
  { id: "google-generate", triggers: { event: "google/generate" }, retries: 3 },
  async ({ step }) => {
    await step.run("google-generate", async () => {
      await generateText({
        model: google("gemini-3.5-flash"),
        prompt: "Write a vegetarian lasagna recipe for 4 people.",
      });
    });
  },
);
