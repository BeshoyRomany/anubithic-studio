import { QuickEditRequest } from "../schemas/quick-edit-schema";
import { SuggestionRequest } from "../schemas/suggestion-schema";

//Local Qwen model Suggestion prompt
export const getLocalQwenSuggestionPrompt = ({
  fileName,
  previousLines,
  textBeforeCursor,
  textAfterCursor,
  nextLines,
}: SuggestionRequest): { prefix: string; suffix: string } => {
  const fileHeader = fileName ? `// Path: ${fileName}` : "";

  const prefix = [fileHeader, previousLines, textBeforeCursor]
    .filter((part) => part !== undefined && part !== "")
    .join("\n");

  const suffix = [textAfterCursor, nextLines]
    .filter((part) => part !== undefined && part !== "")
    .join("\n");

  return { prefix, suffix };
};

//Local Qwen model Quick edit prompt
export const getLocalQwenQuickEditPrompt = ({
  selectedCode,
  fullCode,
  instruction,
  documentation,
}: QuickEditRequest): string => {
  return `You are a precise code editing assistant. Your task is to modify the given selected code based on the user's instruction.

${documentation ? `Here is relevant documentation to help you:\n${documentation}\n` : ""}

Full File Context:
\`\`\`
${fullCode || ""}
\`\`\`

Selected Code to Edit:
\`\`\`
${selectedCode}
\`\`\`

User Instruction: ${instruction}

Strict Rules:
- Return ONLY the final edited code that replaces the selected code.
- Do NOT wrap the output in markdown code fences (\`\`\`).
- Do NOT include any explanations, greetings, or conversational text.
- Match the original indentation style.`;
};
