import { SuggestionRequest } from "../schemas/suggestion-schema";
import { QuickEditRequest } from "../schemas/quick-edit-schema";

//Anthropic Suggestion prompt
export const getAnthropicSuggestionPrompt = ({
  code,
  fileName,
  currentLine,
  previousLines,
  textBeforeCursor,
  textAfterCursor,
  nextLines,
  lineNumber,
}: SuggestionRequest): string => {
  // NOTE: `code` (the full file) is intentionally left out. previous_lines /
  // current_line / next_lines already give enough surrounding context for a
  // short completion - sending the whole file on top of that is wasted,
  // billed tokens on every keystroke, and it grows as the file grows.
  return `You are an expert code completion assistant. You ONLY output the exact code that should be inserted at the cursor position.

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
  Infer the setter name as "set" + capitalized state name unless context suggests otherwise.

<context>
<file_name>${fileName}</file_name>
<previous_lines>
${previousLines}
</previous_lines>
<current_line number="${lineNumber}">${currentLine}</current_line>
<before_cursor>${textBeforeCursor}</before_cursor>
<after_cursor>${textAfterCursor}</after_cursor>
<next_lines>
${nextLines}
</next_lines>
<full_code>
${code}
</full_code>
</context>

<instructions>
Follow these steps IN ORDER:

1. Look at next_lines. If it already continues naturally from the cursor, return an empty string - the code is already written.
2. Check if before_cursor already ends with a complete statement (;, }, )). If yes, return an empty string.
3. Only if steps 1 and 2 don't apply: output ONLY the raw code that should be typed at the cursor position, following the strict output rules above.

Return strictly according to the required schema output.
</instructions>`;
};

//Anthropic Quick edit prompt
export const getAnthropicQuickEditPrompt = ({
  selectedCode,
  fullCode,
  instruction,
  documentation,
}: QuickEditRequest): string => {
  return `You are an expert code editing assistant. Edit the selected code based on the user's instruction and provided documentation.

<context>
<selected_code>
${selectedCode}
</selected_code>
<full_code_context>
${fullCode || ""}
</full_code_context>
</context>

${documentation || ""}

<instruction>
${instruction}
</instruction>

<instructions>
Follow these rules strictly:
- Return ONLY the edited version of the selected code.
- Maintain the same indentation level as the original.
- Do not include any explanations, markdown code fences, or comments unless requested.
- If the instruction is unclear or cannot be applied, return the original code unchanged.
</instructions>`;
};
