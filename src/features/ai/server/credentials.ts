import "server-only";

import { after } from "next/server";

import { convex } from "@/lib/convex-client";
import { api } from "../../../../convex/_generated/api";

import {
  AiProvider,
  CLOUD_PROVIDERS,
  CloudProvider,
  DEFAULT_MODEL_ID,
  DEFAULT_OLLAMA_URL,
  getModelDefinition,
  ModelDefinition,
} from "../models";
import { decryptKey } from "./key-crypto";
import { assertSafeOllamaUrl } from "./url-safety";
import { requireAiCredentialsKey } from "./convex-ai";

// Where each provider's API lives. Ollama's comes from the user's settings.
export const PROVIDER_BASE_URLS: Record<CloudProvider, string> = {
  anthropic: "https://api.anthropic.com/v1",
  openai: "https://api.openai.com/v1",
  google: "https://generativelanguage.googleapis.com/v1beta",
};

// Dev-only escape hatch: AI_ALLOW_ENV_KEYS=true falls back to the app's own keys.
const ENV_KEYS: Record<CloudProvider, string | undefined> = {
  anthropic: process.env.ANTHROPIC_API_KEY,
  openai: process.env.OPENAI_API_KEY,
  google: process.env.GOOGLE_API_KEY,
};

// Development only (NODE_ENV === "development"): production, preview and test builds never
// fall back to the app's keys, and production refuses to start with the flag set.
const envKeyFor = (provider: CloudProvider) =>
  process.env.AI_ALLOW_ENV_KEYS === "true" &&
  process.env.NODE_ENV === "development"
    ? ENV_KEYS[provider]
    : undefined;

export class NoKeyError extends Error {
  constructor(public readonly provider: AiProvider) {
    super(
      `Add your ${provider} API key in AI settings to use this model, or pick another model.`,
    );
    this.name = "NoKeyError";
  }
}

export const isCloudProvider = (
  provider: AiProvider,
): provider is CloudProvider =>
  (CLOUD_PROVIDERS as readonly AiProvider[]).includes(provider);

export const getSettings = (userId: string) =>
  convex.query(api.aiCredentials.getSettings, {
    credentialsKey: requireAiCredentialsKey(),
    userId,
  });

// The user's pick, else AI_DEFAULT_MODEL, else the app default. Unknown ids fall through.
export const getChosenModel = async (
  userId: string,
): Promise<ModelDefinition> => {
  const settings = await getSettings(userId);

  return (
    getModelDefinition(settings?.modelId ?? "", settings) ??
    getModelDefinition(process.env.AI_DEFAULT_MODEL ?? "") ??
    getModelDefinition(DEFAULT_MODEL_ID)!
  );
};

// Also used by /api/ai-local, so the connection test checks the same URL the models use.
export const getOllamaBaseUrl = async (userId: string) => {
  const settings = await getSettings(userId);
  return (
    settings?.ollamaBaseUrl ?? process.env.OLLAMA_BASE_URL ?? DEFAULT_OLLAMA_URL
  );
};

const getStoredKey = (userId: string, provider: CloudProvider) =>
  convex.query(api.aiCredentials.getKey, {
    credentialsKey: requireAiCredentialsKey(),
    userId,
    provider,
  });

export const hasProviderKey = async (userId: string, provider: AiProvider) => {
  if (provider === "ollama") return true;
  if (!isCloudProvider(provider)) return false;
  return Boolean(envKeyFor(provider) || (await getStoredKey(userId, provider)));
};

// The real key and API base URL for one provider. The key is decrypted here and must
// never be logged, returned to the browser, or returned from an Inngest step.
export const getProviderCredentials = async (
  userId: string,
  provider: AiProvider,
): Promise<{ apiKey: string; baseUrl: string }> => {
  if (provider === "ollama") {
    const ollamaUrl = await getOllamaBaseUrl(userId);
    await assertSafeOllamaUrl(ollamaUrl);

    // Ollama ignores the key, but OpenAI-style clients require one
    return { apiKey: "ollama", baseUrl: `${ollamaUrl.replace(/\/$/, "")}/v1` };
  }

  // Providers with adapters but not enabled yet (see models.ts)
  if (!isCloudProvider(provider)) {
    throw new Error(`Provider "${provider}" is not enabled`);
  }

  const stored = await getStoredKey(userId, provider);
  const apiKey = stored
    ? decryptKey(stored, userId, provider)
    : envKeyFor(provider);

  // "Last used" in the keys panel lets users spot use they didn't expect.
  // after(): written once the response is sent, so no request waits on it.
  if (stored) {
    after(() =>
      convex.mutation(api.aiCredentials.markKeyUsed, {
        credentialsKey: requireAiCredentialsKey(),
        userId,
        provider,
      }),
    );
  }

  if (!apiKey) {
    throw new NoKeyError(provider);
  }

  return { apiKey, baseUrl: PROVIDER_BASE_URLS[provider] };
};
