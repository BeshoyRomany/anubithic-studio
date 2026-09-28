import "server-only";

import type { CloudProvider } from "../models";

// Listing models is free on every provider, so it tests a key without spending anything.
const MODELS_ENDPOINTS: Record<
  CloudProvider,
  (apiKey: string) => { url: string; headers: Record<string, string> }
> = {
  anthropic: (apiKey) => ({
    url: "https://api.anthropic.com/v1/models",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
  }),
  openai: (apiKey) => ({
    url: "https://api.openai.com/v1/models",
    headers: { Authorization: `Bearer ${apiKey}` },
  }),
  google: (apiKey) => ({
    url: "https://generativelanguage.googleapis.com/v1beta/models",
    headers: { "x-goog-api-key": apiKey },
  }),
};

export type KeyCheck =
  { ok: true } | { ok: false; reason: "invalid" | "unreachable" };

export const verifyKey = async (
  provider: CloudProvider,
  apiKey: string,
): Promise<KeyCheck> => {
  const { url, headers } = MODELS_ENDPOINTS[provider](apiKey);

  try {
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(10_000),
    });

    if (response.ok) return { ok: true };
    // 400 (Google), 401 and 403 mean the key itself was rejected; 429/5xx are the provider's problem
    if ([400, 401, 403].includes(response.status)) {
      return { ok: false, reason: "invalid" };
    }
    return { ok: false, reason: "unreachable" };
  } catch {
    return { ok: false, reason: "unreachable" };
  }
};
