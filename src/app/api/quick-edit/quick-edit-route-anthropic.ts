import { generateText, Output } from "ai";
import { NextResponse } from "next/server";
// import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { auth } from "@clerk/nextjs/server";
import { firecrawl } from "@/lib/firecrawl";

import { quickEditAISchema } from "../../../features/editor/schemas/quick-edit-schema";
import { getAnthropicQuickEditPrompt } from "@/features/editor/prompts/anthropic-prompt";

const URL_REGEX = /https?:\/\/[^\s)>\]]+/g;

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
      // Filter out null or invalid scrape results
      const validResults = scrapedResults.filter(Boolean);

      //#region Doc xml example
      /*
        <documentation>
        <doc url="https://example.com/docs">
        # CodeMirror 6 Docs...
        </doc>

        <doc url="https://example.com/api">
        # API Reference...
        </doc>
        < /documentation>       
      */
      //#endregion
      if (validResults.length > 0) {
        documentationContext = `<documentation>\n${validResults.join("\n\n")}\n< /documentation>`;
      }
    }
    const prompt = getAnthropicQuickEditPrompt({
      selectedCode,
      fullCode,
      instruction,
      documentation: documentationContext,
    });

    // const { output } = await generateText({
    //   model: anthropic("claude-haiku-4-5"),
    //   output: Output.object({ schema: quickEditAISchema }),
    //   prompt: prompt,
    // });

    const { output } = await generateText({
      model: openai("gpt-4.1-mini"),
      output: Output.object({ schema: quickEditAISchema }),
      prompt: prompt,
    });
    return NextResponse.json({ editedCode: output.editedCode });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to generate edit" },
      { status: 500 },
    );
  }
}
