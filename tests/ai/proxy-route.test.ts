import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// ---- fakes for I/O: Convex, rate limit, credentials, the provider --------------------
const convexMutation = vi.fn();
vi.mock("@/lib/convex-client", () => ({
  convex: { mutation: (...args: unknown[]) => convexMutation(...args), query: vi.fn(async () => ({})) },
}));
const rateLimitMock = vi.fn(async () => null as Response | null);
vi.mock("@/lib/rate-limit", () => ({ rateLimit: (...args: unknown[]) => rateLimitMock(...(args as [])) }));

const PROVIDER_KEY = "sk-ant-api03-" + "Q".repeat(48);
vi.mock("@/features/ai/server/credentials", () => ({
  NoKeyError: class NoKeyError extends Error {},
  getProviderCredentials: vi.fn(async (_userId: string, provider: string) => ({
    apiKey: provider === "google" ? "AIza" + "G".repeat(35) : PROVIDER_KEY,
    baseUrl: provider === "google" ? "https://generativelanguage.googleapis.com/v1beta" : "https://api.anthropic.com/v1",
  })),
}));
const upstream = vi.fn();
vi.mock("@/features/ai/server/url-safety", () => ({ safeFetch: (...args: unknown[]) => upstream(...args) }));

const { POST } = await import("../../src/app/api/ai-proxy/[provider]/[...path]/route");
const { createProxyToken } = await import("@/features/ai/server/proxy-token");
const { resetSecretCachesForTests } = await import("@/features/ai/server/secrets");

const MODEL = "claude-haiku-4-5-20251001";
const env = {
  AI_KEYS_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  AI_PROXY_TOKEN_SIGNING_KEY: randomBytes(32).toString("base64"),
  AI_CREDENTIALS_CONVEX_KEY: "c".repeat(44),
};

beforeAll(() => {
  Object.assign(process.env, env);
  resetSecretCachesForTests();
});
afterAll(() => resetSecretCachesForTests());

const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
beforeEach(() => {
  convexMutation.mockReset().mockResolvedValue({ ok: true });
  rateLimitMock.mockReset().mockResolvedValue(null);
  upstream.mockReset().mockResolvedValue(
    new Response(JSON.stringify({ content: [{ type: "thinking", thinking: "…" }, { type: "text", text: "hi" }] }), { status: 200 }),
  );
  consoleSpy.mockClear();
});

const token = (overrides = {}) =>
  createProxyToken({ userId: "user_a", provider: "anthropic", model: MODEL, projectId: "proj_a", runId: "msg_a", ...overrides });

const call = (opts: { provider?: string; path?: string[]; tok?: string | null; body?: unknown; query?: string } = {}) => {
  const provider = opts.provider ?? "anthropic";
  const path = opts.path ?? ["messages"];
  const headers: Record<string, string> = { "content-type": "application/json" };
  const tok = opts.tok === undefined ? token() : opts.tok;
  if (tok && provider !== "google") headers["x-api-key"] = tok;
  const url = `https://app.test/api/ai-proxy/${provider}/${path.join("/")}${opts.query ?? ""}`;
  const request = new Request(url, {
    method: "POST",
    headers,
    body: typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body ?? { model: MODEL, max_tokens: 999_999, messages: [] }),
  });
  return POST(request, { params: Promise.resolve({ provider, path }) });
};

const leaked = () => JSON.stringify(consoleSpy.mock.calls);

describe("/api/ai-proxy", () => {
  it("valid token: forwards with the key in a header, caps output tokens, strips thinking blocks", async () => {
    const response = await call();
    expect(response.status).toBe(200);
    const [url, init] = upstream.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(url).not.toContain(PROVIDER_KEY);
    expect(init.headers["x-api-key"]).toBe(PROVIDER_KEY);
    expect(JSON.parse(init.body).max_tokens).toBe(16_000);
    expect(await response.json()).toEqual({ content: [{ type: "text", text: "hi" }] });
    expect(convexMutation.mock.calls[0][1]).toMatchObject({ userId: "user_a", projectId: "proj_a", runId: "msg_a", maxUses: 4 });
  });

  it("rejects a missing, modified or foreign-provider token before touching Convex or the provider", async () => {
    const tampered = token().replace(/.$/, (c) => (c === "A" ? "B" : "A"));
    for (const response of [
      await call({ tok: null }),
      await call({ tok: tampered }),
      await call({ tok: token({ provider: "openai" }) }),
    ]) {
      expect(response.status).toBe(401);
      expect((await response.json()).type).toBe("error"); // provider-shaped so agent-kit reports it
    }
    expect(convexMutation).not.toHaveBeenCalled();
    expect(upstream).not.toHaveBeenCalled();
  });

  it("rejects a different model than the token allows", async () => {
    const response = await call({ body: { model: "claude-opus-5-5", messages: [] } });
    expect(response.status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("rejects oversized and invalid bodies", async () => {
    expect((await call({ body: "x".repeat(5 * 1024 * 1024) })).status).toBe(413);
    expect((await call({ body: "not json" })).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it.each([
    ["wrong_project", 403],
    ["wrong_run", 403],
    ["run_finished", 401],
    ["replayed", 401],
    ["not_member", 403],
  ])("maps a Convex rejection (%s) to %i and never calls the provider", async (reason, status) => {
    convexMutation.mockResolvedValueOnce({ ok: false, reason });
    expect((await call()).status).toBe(status);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("enforces the rate limit", async () => {
    rateLimitMock.mockResolvedValueOnce(new Response(null, { status: 429 }));
    expect((await call()).status).toBe(429);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("replaces provider error bodies and logs metadata only", async () => {
    upstream.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: `Incorrect API key provided: sk-ant-abc****wxyz; echo ${PROVIDER_KEY}` } }), {
        status: 401,
        headers: { "request-id": "req_42" },
      }),
    );
    const response = await call();
    const text = await response.text();
    expect(response.status).toBe(401);
    expect(text).toContain("req_42");
    expect(text).not.toMatch(/sk-ant|Incorrect API key/);
    expect(leaked()).not.toMatch(/sk-ant|abpt1\./);
  });

  it("Gemini: accepts agent-kit's ?key=<token>, but sends the provider key only in a header", async () => {
    const gemini = createProxyToken({ userId: "user_a", provider: "google", model: "gemini-3.8-flash", projectId: "proj_a", runId: "msg_a" });
    upstream.mockResolvedValueOnce(new Response(JSON.stringify({ candidates: [] }), { status: 200 }));
    const response = await call({
      provider: "google",
      path: ["models", "gemini-3.8-flash:generateContent"],
      tok: gemini,
      query: `?key=${gemini}`,
      body: { contents: [] },
    });
    expect(response.status).toBe(200);
    const [url, init] = upstream.mock.calls[0];
    expect(url).not.toMatch(/[?&]key=/);
    expect(init.headers["x-goog-api-key"]).toMatch(/^AIza/);
  });

  it("never writes keys or tokens to the console in any of the above", () => {
    expect(leaked()).not.toContain(PROVIDER_KEY);
    expect(leaked()).not.toMatch(/abpt1\.|AIzaG/);
  });
});
