import "server-only";

import { createAnthropic } from "@ai-sdk/anthropic";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import { anthropic, deepseek, gemini, openai } from "inngest";

import type { ModelDefinition } from "../models";
import { getChosenModel, getProviderCredentials } from "./credentials";
import { createProxyToken } from "./proxy-token";
import { safeFetch } from "./url-safety";

export { NoKeyError } from "./credentials";

//#region Editor routes (Vercel AI SDK): called from our server with the real key

// Exported for scripts/ai-check.mts, which runs the same builders from the terminal.
export const createLanguageModel = (
  { provider, apiModelId }: ModelDefinition,
  { apiKey, baseUrl }: { apiKey: string; baseUrl: string },
): LanguageModel => {
  switch (provider) {
    case "anthropic":
      return createAnthropic({ apiKey })(apiModelId);
    case "openai":
      return createOpenAI({ apiKey })(apiModelId);
    case "google":
      return createGoogleGenerativeAI({ apiKey })(apiModelId);
    case "deepseek":
      return createDeepSeek({ apiKey })(apiModelId);
    // OpenAI-compatible servers only speak Chat Completions, not the Responses API
    case "qwen":
    case "ollama":
      return createOpenAI({
        apiKey,
        baseURL: baseUrl,
        fetch: safeFetch, // the base URL can be the user's own server
      }).chat(apiModelId);
  }
};

// The user's chosen model with their own key. Throws NoKeyError when they have none.
export const resolveModel = async (userId: string) => {
  const definition = await getChosenModel(userId);
  const credentials = await getProviderCredentials(userId, definition.provider);

  return {
    definition,
    languageModel: createLanguageModel(definition, credentials),
  };
};

//#endregion

//#region Agents (agent-kit): Inngest makes these calls, so they go through /api/ai-proxy

export interface AgentModelOptions {
  maxTokens: number;
  temperature?: number;
}

// The adapter types only know OpenAI's max_completion_tokens, but DeepSeek, DashScope and
// Ollama read max_tokens; the adapters pass extra fields through to the request body.
const openAiCompatibleParams = (maxTokens: number, temperature?: number) =>
  ({ temperature, max_tokens: maxTokens }) as { temperature?: number };

// Must be reachable by Inngest: the public app URL in production, the dev server locally.
const appUrl = () => {
  const url =
    process.env.APP_URL ??
    (process.env.NODE_ENV === "development" ? "https://localhost:3001" : "");

  if (!url) {
    throw new Error("APP_URL is not configured");
  }

  return url.replace(/\/$/, "");
};

// The agent-kit adapter for any model, given where to send requests and with what key.
// Exported for scripts/ai-check.mts; the app always goes through createAgentModel below.
export const buildAgentModel = (
  { provider, apiModelId: model, noTemperature }: ModelDefinition,
  { apiKey, baseUrl }: { apiKey: string; baseUrl?: string },
  options: AgentModelOptions,
) => {
  const { maxTokens } = options;
  const temperature = noTemperature ? undefined : options.temperature;

  switch (provider) {
    case "anthropic":
      return anthropic({
        model,
        apiKey,
        baseUrl,
        defaultParameters: { max_tokens: maxTokens, temperature },
      });
    // GPT-5 models are reasoning models: they reject temperature
    case "openai":
      return openai({
        model,
        apiKey,
        baseUrl,
        defaultParameters: { max_completion_tokens: maxTokens },
      });
    case "google":
      return gemini({
        model,
        apiKey,
        baseUrl,
        defaultParameters: {
          generationConfig: { maxOutputTokens: maxTokens, temperature },
        },
      });
    case "deepseek":
      // Thinking mode needs reasoning_content sent back with tools, which agent-kit drops
      return deepseek({
        model,
        apiKey,
        baseUrl,
        defaultParameters: {
          ...openAiCompatibleParams(maxTokens, temperature),
          ...({ thinking: { type: "disabled" } } as object),
        },
      });
    case "qwen":
    case "ollama":
      return openai({
        model,
        apiKey,
        baseUrl,
        defaultParameters: openAiCompatibleParams(maxTokens, temperature),
      });
  }
};

// Inngest only ever sees a short-lived capability and our proxy URL, never the user's key.
// The capability is scoped to this user, provider, model, project and run (see proxy-token.ts).
export const createAgentModel = (
  definition: ModelDefinition,
  scope: { userId: string; projectId: string; runId: string },
  options: AgentModelOptions,
) =>
  buildAgentModel(
    definition,
    {
      apiKey: createProxyToken({
        ...scope,
        provider: definition.provider,
        model: definition.apiModelId,
      }),
      baseUrl: `${appUrl()}/api/ai-proxy/${definition.provider}/`,
    },
    options,
  );

//#endregion
