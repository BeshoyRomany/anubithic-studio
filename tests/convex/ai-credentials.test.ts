// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.ts");

const CREDENTIALS_KEY = "c".repeat(44);
const INTERNAL_KEY = "i".repeat(44);
const ROTATION_KEY = "r".repeat(44);

const encrypted = (tag: string, keyVersion = 1) => ({
  ciphertext: `ciphertext-${tag}`,
  iv: `iv-${tag}`,
  authTag: `tag-${tag}`,
  keyVersion,
});

beforeEach(() => {
  process.env.CLERK_JWT_ISSUER_DOMAIN = "https://clerk.example.test";
  process.env.AI_CREDENTIALS_CONVEX_KEY = CREDENTIALS_KEY;
  process.env.ANUBITHIC_STUDIO_CONVEX_INTERNAL_KEY = INTERNAL_KEY;
  delete process.env.AI_KEY_ROTATION_CONVEX_KEY;
});
afterEach(() => {
  delete process.env.AI_KEY_ROTATION_CONVEX_KEY;
});

const setup = () => convexTest(schema, modules);

// A project owned by user_a with one conversation and one assistant message (the run)
const seedRun = async (
  t: ReturnType<typeof setup>,
  status: "processing" | "completed" = "processing",
) =>
  t.run(async (ctx) => {
    const projectId = await ctx.db.insert("projects", {
      name: "p",
      ownerId: "user_a",
      updatedAt: 0,
    });
    const otherProjectId = await ctx.db.insert("projects", {
      name: "q",
      ownerId: "user_a",
      updatedAt: 0,
    });
    const conversationId = await ctx.db.insert("conversations", {
      projectId,
      title: "c",
      updatedAt: 0,
    });
    const runId = await ctx.db.insert("messages", {
      conversationId,
      projectId,
      role: "assistant",
      content: "Analyzing...",
      status,
    });
    return { projectId, otherProjectId, runId };
  });

describe("key storage authorization", () => {
  it("saving requires the server credential AND the user's own session", async () => {
    const t = setup();
    const args = { provider: "openai" as const, last4: "abcd", ...encrypted("a") };

    await expect(t.mutation(api.aiCredentials.saveKey, { credentialsKey: CREDENTIALS_KEY, ...args })).rejects.toThrow(/Unauthenticated/);

    const asA = t.withIdentity({ subject: "user_a" });
    await expect(asA.mutation(api.aiCredentials.saveKey, { credentialsKey: "wrong".repeat(10), ...args })).rejects.toThrow(/Invalid server credential/);
    await expect(asA.mutation(api.aiCredentials.saveKey, { credentialsKey: INTERNAL_KEY, ...args })).rejects.toThrow(/Invalid server credential/);

    await asA.mutation(api.aiCredentials.saveKey, { credentialsKey: CREDENTIALS_KEY, ...args });
    const stored = await t.query(api.aiCredentials.getKey, { credentialsKey: CREDENTIALS_KEY, userId: "user_a", provider: "openai" });
    expect(stored?.ciphertext).toBe("ciphertext-a");
  });

  it("user A cannot write user B's key (owner comes from the session, not an argument)", async () => {
    const t = setup();
    const asA = t.withIdentity({ subject: "user_a" });
    await expect(
      asA.mutation(api.aiCredentials.saveKey, {
        credentialsKey: CREDENTIALS_KEY,
        provider: "openai",
        last4: "abcd",
        ...encrypted("a"),
        // @ts-expect-error — the function takes no userId
        userId: "user_b",
      }),
    ).rejects.toThrow();

    await asA.mutation(api.aiCredentials.saveKey, { credentialsKey: CREDENTIALS_KEY, provider: "openai", last4: "abcd", ...encrypted("a") });
    expect(await t.query(api.aiCredentials.getKey, { credentialsKey: CREDENTIALS_KEY, userId: "user_b", provider: "openai" })).toBeNull();
  });

  it("reading ciphertext needs the AI credential; the general internal key is refused", async () => {
    const t = setup();
    await expect(t.query(api.aiCredentials.getKey, { credentialsKey: INTERNAL_KEY, userId: "user_a", provider: "openai" })).rejects.toThrow(/Invalid server credential/);
    await expect(t.query(api.aiCredentials.getSettings, { credentialsKey: "", userId: "user_a" })).rejects.toThrow();
  });

  it("fails closed when the credential is not configured on Convex", async () => {
    const t = setup();
    delete process.env.AI_CREDENTIALS_CONVEX_KEY;
    await expect(t.query(api.aiCredentials.getKey, { credentialsKey: CREDENTIALS_KEY, userId: "user_a", provider: "openai" })).rejects.toThrow(/not configured/);
  });

  it("the browser API is scoped to the caller: user B can't list or delete user A's key", async () => {
    const t = setup();
    const asA = t.withIdentity({ subject: "user_a" });
    const asB = t.withIdentity({ subject: "user_b" });
    await asA.mutation(api.aiCredentials.saveKey, { credentialsKey: CREDENTIALS_KEY, provider: "openai", last4: "abcd", ...encrypted("a") });

    expect(await asB.query(api.aiKeys.list, {})).toEqual([]);
    await asB.mutation(api.aiKeys.remove, { provider: "openai" });
    expect(await t.query(api.aiCredentials.getKey, { credentialsKey: CREDENTIALS_KEY, userId: "user_a", provider: "openai" })).not.toBeNull();

    const listed = await asA.query(api.aiKeys.list, {});
    expect(listed).toHaveLength(1);
    expect(JSON.stringify(listed)).not.toContain("ciphertext");
  });

  it("user A cannot redirect user B's local model", async () => {
    const t = setup();
    const asA = t.withIdentity({ subject: "user_a" });
    await asA.mutation(api.aiCredentials.saveLocalModel, {
      credentialsKey: CREDENTIALS_KEY,
      ollamaBaseUrl: "https://attacker.example",
      localModel: "qwen2.5:14b",
      localModelSupportsTools: true,
    });
    expect(await t.query(api.aiCredentials.getSettings, { credentialsKey: CREDENTIALS_KEY, userId: "user_b" })).toBeNull();
    expect((await t.query(api.aiCredentials.getSettings, { credentialsKey: CREDENTIALS_KEY, userId: "user_a" }))?.ollamaBaseUrl).toBe("https://attacker.example");
  });
});

