import { generateText, Output } from "ai";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import {
  SuggestionAIResponseSchema,
  SuggestionRequestSchema,
} from "@/features/editor/schemas/suggestion-schema";
import { buildSuggestionPrompt } from "@/features/ai/prompts/editor";
import { NoKeyError, resolveModel } from "@/features/ai/server/resolve-model";
import { cleanCodeOutput } from "@/features/ai/utils/clean-output";
import { AI_LIMITS } from "@/features/ai/server/ai-limits";
import { readJsonBody } from "@/features/ai/server/request-body";
import { logAiError } from "@/features/ai/server/safe-log";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const context: { route: string; provider?: string; model?: string } = {
    route: "suggestion",
  };
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const limits = AI_LIMITS.suggestion;
    const body = await readJsonBody(request, limits.maxBodyBytes);
    if (!body.ok) {
      return NextResponse.json(
        { error: "Invalid request" },
        { status: body.status },
      );
    }

    const parsed = SuggestionRequestSchema.safeParse(body.value);

    if (!parsed.success || !parsed.data.code) {
      return NextResponse.json({ error: "Code is required" }, { status: 400 });
    }

    const limited = await rateLimit(`ai-suggestion:${userId}`, {
      limit: limits.requestsPerWindow,
      windowMs: limits.windowMs,
    });
    if (limited) return limited;

    const { definition, languageModel } = await resolveModel(userId);
    context.provider = definition.provider;
    context.model = definition.apiModelId;

    const { output } = await generateText({
      model: languageModel,
      output: Output.object({ schema: SuggestionAIResponseSchema }),
      prompt: buildSuggestionPrompt(definition.promptProfile, parsed.data),
      maxOutputTokens: limits.maxOutputTokens,
    });

    return NextResponse.json({
      suggestion: cleanCodeOutput(output.suggestion),
    });
  } catch (error) {
    if (error instanceof NoKeyError) {
      return NextResponse.json({ error: error.message }, { status: 402 });
    }
    // Metadata only: AI SDK errors carry the user's code and provider responses
    logAiError(error, context);
    return NextResponse.json(
      { error: "Failed to generate suggestion" },
      { status: 500 },
    );
  }
}
