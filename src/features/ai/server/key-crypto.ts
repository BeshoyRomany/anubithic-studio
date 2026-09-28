import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import type { AiProvider } from "../models";
import { EncryptionKeyring, getEncryptionKeyring } from "./secrets";

// AES-256-GCM: a random 96-bit IV per encryption, a 128-bit auth tag, and AAD binding the
// ciphertext to its owner and provider. `keyVersion` picks the master key from the keyring.
export interface EncryptedKey {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
}

export class KeyVersionUnavailableError extends Error {
  constructor(public readonly keyVersion: number) {
    super(`Encryption key version ${keyVersion} is not configured`);
    this.name = "KeyVersionUnavailableError";
  }
}

// Binds a ciphertext to its owner, so a row copied onto another user or provider fails to decrypt.
const associatedData = (userId: string, provider: AiProvider) =>
  Buffer.from(`${userId}:${provider}`);

export const encryptKey = (
  apiKey: string,
  userId: string,
  provider: AiProvider,
  keyring: EncryptionKeyring = getEncryptionKeyring(),
): EncryptedKey => {
  const secret = keyring.keys.get(keyring.currentVersion)!;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secret, iv);
  cipher.setAAD(associatedData(userId, provider));

  const ciphertext = Buffer.concat([
    cipher.update(apiKey, "utf8"),
    cipher.final(),
  ]);

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    keyVersion: keyring.currentVersion,
  };
};

// Throws on a wrong version, owner, provider, or any modified byte (GCM authentication).
export const decryptKey = (
  encrypted: EncryptedKey,
  userId: string,
  provider: AiProvider,
  keyring: EncryptionKeyring = getEncryptionKeyring(),
): string => {
  const secret = keyring.keys.get(encrypted.keyVersion);
  if (!secret) {
    throw new KeyVersionUnavailableError(encrypted.keyVersion);
  }

  const authTag = Buffer.from(encrypted.authTag, "base64");
  const iv = Buffer.from(encrypted.iv, "base64");
  // Reject truncated tags/IVs explicitly: GCM would otherwise accept a shorter tag
  if (authTag.length !== 16 || iv.length !== 12) {
    throw new Error("Malformed encrypted key");
  }

  const decipher = createDecipheriv("aes-256-gcm", secret, iv, {
    authTagLength: 16,
  });
  decipher.setAAD(associatedData(userId, provider));
  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
};

// Rotation: re-encrypts a stored key under the current version. The new ciphertext is
// decrypted again and compared before it is returned, so a bad rewrap is never written.
export const rewrapKey = (
  encrypted: EncryptedKey,
  userId: string,
  provider: AiProvider,
  keyring: EncryptionKeyring = getEncryptionKeyring(),
): EncryptedKey => {
  const plaintext = decryptKey(encrypted, userId, provider, keyring);
  const rewrapped = encryptKey(plaintext, userId, provider, keyring);

  if (decryptKey(rewrapped, userId, provider, keyring) !== plaintext) {
    throw new Error("Rewrap verification failed");
  }
  return rewrapped;
};
