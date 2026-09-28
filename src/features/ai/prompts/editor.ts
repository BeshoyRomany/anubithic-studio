import type { QuickEditRequest } from "@/features/editor/schemas/quick-edit-schema";
import type { SuggestionRequest } from "@/features/editor/schemas/suggestion-schema";

import type { PromptProfile } from "../models";
import { renderSections } from "./render";

const SUGGESTION_INTRO = `You are an expert code completion assistant. You ONLY output the exact code that should be inserted at the cursor position.

Strict output rules:
- Never use markdown code fences (no \`\`\`) or a language tag.
- Never explain yourself or add any commentary.
- Never repeat text that already exists before or after the cursor - your output is inserted directly at the cursor, character for character.
- Keep the suggestion as short as possible: usually the rest of the current line, occasionally a couple more lines if clearly needed (e.g. closing a block you just opened). Never suggest more than that.
- Match the indentation and code style already used in previous_lines/next_lines.
- Before answering, mentally concatenate before_cursor + your suggestion + after_cursor and confirm the result is syntactically valid for the language. If it isn't, revise your suggestion until it is - never emit a suggestion you haven't checked this way.
- Recognize common multi-part patterns instead of completing them literally token-by-token. For example, array destructuring for a React state hook is always a PAIR - a value and its setter - even if the user has only typed the first name so far:
  before_cursor: "const [isOpen"
  after_cursor: ""
  correct suggestion: ", setIsOpen] = useState(false);"
  (NOT "] = useState(false)" - that drops the required setter and produces invalid/incomplete destructuring)
  Infer the setter name as "set" + capitalized state name unless context suggests otherwise.`;

const SUGGESTION_STEPS = `Follow these steps IN ORDER:

1. Look at next_lines. If it already continues naturally from the cursor, return an empty string - the code is already written.
2. Check if before_cursor already ends with a complete statement (;, }, )). If yes, return an empty string.
3. Only if steps 1 and 2 don't apply: output ONLY the raw code that should be typed at the cursor position, following the strict output rules above.

Return strictly according to the required schema output.`;

export const buildSuggestionPrompt = (
  profile: PromptProfile,
  request: SuggestionRequest,
): string => {
  const context = renderSections(profile, [
    { tag: "file_name", body: request.fileName ?? "", inline: true },
    { tag: "previous_lines", body: request.previousLines ?? "", code: true },
    {
      tag: "current_line",
      body: request.currentLine ?? "",
      inline: true,
      attrs: { number: request.lineNumber },
    },
    { tag: "before_cursor", body: request.textBeforeCursor ?? "", inline: true },
    { tag: "after_cursor", body: request.textAfterCursor ?? "", inline: true },
    { tag: "next_lines", body: request.nextLines ?? "", code: true },
    { tag: "full_code", body: request.code ?? "", code: true },
  ]);
  const steps = renderSections(profile, [
    { tag: "instructions", body: SUGGESTION_STEPS },
  ]);

  return `${SUGGESTION_INTRO}\n\n${context}\n\n${steps}`;
};

const QUICK_EDIT_RULES = `Follow these rules strictly:
- Return ONLY the edited version of the selected code.
- Maintain the same indentation level as the original.
- Do not include any explanations, markdown code fences, or comments unless requested.
- If the instruction is unclear or cannot be applied, return the original code unchanged.`;

// `documentation` is scraped pages from URLs in the instruction, as <doc url="…"> blocks.
export const buildQuickEditPrompt = (
  profile: PromptProfile,
  request: QuickEditRequest,
): string => {
  const sections = renderSections(profile, [
    { tag: "selected_code", body: request.selectedCode, code: true },
    { tag: "full_code_context", body: request.fullCode ?? "", code: true },
    ...(request.documentation
      ? [{ tag: "documentation", body: request.documentation }]
      : []),
    { tag: "instruction", body: request.instruction },
    { tag: "instructions", title: "Rules", body: QUICK_EDIT_RULES },
  ]);

  return `You are an expert code editing assistant. Edit the selected code based on the user's instruction and provided documentation.\n\n${sections}`;
};
