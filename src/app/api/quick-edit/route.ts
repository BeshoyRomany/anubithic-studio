import { generateText, Output } from "ai";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { firecrawl } from "@/lib/firecrawl";

import {
  quickEditAISchema,
  QuickEditRequestSchema,
} from "@/features/editor/schemas/quick-edit-schema";
import { buildQuickEditPrompt } from "@/features/ai/prompts/editor";
import { NoKeyError, resolveModel } from "@/features/ai/server/resolve-model";
import { cleanCodeOutput } from "@/features/ai/utils/clean-output";
import { AI_LIMITS } from "@/features/ai/server/ai-limits";
import { readJsonBody } from "@/features/ai/server/request-body";
import { logAiError } from "@/features/ai/server/safe-log";
import { rateLimit } from "@/lib/rate-limit";

const URL_REGEX = /https?:\/\/[^\s)>\]]+/g;

// Scrapes any URLs in the instruction into <doc url="…"> blocks for the prompt.
const scrapeDocumentation = async (instruction: string): Promise<string> => {
  const urls = instruction.match(URL_REGEX) ?? [];

  const scrapedResults = await Promise.all(
    urls.map(async (url) => {
      try {
        const result = await firecrawl.scrapeUrl(url, {
          formats: ["markdown"],
        });

        if (result && result.success && result.markdown) {
          return `<doc url="${url}">\n${result.markdown}\n</doc>`;
        }
        return null;
      } catch {
        return null;
      }
    }),
  );

  return scrapedResults.filter(Boolean).join("\n\n");
};

export async function POST(request: Request) {
  const context: { route: string; provider?: string; model?: string } = {
    route: "quick-edit",
  };
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const limits = AI_LIMITS.quickEdit;
    const body = await readJsonBody(request, limits.maxBodyBytes);
    if (!body.ok) {
      return NextResponse.json(
        { error: "Invalid request" },
        { status: body.status },
      );
    }

    const parsed = QuickEditRequestSchema.safeParse(body.value);

    if (!parsed.success || !parsed.data.selectedCode) {
      return NextResponse.json(
        { error: "Selected code is required" },
        { status: 400 },
      );
    }

    if (!parsed.data.instruction) {
      return NextResponse.json(
        { error: "Instruction is required" },
        { status: 400 },
      );
    }

    const limited = await rateLimit(`ai-quick-edit:${userId}`, {
      limit: limits.requestsPerWindow,
      windowMs: limits.windowMs,
    });
    if (limited) return limited;

    const { selectedCode, fullCode, instruction } = parsed.data;
    const { definition, languageModel } = await resolveModel(userId);
    context.provider = definition.provider;
    context.model = definition.apiModelId;

    const { output } = await generateText({
      model: languageModel,
      output: Output.object({ schema: quickEditAISchema }),
      prompt: buildQuickEditPrompt(definition.promptProfile, {
        selectedCode,
        fullCode,
        instruction,
        documentation: await scrapeDocumentation(instruction),
      }),
      maxOutputTokens: limits.maxOutputTokens,
    });

    return NextResponse.json({
      editedCode: cleanCodeOutput(output.editedCode),
    });
  } catch (error) {
    if (error instanceof NoKeyError) {
      return NextResponse.json({ error: error.message }, { status: 402 });
    }
    // Metadata only: AI SDK errors carry the user's code and provider responses
    logAiError(error, context);
    return NextResponse.json(
      { error: "Failed to generate edit" },
      { status: 500 },
    );
  }
}
