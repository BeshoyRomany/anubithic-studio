import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { firecrawl } from "@/lib/firecrawl";
import { getLocalQwenQuickEditPrompt } from "@/features/editor/prompts/qwen-prompt";

const OLLAMA_GENERATE_URL = "http://127.0.0.1:11434/api/generate";
const MODEL = "qwen2.5-coder:1.5b";
const URL_REGEX = /https?:\/\/[^\s)>\]]+/g;

function cleanQuickEditResponse(raw: string): string {
  return raw
    .replace(/^```[a-zA-Z]*\n?/gm, "")
    .replace(/```$/gm, "")
    .trim();
}

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    const { selectedCode, fullCode, instruction } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 400 });
    }

    if (!selectedCode) {
      return NextResponse.json(
        { error: "Selected code is required" },
        { status: 400 },
      );
    }

    if (!instruction) {
      return NextResponse.json(
        { error: "Instruction is required" },
        { status: 400 },
      );
    }

    const urls: string[] = instruction.match(URL_REGEX) || [];
    let documentationContext = "";

    if (urls.length > 0) {
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
      const validResults = scrapedResults.filter(Boolean);
      if (validResults.length > 0) {
        documentationContext = `<documentation>\n${validResults.join("\n\n")}\n</documentation>`;
      }
    }

    const prompt = getLocalQwenQuickEditPrompt({
      selectedCode,
      fullCode,
      instruction,
      documentation: documentationContext,
    });

    const ollamaResponse = await fetch(OLLAMA_GENERATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        prompt: prompt,
        stream: false,
        options: {
          num_predict: 500,
          temperature: 0.2,
        },
      }),
    });

    if (!ollamaResponse.ok) {
      const errorText = await ollamaResponse.text();
      throw new Error(`Ollama error ${ollamaResponse.status}: ${errorText}`);
    }

    const data = await ollamaResponse.json();
    const editedCode = cleanQuickEditResponse(data.response ?? "");

    return NextResponse.json({ editedCode });
  } catch (error) {
    console.error("Quick Edit Local Error:", error);
    return NextResponse.json(
      { error: "Failed to generate local edit" },
      { status: 500 },
    );
  }
}
