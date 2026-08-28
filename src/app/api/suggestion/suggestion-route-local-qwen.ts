import { NextResponse } from "next/server";

import { SuggestionRequest } from "../../../features/editor/schemas/suggestion-schema";
import { getLocalQwenSuggestionPrompt } from "@/features/editor/prompts/qwen-prompt";

const OLLAMA_GENERATE_URL = "http://127.0.0.1:11434/api/generate";
const MODEL = "qwen2.5-coder:1.5b";

// Light safety net only - with Ollama applying its own FIM template
// correctly, this should rarely trigger, but costs nothing.
function cleanSuggestion(raw: string): string {
  return raw
    .replace(/```[a-zA-Z]*\n?/g, "")
    .replace(/```/g, "")
    .trim();
}

// Small local models don't always land exactly on a clean FIM boundary.
// This strips any prefix of the suggestion that overlaps with the end of
// what's already typed, so we never insert duplicated text.
function stripOverlap(textBeforeCursor: string, suggestion: string): string {
  const maxOverlap = Math.min(textBeforeCursor.length, suggestion.length);

  for (let len = maxOverlap; len > 0; len--) {
    const endOfBefore = textBeforeCursor.slice(-len);
    const startOfSuggestion = suggestion.slice(0, len);
    if (endOfBefore === startOfSuggestion) {
      return suggestion.slice(len);
    }
  }

  return suggestion;
}

export async function POST(request: Request) {
  try {
    const {
      code,
      previousLines,
      textBeforeCursor,
      textAfterCursor,
      nextLines,
    }: SuggestionRequest = await request.json();

    if (!code) {
      return NextResponse.json({ error: "Code is required" }, { status: 400 });
    }

    const { prefix, suffix } = getLocalQwenSuggestionPrompt({
      previousLines: previousLines || "", //beginning of the file
      textBeforeCursor,
      textAfterCursor,
      nextLines: nextLines || "", //end of the file
    });
    const ollamaResponse = await fetch(OLLAMA_GENERATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        prompt: prefix,
        suffix: suffix,
        stream: false,
        options: {
          num_predict: 60,
          stop: ["<|endoftext|>", "<|fim_pad|>", "\n\n"],
        },
      }),
    });

    if (!ollamaResponse.ok) {
      const errorText = await ollamaResponse.text();
      throw new Error(`Ollama error ${ollamaResponse.status}: ${errorText}`);
    }

    const data = await ollamaResponse.json();
    const cleaned = cleanSuggestion(data.response ?? "");
    const suggestion = stripOverlap(textBeforeCursor ?? "", cleaned);

    return NextResponse.json({ suggestion });
  } catch (error) {
    console.error("Suggestion error:", error);
    return NextResponse.json(
      { error: "Failed to generate suggestion" },
      { status: 500 },
    );
  }
}
