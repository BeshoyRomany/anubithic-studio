import { z } from "zod";
import { createTool } from "@inngest/agent-kit";
import { firecrawl } from "@/lib/firecrawl";
import { convex } from "@/lib/convex-client";
import { Id } from "../../../../../convex/_generated/dataModel";
import { api } from "../../../../../convex/_generated/api";
interface ScrapingUrlsToolOptions {
  internalKey: string;
  messageId: Id<"messages">;
}

const paramsSchema = z.object({
  urls: z
    .array(z.url("Invalid URL format"))
    .min(1, "Provide at least one URL to scrape"),
});

export const createScrapeUrlsTool = ({
  internalKey,
  messageId,
}: ScrapingUrlsToolOptions) => {
  return createTool({
    name: "scrapeUrls",
    description:
      "Scrape content from URLs to get documentation or reference material. Use this when the user provides URLs or references external documentation. Returns markdown content from the scraped pages.",
    parameters: z.object({
      urls: z.array(z.string()).describe("Array of URLs to scrape for content"),
    }),
    handler: async (params, { step: toolStep }) => {
      const parsed = paramsSchema.safeParse(params);
      if (!parsed.success) {
        return `Error: ${parsed.error.issues[0].message}`;
      }

      const { urls } = parsed.data;

      return await toolStep?.run("scrape-urls", async () => {
        const results: { url: string; content: string }[] = [];
        const stepId = crypto.randomUUID();

        //update the step state in the database
        await convex.mutation(api.system.addMessageStep, {
          internalKey,
          messageId,
          stepId,
          label: `Scraping urls...`,
        });

        try {
          for (const url of urls) {
            try {
              const result = await firecrawl.scrapeUrl(url, {
                formats: ["markdown"],
              });

              if (result && result.success && result.markdown) {
                results.push({
                  url,
                  content: result.markdown,
                });
              }
            } catch {
              results.push({
                url,
                content: `Failed to scrape URL: ${url}`,
              });
            }
          }

          if (results.length === 0) {
            return "No content could be scraped from the provided URLs.";
          }

          //update the step if it successes
          await convex.mutation(api.system.completeMessageStep, {
            internalKey,
            messageId,
            stepId,
          });

          return JSON.stringify(results);
        } catch (error) {
          // fail in any runtime error
          await convex.mutation(api.system.failMessageStep, {
            internalKey,
            messageId,
            stepId,
          });
          return `Error scraping URLs: ${error instanceof Error ? error.message : "Unknown error"}`;
        }
      });
    },
  });
};
