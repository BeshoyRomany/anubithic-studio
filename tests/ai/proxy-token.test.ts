import { createHmac, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  createProxyToken,
  PROXY_TOKEN_TTL_MS,
  verifyProxyToken,
} from "@/features/ai/server/proxy-token";

const key = randomBytes(32);
const otherKey = randomBytes(32);
const now = 1_800_000_000_000;
const scope = {
  userId: "user_a",
  provider: "anthropic" as const,
  model: "claude-haiku-4-5-20251001",
  projectId: "proj_a",
  runId: "msg_a",
};

const mint = (overrides = {}, at = now) =>
  createProxyToken({ ...scope, ...overrides }, { now: at, key });

const decodePayload = (token: string) =>
  JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());

const encode = (payload: object) =>
  Buffer.from(JSON.stringify(payload)).toString("base64url");

describe("proxy token", () => {
  it("accepts a valid token and exposes its full scope", () => {
    const check = verifyProxyToken(mint(), { provider: "anthropic", model: scope.model }, { now, key });
    expect(check.ok).toBe(true);
    if (check.ok) {
      expect(check.payload).toMatchObject({
        sub: "user_a",
        prv: "anthropic",
        mdl: scope.model,
        prj: "proj_a",
        run: "msg_a",
      });
      expect(check.payload.exp - check.payload.iat).toBe(PROXY_TOKEN_TTL_MS);
    }
  });

  it("gives every token a unique id (jti)", () => {
    expect(decodePayload(mint()).jti).not.toBe(decodePayload(mint()).jti);
  });

  it("rejects an expired token", () => {
    const check = verifyProxyToken(mint(), { provider: "anthropic" }, { now: now + PROXY_TOKEN_TTL_MS, key });
    expect(check).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects a modified payload (e.g. userId, project or run swapped)", () => {
    const token = mint();
    const [prefix, , signature] = token.split(".");
    for (const change of [{ sub: "user_b" }, { prj: "proj_b" }, { run: "msg_b" }, { mdl: "claude-opus-5-5" }]) {
      const forged = `${prefix}.${encode({ ...decodePayload(token), ...change })}.${signature}`;
      expect(verifyProxyToken(forged, { provider: "anthropic" }, { now, key })).toEqual({
        ok: false,
        reason: "bad_signature",
      });
    }
  });

  it("rejects a token signed with another key", () => {
    const foreign = createProxyToken(scope, { now, key: otherKey });
    expect(verifyProxyToken(foreign, { provider: "anthropic" }, { now, key }).ok).toBe(false);
  });

  it("rejects the wrong provider and the wrong model", () => {
    expect(verifyProxyToken(mint(), { provider: "openai" }, { now, key })).toEqual({
      ok: false,
      reason: "wrong_provider",
    });
    expect(verifyProxyToken(mint(), { provider: "anthropic", model: "claude-opus-5-5" }, { now, key })).toEqual({
      ok: false,
      reason: "wrong_model",
    });
  });

  it("rejects malformed tokens", () => {
    for (const bad of ["", "abc", "abpt1.x", "abpt1.x.y.z", `other.${encode({})}.sig`, "a".repeat(5000)]) {
      expect(verifyProxyToken(bad, { provider: "anthropic" }, { now, key }).ok).toBe(false);
    }
  });

  it("rejects a correctly signed payload with an over-long lifetime or extra fields", () => {
    const sign = (payload: object) => {
      // re-mint by hand with the real key to prove the schema check itself works
      const body = `abpt1.${encode(payload)}`;
      return `${body}.${createHmac("sha256", key).update(body).digest("base64url")}`;
    };
    const base = decodePayload(mint());
    expect(verifyProxyToken(sign({ ...base, exp: base.iat + 24 * 3600_000 }), { provider: "anthropic" }, { now, key })).toEqual({ ok: false, reason: "malformed" });
    expect(verifyProxyToken(sign({ ...base, admin: true }), { provider: "anthropic" }, { now, key })).toEqual({ ok: false, reason: "malformed" });
  });
});
