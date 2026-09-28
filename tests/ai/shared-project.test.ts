import { randomBytes } from "node:crypto";
import { getFunctionName } from "convex/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Shared projects: a teammate's message runs on the TEAMMATE's model and key, end to end
// (messages route → agent → proxy). The owner's key is never looked up or decrypted.

const OWNER = "user_owner";
const TEAMMATE = "user_teammate";
const OWNER_KEY = "sk-ant-api03-" + "O".repeat(48);
const TEAMMATE_KEY = "sk-proj-" + "T".repeat(48);

// ---- fakes: Clerk, Inngest, Convex, stored keys, agent-kit, the provider ----------------
let signedIn = TEAMMATE;
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: signedIn }) }));

const sentEvents: { name: string; data: Record<string, unknown> }[] = [];
vi.mock("@/inngest/client", () => ({
  inngest: {
    send: vi.fn(async (event: { name: string; data: Record<string, unknown> }) => {
      sentEvents.push(event);
      return { ids: ["evt_1"] };
    }),
    // Keeps the handler so the test can run the agent function directly
    createFunction: (config: unknown, handler: unknown) => ({ config, handler }),
  },
}));

const convexCalls: { name: string; args: Record<string, unknown> }[] = [];
const convexFake = async (ref: unknown, args: Record<string, unknown>) => {
  const name = getFunctionName(ref as never);
  convexCalls.push({ name, args });
  switch (name) {
    case "system:getConversationById":
      return { _id: "conv_1", projectId: "proj_shared", title: "Existing chat" };
    case "system:getProjectRole":
      return args.userId === TEAMMATE || args.userId === OWNER ? "contributor" : null;
    case "system:getProcessingMessages":
    case "system:getRecentMessages":
      return [];
    case "system:createMessage":
      return "msg_1";
    case "aiCredentials:consumeProxyToken":
      return { ok: true };
    default:
      return null;
  }
};
vi.mock("@/lib/convex-client", () => ({ convex: { query: convexFake, mutation: convexFake } }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: async () => null }));
vi.mock("@/lib/firecrawl", () => ({ firecrawl: {} })); // needs a real key at import

// Owner: Claude + an Anthropic key. Teammate: GPT + (optionally) an OpenAI key.
const storedKeys: Record<string, Partial<Record<string, string>>> = {};
const chosenModel: Record<string, string> = { [OWNER]: "claude-haiku-4-5-20251001", [TEAMMATE]: "gpt-5.4-mini" };
const credentials = vi.hoisted(() => ({
  getChosenModel: vi.fn(),
  hasProviderKey: vi.fn(),
  getProviderCredentials: vi.fn(),
}));
vi.mock("@/features/ai/server/credentials", async () => {
  const { MODELS } = await import("@/features/ai/models");
  class NoKeyError extends Error {
    constructor(provider: string) {
      super(`Add your ${provider} API key to use this model.`);
    }
  }
  credentials.getChosenModel.mockImplementation(async (userId: string) =>
    MODELS.find((m) => m.apiModelId === chosenModel[userId]),
  );
  credentials.hasProviderKey.mockImplementation(async (userId: string, provider: string) =>
    Boolean(storedKeys[userId]?.[provider]),
  );
  credentials.getProviderCredentials.mockImplementation(async (userId: string, provider: string) => {
    const apiKey = storedKeys[userId]?.[provider];
    if (!apiKey) throw new NoKeyError(provider);
    return { apiKey, baseUrl: provider === "openai" ? "https://api.openai.com/v1" : "https://api.anthropic.com/v1" };
  });
  return { ...credentials, NoKeyError };
});

const agentModels: unknown[] = [];
vi.mock("@inngest/agent-kit", () => ({
  createTool: (tool: unknown) => tool,
  createAgent: (options: { model: unknown }) => {
    agentModels.push(options.model);
    return options;
  },
  createNetwork: () => ({
    run: async () => ({ state: { results: [{ output: [{ type: "text", role: "assistant", content: "Done" }] }] } }),
  }),
}));

const upstream = vi.fn();
vi.mock("@/features/ai/server/url-safety", () => ({ safeFetch: (...args: unknown[]) => upstream(...args) }));

