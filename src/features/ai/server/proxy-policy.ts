// Pure request/response rules for /api/ai-proxy, kept free of I/O so they can be tested.

import type { AiProvider } from "../models";

type JsonObject = Record<string, unknown>;

const clamp = (value: unknown, cap: number) =>
  typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.min(Math.floor(value), cap)
    : cap;

// Caps output tokens on every request, whatever the caller asked for (or left out).
export const clampOutputTokens = (
  provider: AiProvider,
  body: JsonObject,
  cap: number,
): JsonObject => {
  switch (provider) {
    case "anthropic":
      return { ...body, max_tokens: clamp(body.max_tokens, cap) };
    case "google": {
      const config = (body.generationConfig ?? {}) as JsonObject;
      return {
        ...body,
        generationConfig: {
          ...config,
          maxOutputTokens: clamp(config.maxOutputTokens, cap),
        },
      };
    }
    case "openai": {
      // Newer OpenAI models reject max_tokens; keep whichever field the caller used
      if ("max_tokens" in body && !("max_completion_tokens" in body)) {
        return { ...body, max_tokens: clamp(body.max_tokens, cap) };
      }
      return {
        ...body,
        max_completion_tokens: clamp(body.max_completion_tokens, cap),
      };
    }
    default:
      return { ...body, max_tokens: clamp(body.max_tokens, cap) };
  }
};

// Provider request ids help support tickets and contain no secrets.
export const extractRequestId = (headers: Headers) =>
  headers.get("request-id") ??
  headers.get("x-request-id") ??
  headers.get("x-goog-request-id") ??
  undefined;

const reasonFor = (status: number) => {
  if (status === 401 || status === 403) return "authentication failed";
  if (status === 402) return "billing or quota problem";
  if (status === 404) return "model not found";
  if (status === 408 || status === 504) return "timed out";
  if (status === 413) return "request too large";
  if (status === 429) return "rate limited or out of quota";
  if (status >= 500) return "provider unavailable";
  return "request rejected";
};

// An error body in the provider's own shape, so agent-kit reports it as an error (instead
// of silently treating an unknown body as an empty answer). `message` is always ours.
export const providerShapedError = (
  provider: AiProvider,
  status: number,
  message: string,
) => {
  switch (provider) {
    case "anthropic":
      return JSON.stringify({
        type: "error",
        error: { type: "provider_error", message },
      });
    case "google":
      return JSON.stringify({
        error: { code: status, message, status: "PROVIDER_ERROR" },
      });
    default:
      return JSON.stringify({ error: { message, type: "provider_error" } });
  }
};

// Replaces a provider's error body with a minimal one. Provider error bodies can echo
// masked keys, prompts or account details; agent-kit throws their message and Inngest +
// Sentry record it, so none of it is passed through.
export const sanitizeUpstreamError = (
  provider: AiProvider,
  status: number,
  requestId?: string,
) =>
  providerShapedError(
    provider,
    status,
    `Provider ${provider} returned ${status} (${reasonFor(status)})${
      requestId ? `, request id ${requestId}` : ""
    }`,
  );
