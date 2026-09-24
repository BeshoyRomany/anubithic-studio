// src/inngest/functions.ts
import { inngest } from "./client";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";
// import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { firecrawl } from "@/lib/firecrawl";
import { sentryMiddleware } from "@inngest/middleware-sentry";

const URL_REGEX = /https?:\/\/[^\s]+/g;

export const googleGenerate = inngest.createFunction(
  { id: "google-generate", triggers: { event: "google/generate" }, retries: 0 },

  //Steps
  //1- extract all the urls from the user prompt
  //2- scrape these urls using firecrawl to extract the plain text as a markdown to filter & join them.
  //3- combine all as a final prompt to send it to the model

  async ({ event, step }) => {
    const { prompt } = event.data as { prompt: string };
    //extract the urls form the prompt
    const urls = (await step.run("extract-urls", async () => {
      return prompt.match(URL_REGEX) ?? [];
    })) as string[];

    //scrap the urls content
    const scrapedContent = await step.run("scrape-url", async () => {
      const results = await Promise.all(
        urls.map(async (url) => {
          const result = await firecrawl.scrapeUrl(url, {
            formats: ["markdown"],
          });
          return result.success ? result.markdown : null;
        }),
      );
      // #region Filter and Join Logic Explanation
      // 1. results.filter(Boolean):
      // Filters out any null, undefined, or empty values from the array,
      // leaving only valid strings (e.g., removing failed scrape results).

      // 2. .join("\n\n"):
      // Combines all the valid text items into a single long string,
      // adding two empty lines as a separator between each element.
      // #endregion
      return results.filter(Boolean).join("\n\n");
    });

    // #region Final Prompt Assembly Explanation
    // The user prompt is the original text written by the user (e.g., "Summarize this link").
    // Firecrawl fetches the actual text content of the page into "scrapedContent".
    // We combine them into finalPrompt so the AI gets both:
    // 1. The Context (the raw text fetched by Firecrawl).
    // 2. The Question (what the user originally asked to do with it).
    // #endregion
    const finalPrompt = scrapedContent
      ? `Context:\n${scrapedContent}\n\nQuestion: ${prompt}`
      : prompt;

    await step.run("google-generate", async () => {
      return await generateText({
        model: google("gemini-3.5-flash"),
        prompt: finalPrompt,
        experimental_telemetry: {
          isEnabled: true,
          recordInputs: true,
          recordOutputs: true,
        },
      });
    });
  },
);

export const anthropicGenerate = inngest.createFunction(
  {
    id: "anthropic-generate",
    triggers: { event: "anthropic-generate" },
    retries: 3,
  },
  async ({ step }) => {
    // await step.run("anthropic-generate", async () => {
    //   return await generateText({
    //     model: anthropic("claude-haiku-4-5"),
    //     prompt: "Write a vegetarian lasagna recipe for 4 people.",
    //     experimental_telemetry: {
    //       isEnabled: true,
    //       recordInputs: true,
    //       recordOutputs: true,
    //     },
    //   });
    // });

    await step.run("openai-generate", async () => {
      return await generateText({
        model: openai("gpt-4.1-mini"),
        prompt: "Write a vegetarian lasagna recipe for 4 people.",
        experimental_telemetry: {
          isEnabled: true,
          recordInputs: true,
          recordOutputs: true,
        },
      });
    });
  },
);

export const demoError = inngest.createFunction(
  {
    id: "demo-error",
    triggers: { event: "demo/error" },
    retries: 1,
  },
  async ({ step }) => {
    await step.run("fail", async () => {
      throw new Error("Inngest error: Background job failed!");
    });
  },
);