const messagesRoute = await import("../../src/app/api/messages/route");
const proxyRoute = await import("../../src/app/api/ai-proxy/[provider]/[...path]/route");
const { processMessage } = (await import("@/features/conversations/inngest/process-message")) as unknown as {
  processMessage: { handler: (ctx: unknown) => Promise<unknown> };
};
const { resetSecretCachesForTests } = await import("@/features/ai/server/secrets");

beforeAll(() => {
  Object.assign(process.env, {
    AI_KEYS_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    AI_PROXY_TOKEN_SIGNING_KEY: randomBytes(32).toString("base64"),
    AI_CREDENTIALS_CONVEX_KEY: "c".repeat(44),
    ANUBITHIC_STUDIO_CONVEX_INTERNAL_KEY: "i".repeat(44),
    APP_URL: "https://app.test",
  });
  resetSecretCachesForTests();
});
afterAll(() => resetSecretCachesForTests());

beforeEach(() => {
  sentEvents.length = 0;
  convexCalls.length = 0;
  agentModels.length = 0;
  vi.clearAllMocks();
  storedKeys[OWNER] = { anthropic: OWNER_KEY };
  storedKeys[TEAMMATE] = { openai: TEAMMATE_KEY };
  upstream.mockResolvedValue(
    new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: "hi" } }] }), { status: 200 }),
  );
});

// The teammate sends a chat message in the owner's project, as the browser would
const teammateSends = async () => {
  signedIn = TEAMMATE;
  const response = await messagesRoute.POST(
    new Request("https://app.test/api/messages", {
      method: "POST",
      body: JSON.stringify({ conversationId: "conv_1", message: "Add a button" }),
    }),
  );
  expect(response.status).toBe(200);
  return sentEvents.find((e) => e.name === "message/sent")!;
};

// Inngest runs the agent function; step.run just runs the callback
const runAgent = (event: { data: Record<string, unknown> }) =>
  processMessage.handler({
    event,
    step: { run: async (_name: string, fn: () => unknown) => fn(), sleep: async () => {} },
  });

const usersLookedUp = () =>
  [credentials.getChosenModel, credentials.hasProviderKey, credentials.getProviderCredentials].flatMap((fn) =>
    fn.mock.calls.map((call) => call[0]),
  );

describe("shared projects: the sender pays", () => {
  it("a teammate's message runs on the teammate's model and key; the owner's key is never used", async () => {
    const event = await teammateSends();
    expect(event.data.userId).toBe(TEAMMATE); // from the Clerk session, not the request body

    await runAgent(event);
    const model = agentModels.at(-1) as { options: { apiKey: string; baseUrl: string } };
    expect(model.options.baseUrl).toBe("https://app.test/api/ai-proxy/openai/");

    // The agent's model calls the proxy with its pass, as agent-kit would
    const response = await proxyRoute.POST(
      new Request("https://app.test/api/ai-proxy/openai/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${model.options.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ model: "gpt-5.4-mini", messages: [] }),
      }),
      { params: Promise.resolve({ provider: "openai", path: ["chat", "completions"] }) },
    );
    expect(response.status).toBe(200);

    const [url, init] = upstream.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TEAMMATE_KEY}`);
    expect(JSON.stringify(upstream.mock.calls)).not.toContain(OWNER_KEY);

    expect(credentials.getProviderCredentials).toHaveBeenCalledWith(TEAMMATE, "openai");
    expect(usersLookedUp()).not.toContain(OWNER);
  });

  it("a teammate with no key gets 'add your key'; it never falls back to the owner's key", async () => {
    storedKeys[TEAMMATE] = {};
    const event = await teammateSends();

    await runAgent(event);

    const finish = convexCalls.find((c) => c.name === "system:updateMessageContent" && c.args.errorCode === "no_key");
    expect(finish?.args.status).toBe("completed");
    expect(agentModels).toHaveLength(0); // no agent, so no pass was ever made
    expect(credentials.getProviderCredentials).not.toHaveBeenCalled();
    expect(usersLookedUp()).not.toContain(OWNER);
    expect(upstream).not.toHaveBeenCalled();
  });
});
