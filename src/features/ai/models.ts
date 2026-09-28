// The one list of models the app supports. The picker and the server both read it,
// so adding a model is one entry here.
//
// Only models verified to run the coding agent (multi-turn tool calling through
// agent-kit) are listed. DeepSeek and Qwen have adapters but are off until they pass
// that test (DeepSeek V4 needs thinking disabled; Qwen's cloud ids/URLs need re-checking).
// Gemini 3 works through the proxy's thought-signature store (gemini-signatures.ts).

export type AiProvider =
  | "anthropic"
  | "openai"
  | "google"
  | "deepseek"
  | "qwen"
  | "ollama";

// Providers a user can store a key for; Ollama runs on their own machine and needs none.
export const CLOUD_PROVIDERS = [
  "anthropic",
  "openai",
  "google",
] as const satisfies readonly AiProvider[];

export type CloudProvider = (typeof CLOUD_PROVIDERS)[number];

// What the picker and keys panel show per provider. `logo` is a models.dev logo id.
export const PROVIDER_INFO: Record<
  AiProvider,
  { label: string; logo?: string; keyUrl?: string; keyPlaceholder?: string }
> = {
  anthropic: {
    label: "Anthropic",
    logo: "anthropic",
    keyUrl: "https://console.anthropic.com/settings/keys",
    keyPlaceholder: "sk-ant-...",
  },
  openai: {
    label: "OpenAI",
    logo: "openai",
    keyUrl: "https://platform.openai.com/api-keys",
    keyPlaceholder: "sk-...",
  },
  google: {
    label: "Google Gemini",
    logo: "google",
    keyUrl: "https://aistudio.google.com/apikey",
    keyPlaceholder: "AIza...",
  },
  deepseek: { label: "DeepSeek", logo: "deepseek" },
  qwen: { label: "Qwen (Alibaba Cloud)", logo: "alibaba" },
  ollama: { label: "Local (Ollama)" },
};

export const DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434";

// How prompts are formatted and answers are read for a model family.
export type PromptProfile = "claude" | "markdown" | "reasoner" | "local";

export type ModelTier = "smart" | "balanced" | "fast";

export interface ModelDefinition {
  id: string; // stable app id, "<provider>/<apiModelId>"
  provider: AiProvider;
  apiModelId: string;
  label: string;
  tier: ModelTier;
  cost: "$" | "$$" | "$$$" | null; // relative hint, null for local models
  promptProfile: PromptProfile;
  supportsTools: boolean; // the coding agent needs tool calling
  // Newer Claude models reject `temperature` ("deprecated for this model"); we omit it for them
  noTemperature?: boolean;
}

const cloud = (
  provider: CloudProvider,
  apiModelId: string,
  label: string,
  tier: ModelTier,
  cost: ModelDefinition["cost"],
  promptProfile: PromptProfile = "markdown",
): ModelDefinition => ({
  id: `${provider}/${apiModelId}`,
  provider,
  apiModelId,
  label,
  tier,
  cost,
  promptProfile,
  supportsTools: true,
});

// Each passed a live multi-turn tool-calling test through agent-kit (2026-09-27).
export const MODELS: ModelDefinition[] = [
  { ...cloud("anthropic", "claude-opus-5-5", "Claude Opus 5.5", "smart", "$$$", "claude"), noTemperature: true },
  { ...cloud("anthropic", "claude-sonnet-5", "Claude Sonnet 5", "balanced", "$$", "claude"), noTemperature: true },
  cloud("anthropic", "claude-haiku-4-5-20251001", "Claude Haiku 4.5", "fast", "$", "claude"),

  cloud("openai", "gpt-5.5", "GPT-5.5", "smart", "$$$"),
  cloud("openai", "gpt-5.4-mini", "GPT-5.4 mini", "fast", "$"),

  // Passed with signatures re-attached. Pro wasn't testable (key over free quota).
  cloud("google", "gemini-3.8-flash", "Gemini 3.8 Flash", "fast", "$"),
];

export const DEFAULT_MODEL_ID = "anthropic/claude-haiku-4-5-20251001";

//#region Local models (Ollama)
// Not a fixed list: the user types the model they run, and the server reads its
// capabilities from Ollama (/api/show) when they connect.

export const LOCAL_MODEL_PREFIX = "ollama/";

export interface LocalModelSettings {
  localModel?: string; // Ollama tag, e.g. "qwen2.5:14b"
  localModelSupportsTools?: boolean; // from /api/show "capabilities"
}

// Reasoning models print their thinking, so their answers need the reasoner profile.
const REASONER_PATTERN = /deepseek-r1|qwq|magistral/i;

export const localModelDefinition = (
  name: string,
  supportsTools: boolean,
): ModelDefinition => ({
  id: `${LOCAL_MODEL_PREFIX}${name}`,
  provider: "ollama",
  apiModelId: name,
  label: name,
  tier: "balanced",
  cost: null,
  promptProfile: REASONER_PATTERN.test(name) ? "reasoner" : "local",
  supportsTools,
});

// Tool-capable local models that work well as coding agents, smallest first.
export const LOCAL_AGENT_RECOMMENDATIONS = [
  { size: "7–8B", memory: "~8 GB", models: ["qwen2.5:7b-instruct", "llama3.1:8b"], note: "Works for small tasks" },
  { size: "14B", memory: "~16 GB", models: ["qwen2.5:14b", "qwen3:14b"], note: "Good balance for most projects" },
  { size: "30–32B", memory: "24 GB+", models: ["qwen3-coder:30b", "qwen2.5-coder:32b"], note: "Best local coding agents" },
];
//#endregion

// Registry models, plus the user's own local model when the id points at it.
export const getModelDefinition = (
  id: string,
  local?: LocalModelSettings | null,
): ModelDefinition | undefined => {
  if (id.startsWith(LOCAL_MODEL_PREFIX)) {
    const name = id.slice(LOCAL_MODEL_PREFIX.length);
    return local?.localModel === name
      ? localModelDefinition(name, local.localModelSupportsTools ?? false)
      : undefined;
  }
  return MODELS.find((model) => model.id === id);
};
