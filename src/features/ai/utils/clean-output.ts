// Every model's answer passes through here, whatever the provider.

const THINK_BLOCK = /<think>[\s\S]*?<\/think>/gi;
const LEAD_IN = /^(here(?:'s| is) (?:the|your) [^\n]*:)\s*\n/i;
const WRAPPING_FENCE = /^```[\w-]*\n([\s\S]*?)\n?```$/;

// Reasoning models (DeepSeek-R1, Qwen3) may put their thinking in the answer.
export const stripThinking = (text: string): string =>
  text.replace(THINK_BLOCK, "").trim();

// Small models sometimes print a made-up tool call as text instead of answering,
// e.g. {"name": "sayHello", "arguments": {...}}. Real tool calls never reach the text.
export const looksLikeFakeToolCall = (text: string): boolean => {
  const body = text.trim().replace(WRAPPING_FENCE, "$1").trim();
  if (!body.startsWith("{") && !body.startsWith("[")) return false;
  try {
    const parsed: unknown = JSON.parse(body);
    const calls = Array.isArray(parsed) ? parsed : [parsed];
    return (
      calls.length > 0 &&
      calls.every(
        (call) =>
          typeof call === "object" &&
          call !== null &&
          typeof (call as { name?: unknown }).name === "string" &&
          ("arguments" in call || "parameters" in call),
      )
    );
  } catch {
    return false;
  }
};

// Editor answers are inserted as code, so chat habits (fences, "Here is the code:") must go.
// Whitespace is kept otherwise: a suggestion's leading space is part of the code.
export const cleanCodeOutput = (text: string): string => {
  const withoutThinking = text.replace(THINK_BLOCK, "");
  const trimmed = withoutThinking.trimStart();
  const withoutLeadIn = trimmed.replace(LEAD_IN, "");
  const fenced = withoutLeadIn.trim().match(WRAPPING_FENCE);

  if (fenced) return fenced[1];
  // Nothing was stripped: return the original so meaningful whitespace survives.
  const changed = withoutThinking !== text || withoutLeadIn !== trimmed;
  return changed ? withoutLeadIn : text;
};
