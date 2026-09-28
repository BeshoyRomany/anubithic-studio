import { describe, expect, it } from "vitest";

import {
  clampOutputTokens,
  sanitizeUpstreamError,
} from "@/features/ai/server/proxy-policy";

describe("output token cap", () => {
  it("caps each provider's field, and sets it when missing", () => {
    expect(clampOutputTokens("anthropic", { max_tokens: 999_999 }, 16_000)).toMatchObject({ max_tokens: 16_000 });
    expect(clampOutputTokens("anthropic", {}, 16_000)).toMatchObject({ max_tokens: 16_000 });
    expect(clampOutputTokens("openai", { max_completion_tokens: 50_000 }, 16_000)).toMatchObject({ max_completion_tokens: 16_000 });
    expect(clampOutputTokens("openai", { max_tokens: 50_000 }, 16_000)).toMatchObject({ max_tokens: 16_000 });
    expect(
      clampOutputTokens("google", { generationConfig: { maxOutputTokens: 1e9, temperature: 0.3 } }, 16_000),
    ).toMatchObject({ generationConfig: { maxOutputTokens: 16_000, temperature: 0.3 } });
    expect(clampOutputTokens("ollama", { max_tokens: -5 }, 16_000)).toMatchObject({ max_tokens: 16_000 });
  });

  it("keeps smaller requests as they are", () => {
    expect(clampOutputTokens("anthropic", { max_tokens: 1024 }, 16_000)).toMatchObject({ max_tokens: 1024 });
  });
});

describe("upstream error sanitizing", () => {
  it("never passes the provider's message through", () => {
    for (const provider of ["openai", "anthropic", "google"] as const) {
      const body = sanitizeUpstreamError(provider, 401, "req_123");
      expect(body).toContain("401");
      expect(body).toContain("req_123");
      expect(body).not.toMatch(/sk-|Incorrect API key|x-api-key/);
    }
  });

  it("keeps each provider's error shape so agent-kit reports it", () => {
    expect(JSON.parse(sanitizeUpstreamError("anthropic", 429))).toMatchObject({ type: "error" });
    expect(JSON.parse(sanitizeUpstreamError("google", 500))).toMatchObject({ error: { code: 500 } });
    expect(JSON.parse(sanitizeUpstreamError("openai", 400))).toHaveProperty("error.message");
  });
});
