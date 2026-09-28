// Newer Claude models (Sonnet 5, Opus 5.5) return `thinking` blocks, and Opus 5.5 can't turn
// thinking off. agent-kit's Anthropic parser only knows `text` and `tool_use` and crashes on
// anything else ("acc is not iterable"), so the proxy drops the other blocks before agent-kit
// reads the response. The API accepts the next turn without them (tested live).
const SUPPORTED_BLOCKS = new Set(["text", "tool_use"]);

export const stripUnsupportedAnthropicBlocks = (responseText: string) => {
  try {
    const response = JSON.parse(responseText) as {
      content?: { type?: string }[];
    };
    if (!Array.isArray(response.content)) return responseText;

    response.content = response.content.filter((block) =>
      SUPPORTED_BLOCKS.has(block.type ?? ""),
    );
    return JSON.stringify(response);
  } catch {
    return responseText;
  }
};
