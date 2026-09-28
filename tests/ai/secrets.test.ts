import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  assertAiSecurityConfig,
  parseEncryptionKeyring,
  parseProxySigningKey,
} from "@/features/ai/server/secrets";

const b64 = (bytes = 32) => randomBytes(bytes).toString("base64");

const validEnv = () => ({
  AI_KEYS_ENCRYPTION_KEY: b64(),
  AI_PROXY_TOKEN_SIGNING_KEY: b64(),
  AI_CREDENTIALS_CONVEX_KEY: b64(),
});

describe("encryption keyring", () => {
  it("defaults the current key to version 1", () => {
    const ring = parseEncryptionKeyring({ AI_KEYS_ENCRYPTION_KEY: b64() });
    expect(ring.currentVersion).toBe(1);
    expect(ring.keys.size).toBe(1);
  });

  it("loads old versions for rotation", () => {
    const ring = parseEncryptionKeyring({
      AI_KEYS_ENCRYPTION_KEY: b64(),
      AI_KEYS_ENCRYPTION_KEY_VERSION: "2",
      AI_KEYS_ENCRYPTION_OLD_KEYS: `1:${b64()}`,
    });
    expect(ring.currentVersion).toBe(2);
    expect([...ring.keys.keys()].sort()).toEqual([1, 2]);
  });

  it("fails closed on missing, short, duplicate or reused keys", () => {
    expect(() => parseEncryptionKeyring({})).toThrow(/not configured/);
    expect(() => parseEncryptionKeyring({ AI_KEYS_ENCRYPTION_KEY: b64(16) })).toThrow(/32 bytes/);
    const same = b64();
    expect(() =>
      parseEncryptionKeyring({
        AI_KEYS_ENCRYPTION_KEY: same,
        AI_KEYS_ENCRYPTION_KEY_VERSION: "2",
        AI_KEYS_ENCRYPTION_OLD_KEYS: `1:${same}`,
      }),
    ).toThrow(/different key/);
    expect(() =>
      parseEncryptionKeyring({
        AI_KEYS_ENCRYPTION_KEY: b64(),
        AI_KEYS_ENCRYPTION_OLD_KEYS: `1:${b64()}`,
      }),
    ).toThrow(/defined twice/);
    expect(() =>
      parseEncryptionKeyring({ AI_KEYS_ENCRYPTION_KEY: b64(), AI_KEYS_ENCRYPTION_KEY_VERSION: "0" }),
    ).toThrow(/positive integer/);
  });
});

describe("proxy signing key", () => {
  it("must exist, be long enough, and differ from every encryption key", () => {
    const encryption = b64();
    const ring = parseEncryptionKeyring({ AI_KEYS_ENCRYPTION_KEY: encryption });
    expect(() => parseProxySigningKey({}, ring)).toThrow(/not configured/);
    expect(() => parseProxySigningKey({ AI_PROXY_TOKEN_SIGNING_KEY: b64(16) }, ring)).toThrow(/at least/);
    expect(() => parseProxySigningKey({ AI_PROXY_TOKEN_SIGNING_KEY: encryption }, ring)).toThrow(/different/);
    expect(parseProxySigningKey({ AI_PROXY_TOKEN_SIGNING_KEY: b64() }, ring)).toHaveLength(32);
  });
});

describe("startup check", () => {
  it("passes a complete development config", () => {
    expect(assertAiSecurityConfig({ ...validEnv(), NODE_ENV: "development" })).toEqual([]);
  });

  it("fails closed in production on dangerous or missing settings", () => {
    const problems = assertAiSecurityConfig({
      ...validEnv(),
      NODE_ENV: "production",
      AI_ALLOW_ENV_KEYS: "true",
      APP_URL: "http://example.com",
      AI_KEY_ROTATION_CONVEX_KEY: b64(),
    });
    expect(problems.join("\n")).toMatch(/AI_ALLOW_ENV_KEYS/);
    expect(problems.join("\n")).toMatch(/APP_URL/);
    expect(problems.join("\n")).toMatch(/INNGEST_SIGNING_KEY/);
    expect(problems.join("\n")).toMatch(/INNGEST_EVENT_KEY/);
    expect(problems.join("\n")).toMatch(/AI_KEY_ROTATION_CONVEX_KEY/);
  });

  it("reports missing secrets without printing any secret value", () => {
    const env = { NODE_ENV: "production", AI_PROXY_TOKEN_SIGNING_KEY: b64() };
    const problems = assertAiSecurityConfig(env);
    expect(problems.join("\n")).toMatch(/AI_KEYS_ENCRYPTION_KEY is not configured/);
    expect(problems.join("\n")).not.toContain(env.AI_PROXY_TOKEN_SIGNING_KEY);
  });
});
