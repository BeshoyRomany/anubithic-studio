import { afterEach, describe, expect, it, vi } from "vitest";

import { logAiError, toSafeAiError } from "@/features/ai/server/safe-log";
import { scrubSecrets } from "@/lib/sentry-scrub";

// Realistic (fake) secrets — the shapes that must never be logged
const OPENAI_KEY = "sk-proj-" + "A1b2C3d4".repeat(6);
const ANTHROPIC_KEY = "sk-ant-api03-" + "Z9y8X7w6".repeat(6);
const GOOGLE_KEY = "AIza" + "SyD3f4G5h6J7k8L9m0N1p2Q3r4S5t6";
const PROXY_TOKEN = "abpt1.eyJ2IjoyLCJqdGkiOiJhYmMifQ.c2lnbmF0dXJlLXZhbHVlLWhlcmU";
const USER_CODE = "const secretBusinessLogic = computeTaxes(customer);";

// Shaped like the AI SDK's APICallError for each provider
const openAiError = Object.assign(new Error(`Incorrect API key provided: sk-proj-abc****************wxyz`), {
  name: "AI_APICallError",
  statusCode: 401,
  url: "https://api.openai.com/v1/responses",
  requestBodyValues: { model: "gpt-5.5", input: [{ role: "user", content: USER_CODE }] },
  responseHeaders: { "x-request-id": "req_abc123", authorization: `Bearer ${OPENAI_KEY}` },
  responseBody: JSON.stringify({ error: { message: "Incorrect API key provided: sk-proj-abc****wxyz" } }),
});
const anthropicError = Object.assign(new Error("invalid x-api-key"), {
  name: "AI_APICallError",
  statusCode: 401,
  url: "https://api.anthropic.com/v1/messages",
  requestBodyValues: { system: "…", messages: [{ role: "user", content: USER_CODE }] },
  responseHeaders: { "request-id": "req_011CfTest" },
  responseBody: '{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}',
});
const geminiError = Object.assign(new Error("API key not valid"), {
  name: "AI_APICallError",
  statusCode: 400,
  url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${GOOGLE_KEY}`,
  requestBodyValues: { contents: [{ parts: [{ text: USER_CODE }] }] },
  responseBody: `{"error":{"message":"API key not valid. Please pass a valid API key. ${GOOGLE_KEY}"}}`,
});

const forbidden = [OPENAI_KEY, ANTHROPIC_KEY, GOOGLE_KEY, PROXY_TOKEN, USER_CODE, "sk-proj-abc", "Bearer", "invalid x-api-key", "googleapis.com"];

describe("safe AI error normalization", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ["OpenAI", openAiError, "openai"],
    ["Anthropic", anthropicError, "anthropic"],
    ["Gemini", geminiError, "google"],
  ])("%s errors are reduced to metadata only", (_name, error, provider) => {
    const safe = toSafeAiError(error, { route: "quick-edit", provider, model: "m" });
    const serialized = JSON.stringify(safe);

    expect(Object.keys(safe).sort()).toEqual(
      ["code", "errorType", "model", "provider", "requestId", "route", "status"].sort(),
    );
    for (const secret of forbidden) expect(serialized).not.toContain(secret);
    expect(safe.status).toBe((error as { statusCode: number }).statusCode);
  });

  it("keeps a provider request id, but only if it looks like one", () => {
    expect(toSafeAiError(anthropicError, { route: "r" }).requestId).toBe("req_011CfTest");
    const sneaky = { name: "X", responseHeaders: { "x-request-id": `id ${OPENAI_KEY} <script>` } };
    expect(toSafeAiError(sneaky, { route: "r" }).requestId).toBeUndefined();
  });

  it("logAiError writes nothing sensitive to the console (which Sentry Logs receives)", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const error of [openAiError, anthropicError, geminiError]) {
      logAiError(error, { route: "suggestion" });
    }
    const written = JSON.stringify(spy.mock.calls);
    for (const secret of forbidden) expect(written).not.toContain(secret);
  });

  it("maps codes without exposing messages", () => {
    const noKey = Object.assign(new Error(`Add your key ${OPENAI_KEY}`), { name: "NoKeyError" });
    expect(toSafeAiError(noKey, { route: "r" })).toMatchObject({ code: "no_key", errorType: "NoKeyError" });
    expect(JSON.stringify(toSafeAiError(noKey, { route: "r" }))).not.toContain(OPENAI_KEY);
  });
});

describe("Sentry scrubber (second safety net)", () => {
  it("removes keys, proxy tokens, masked keys, bearer values and credential query params", () => {
    const event = {
      message: `failed with ${ANTHROPIC_KEY} and ${PROXY_TOKEN}`,
      extra: {
        masked: "Incorrect API key provided: sk-proj-abc****************wxyz",
        auth: `Bearer ${OPENAI_KEY}`,
        url: `https://app.example.com/api/ai-proxy/google/models/x:generateContent?key=${PROXY_TOKEN}&alt=json`,
        googleUrl: `https://generativelanguage.googleapis.com/v1beta/models?key=${GOOGLE_KEY}`,
      },
      request: { headers: { Authorization: `Bearer ${OPENAI_KEY}`, "x-api-key": ANTHROPIC_KEY } },
      contexts: { auth_key: PROXY_TOKEN, credentialsKey: "secret-value" },
    };
    const scrubbed = JSON.stringify(scrubSecrets(event));
    for (const secret of [OPENAI_KEY, ANTHROPIC_KEY, GOOGLE_KEY, PROXY_TOKEN, "sk-proj-abc", "secret-value"]) {
      expect(scrubbed).not.toContain(secret);
    }
    expect(scrubbed).toContain("alt=json"); // harmless params survive
  });

  it("leaves ordinary text alone", () => {
    expect(scrubSecrets("desk-reservation-management-system-v2")).toBe("desk-reservation-management-system-v2");
  });
});