describe("revocation and replacement", () => {
  it("replacing a key removes the previous ciphertext; deleting removes the key; both are audited", async () => {
    const t = setup();
    const asA = t.withIdentity({ subject: "user_a" });
    const save = (tag: string) =>
      asA.mutation(api.aiCredentials.saveKey, { credentialsKey: CREDENTIALS_KEY, provider: "anthropic", last4: "wxyz", ...encrypted(tag) });
    const get = () => t.query(api.aiCredentials.getKey, { credentialsKey: CREDENTIALS_KEY, userId: "user_a", provider: "anthropic" });

    await save("old");
    await save("new");
    expect((await get())?.ciphertext).toBe("ciphertext-new");
    const rows = await t.run((ctx) => ctx.db.query("aiKeys").collect());
    expect(rows).toHaveLength(1);

    await asA.mutation(api.aiKeys.remove, { provider: "anthropic" });
    expect(await get()).toBeNull(); // the next request finds no key

    const audit = await t.run((ctx) => ctx.db.query("aiKeyAudit").collect());
    expect(audit.map((row) => row.action)).toEqual(["saved", "replaced", "deleted"]);
    expect(JSON.stringify(audit)).not.toContain("ciphertext");
  });
});

describe("agent proxy token: run binding and replay budget", () => {
  const consume = (t: ReturnType<typeof setup>, overrides: Record<string, unknown>) =>
    t.mutation(api.aiCredentials.consumeProxyToken, {
      credentialsKey: CREDENTIALS_KEY,
      jti: "11111111-1111-4111-8111-111111111111",
      userId: "user_a",
      projectId: "",
      runId: "",
      expiresAt: Date.now() + 60_000,
      maxUses: 2,
      ...overrides,
    });

  it("accepts the right user/project/run, then stops after the replay budget", async () => {
    const t = setup();
    const { projectId, runId } = await seedRun(t);
    expect(await consume(t, { projectId, runId })).toEqual({ ok: true });
    expect(await consume(t, { projectId, runId })).toEqual({ ok: true });
    expect(await consume(t, { projectId, runId })).toEqual({ ok: false, reason: "replayed" });
  });

  it("rejects a token from project A used for project B", async () => {
    const t = setup();
    const { otherProjectId, runId } = await seedRun(t);
    expect(await consume(t, { projectId: otherProjectId, runId })).toEqual({ ok: false, reason: "wrong_project" });
  });

  it("rejects an unknown or malformed run id", async () => {
    const t = setup();
    const { projectId } = await seedRun(t);
    expect(await consume(t, { projectId, runId: "not-an-id" })).toEqual({ ok: false, reason: "wrong_run" });
  });

  it("rejects a jti reused for a different run", async () => {
    const t = setup();
    const a = await seedRun(t);
    const b = await seedRun(t);
    expect(await consume(t, { projectId: a.projectId, runId: a.runId })).toEqual({ ok: true });
    expect(await consume(t, { projectId: b.projectId, runId: b.runId })).toEqual({ ok: false, reason: "wrong_run" });
  });

  it("dies with the run: a finished run's token is refused", async () => {
    const t = setup();
    const { projectId, runId } = await seedRun(t, "completed");
    expect(await consume(t, { projectId, runId })).toEqual({ ok: false, reason: "run_finished" });
  });

  it("refuses a user who is not a member of the project", async () => {
    const t = setup();
    const { projectId, runId } = await seedRun(t);
    expect(await consume(t, { projectId, runId, userId: "user_b" })).toEqual({ ok: false, reason: "not_member" });
  });

  it("refuses an expired token and a missing credential", async () => {
    const t = setup();
    const { projectId, runId } = await seedRun(t);
    expect(await consume(t, { projectId, runId, expiresAt: Date.now() - 1 })).toEqual({ ok: false, reason: "expired" });
    await expect(consume(t, { projectId, runId, credentialsKey: INTERNAL_KEY })).rejects.toThrow(/Invalid server credential/);
  });
});

