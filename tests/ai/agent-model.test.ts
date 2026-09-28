import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Prompt injection: if the agent never holds the key, no instruction can make it reveal it.
// The real key is available from the fake credentials; the agent's model must never touch it.
const PROVIDER_KEY = "sk-ant-api03-" + "Z".repeat(48);
const getProviderCredentials = vi.fn(async () => ({ apiKey: PROVIDER_KEY, baseUrl: "https://api.anthropic.com/v1" }));
vi.mock("@/features/ai/server/credentials", () => ({
  NoKeyError: class NoKeyError extends Error {},
  getChosenModel: vi.fn(),
  getProviderCredentials,
}));

const { createAgentModel } = await import("@/features/ai/server/resolve-model");
const { verifyProxyToken, PROXY_TOKEN_PREFIX } = await import("@/features/ai/server/proxy-token");
const { MODELS, localModelDefinition } = await import("@/features/ai/models");
const { resetSecretCachesForTests } = await import("@/features/ai/server/secrets");

beforeAll(() => {
  Object.assign(process.env, {
    AI_KEYS_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    AI_PROXY_TOKEN_SIGNING_KEY: randomBytes(32).toString("base64"),
    APP_URL: "https://app.test",
  });
  resetSecretCachesForTests();
});
afterAll(() => resetSecretCachesForTests());

const scope = { userId: "user_a", projectId: "proj_a", runId: "msg_a" };

describe("coding agent model (prompt-injection boundary)", () => {
  it.each([...MODELS, localModelDefinition("qwen2.5:14b", true)].map((m) => [m.id, m] as const))(
    "%s: the agent holds only a scoped pass to our proxy, never the provider key",
    (_id, definition) => {
      const model = createAgentModel(definition, scope, { maxTokens: 1000 });
      const everything = JSON.stringify(model);

      // The key is never loaded, so nothing the agent sees can contain it
      expect(getProviderCredentials).not.toHaveBeenCalled();
      expect(everything).not.toContain(PROVIDER_KEY);
      expect(everything).toContain(PROXY_TOKEN_PREFIX + "."); // the check really sees the options

      const { apiKey, baseUrl } = model.options as { apiKey: string; baseUrl: string };
      expect(apiKey.startsWith(`${PROXY_TOKEN_PREFIX}.`)).toBe(true);
      expect(baseUrl).toBe(`https://app.test/api/ai-proxy/${definition.provider}/`);

      // The pass is locked to this user, model, project and run
      const verified = verifyProxyToken(apiKey, { provider: definition.provider, model: definition.apiModelId });
      expect(verified).toMatchObject({ ok: true, payload: { sub: "user_a", prj: "proj_a", run: "msg_a" } });
    },
  );
});
