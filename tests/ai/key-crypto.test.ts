import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  decryptKey,
  encryptKey,
  KeyVersionUnavailableError,
  rewrapKey,
} from "@/features/ai/server/key-crypto";
import type { EncryptionKeyring } from "@/features/ai/server/secrets";

const key1 = randomBytes(32);
const key2 = randomBytes(32);
const keyringV1: EncryptionKeyring = { currentVersion: 1, keys: new Map([[1, key1]]) };
const keyringV2: EncryptionKeyring = {
  currentVersion: 2,
  keys: new Map([
    [1, key1],
    [2, key2],
  ]),
};
const onlyV2: EncryptionKeyring = { currentVersion: 2, keys: new Map([[2, key2]]) };

const SECRET = "sk-ant-api03-TESTONLY-" + "x".repeat(40);

const flipFirstByte = (b64: string) => {
  const bytes = Buffer.from(b64, "base64");
  bytes[0] ^= 0xff;
  return bytes.toString("base64");
};

describe("key encryption (AES-256-GCM)", () => {
  it("round-trips", () => {
    const sealed = encryptKey(SECRET, "user_a", "anthropic", keyringV1);
    expect(decryptKey(sealed, "user_a", "anthropic", keyringV1)).toBe(SECRET);
    expect(sealed.keyVersion).toBe(1);
    expect(JSON.stringify(sealed)).not.toContain("sk-ant");
  });

  it("uses a unique IV every time (randomized, not deterministic)", () => {
    const a = encryptKey(SECRET, "user_a", "anthropic", keyringV1);
    const b = encryptKey(SECRET, "user_a", "anthropic", keyringV1);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(Buffer.from(a.iv, "base64")).toHaveLength(12);
  });

  it("rejects the wrong user (AAD)", () => {
    const sealed = encryptKey(SECRET, "user_a", "anthropic", keyringV1);
    expect(() => decryptKey(sealed, "user_b", "anthropic", keyringV1)).toThrow();
  });

  it("rejects the wrong provider (AAD)", () => {
    const sealed = encryptKey(SECRET, "user_a", "anthropic", keyringV1);
    expect(() => decryptKey(sealed, "user_a", "openai", keyringV1)).toThrow();
  });

  it("rejects modified ciphertext", () => {
    const sealed = encryptKey(SECRET, "user_a", "anthropic", keyringV1);
    const tampered = { ...sealed, ciphertext: flipFirstByte(sealed.ciphertext) };
    expect(() => decryptKey(tampered, "user_a", "anthropic", keyringV1)).toThrow();
  });

  it("rejects a modified or truncated auth tag", () => {
    const sealed = encryptKey(SECRET, "user_a", "anthropic", keyringV1);
    const flipped = { ...sealed, authTag: flipFirstByte(sealed.authTag) };
    expect(() => decryptKey(flipped, "user_a", "anthropic", keyringV1)).toThrow();
    const truncated = {
      ...sealed,
      authTag: Buffer.from(sealed.authTag, "base64").subarray(0, 8).toString("base64"),
    };
    expect(() => decryptKey(truncated, "user_a", "anthropic", keyringV1)).toThrow();
  });

  it("rejects a key version that isn't configured", () => {
    const sealed = encryptKey(SECRET, "user_a", "anthropic", keyringV1);
    expect(() => decryptKey(sealed, "user_a", "anthropic", onlyV2)).toThrow(
      KeyVersionUnavailableError,
    );
  });

  it("rejects the right version number with the wrong key", () => {
    const sealed = encryptKey(SECRET, "user_a", "anthropic", keyringV1);
    const wrongKeyV1: EncryptionKeyring = {
      currentVersion: 1,
      keys: new Map([[1, randomBytes(32)]]),
    };
    expect(() => decryptKey(sealed, "user_a", "anthropic", wrongKeyV1)).toThrow();
  });
});

describe("key rotation (rewrap)", () => {
  it("re-encrypts a v1 key under v2 without the user re-entering it", () => {
    const v1 = encryptKey(SECRET, "user_a", "openai", keyringV1);
    const v2 = rewrapKey(v1, "user_a", "openai", keyringV2);

    expect(v2.keyVersion).toBe(2);
    expect(decryptKey(v2, "user_a", "openai", onlyV2)).toBe(SECRET);
    // the old ciphertext still decrypts with the old key until it is replaced
    expect(decryptKey(v1, "user_a", "openai", keyringV2)).toBe(SECRET);
  });

  it("new keys always use the current version", () => {
    expect(encryptKey(SECRET, "user_a", "openai", keyringV2).keyVersion).toBe(2);
  });

  it("refuses to rewrap a tampered row (so it is never written)", () => {
    const v1 = encryptKey(SECRET, "user_a", "openai", keyringV1);
    const tampered = { ...v1, ciphertext: flipFirstByte(v1.ciphertext) };
    expect(() => rewrapKey(tampered, "user_a", "openai", keyringV2)).toThrow();
  });
});