describe("rate limiting", () => {
  it("allows `limit` calls per window, then refuses", async () => {
    const t = setup();
    const hit = () =>
      t.mutation(api.aiCredentials.consumeRateLimit, { credentialsKey: CREDENTIALS_KEY, key: "ai-proxy:user_a:anthropic:m", limit: 2, windowMs: 60_000 });
    expect((await hit()).ok).toBe(true);
    expect((await hit()).ok).toBe(true);
    const third = await hit();
    expect(third.ok).toBe(false);
    expect(third.retryAfterMs).toBeGreaterThan(0);
  });
});

describe("master-key rotation functions", () => {
  it("are unreachable unless the rotation key is set on Convex (fail closed)", async () => {
    const t = setup();
    await expect(t.query(api.aiKeyRotation.countByVersion, { rotationKey: ROTATION_KEY })).rejects.toThrow(/not configured/);
    process.env.AI_KEY_ROTATION_CONVEX_KEY = ROTATION_KEY;
    await expect(t.query(api.aiKeyRotation.countByVersion, { rotationKey: CREDENTIALS_KEY })).rejects.toThrow(/Invalid server credential/);
  });

  it("rewrap is compare-and-swap and audited", async () => {
    const t = setup();
    process.env.AI_KEY_ROTATION_CONVEX_KEY = ROTATION_KEY;
    const asA = t.withIdentity({ subject: "user_a" });
    await asA.mutation(api.aiCredentials.saveKey, { credentialsKey: CREDENTIALS_KEY, provider: "openai", last4: "abcd", ...encrypted("v1", 1) });

    expect(await t.query(api.aiKeyRotation.countByVersion, { rotationKey: ROTATION_KEY })).toEqual({ 1: 1 });
    const { page } = await t.query(api.aiKeyRotation.listByVersion, { rotationKey: ROTATION_KEY, keyVersion: 1, cursor: null });
    const row = page[0];

    // stale expectation (the user replaced the key meanwhile) → nothing written
    const stale = await t.mutation(api.aiKeyRotation.rewrap, {
      rotationKey: ROTATION_KEY, id: row.id, expectedCiphertext: "something-else", expectedKeyVersion: 1, ...encrypted("v2", 2),
    });
    expect(stale.status).toBe("skipped_changed");

    const done = await t.mutation(api.aiKeyRotation.rewrap, {
      rotationKey: ROTATION_KEY, id: row.id, expectedCiphertext: row.ciphertext, expectedKeyVersion: 1, ...encrypted("v2", 2),
    });
    expect(done.status).toBe("rewrapped");
    expect(await t.query(api.aiKeyRotation.countByVersion, { rotationKey: ROTATION_KEY })).toEqual({ 2: 1 });

    const audit = await t.run((ctx) => ctx.db.query("aiKeyAudit").collect());
    expect(audit.at(-1)).toMatchObject({ action: "rewrapped", actor: "rotation", keyVersion: 2 });
  });
});
