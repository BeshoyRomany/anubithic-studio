import { generateText, Output } from "ai";
import { NextResponse } from "next/server";
import { anthropic } from "@ai-sdk/anthropic";

import {
  SuggestionAIResponseSchema,
  SuggestionRequest,
} from "../../../features/editor/schemas/suggestion-schema";
import { getAnthropicSuggestionPrompt } from "@/features/editor/prompts/anthropic-prompt";

export async function POST(request: Request) {
  try {
    const {
      fileName,
      code,
      currentLine,
      previousLines,
      textBeforeCursor,
      textAfterCursor,
      nextLines,
      lineNumber,
    }: SuggestionRequest = await request.json();

    if (!code) {
      return NextResponse.json({ error: "Code is required" }, { status: 400 });
    }
    const prompt = getAnthropicSuggestionPrompt({
      fileName,
      code,
      currentLine,
      previousLines: previousLines || "", //beginning of the file
      textBeforeCursor,
      textAfterCursor,
      nextLines: nextLines || "", //end of the file
      lineNumber: lineNumber,
    });

    const { output } = await generateText({
      model: anthropic("claude-haiku-4-5"),
      output: Output.object({ schema: SuggestionAIResponseSchema }),
      prompt: prompt,
    });

    return NextResponse.json({ suggestion: output.suggestion });
  } catch (error) {
    console.error("Suggestion error:", error);
    return NextResponse.json(
      { error: "Failed to generate suggestion" },
      { status: 500 },
    );
  }
}
