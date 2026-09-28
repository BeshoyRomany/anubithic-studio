import "server-only";

import { timingSafeEqual } from "node:crypto";

//#region AI secrets
// Every secret has exactly one purpose, and none is derived from another:
//   AI_KEYS_ENCRYPTION_KEY         encrypts/decrypts stored provider keys (current version)
//   AI_KEYS_ENCRYPTION_KEY_VERSION the version number of that key (default 1)
//   AI_KEYS_ENCRYPTION_OLD_KEYS    "1:<base64>,2:<base64>" — previous keys, kept only
//                                  until `scripts/rotate-ai-keys.mts` has migrated every row
//   AI_PROXY_TOKEN_SIGNING_KEY     signs/verifies agent proxy tokens
// Nothing here is generated at runtime: a missing or malformed secret is an error.
//#endregion

const MIN_SIGNING_KEY_BYTES = 32;

export class AiSecretConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiSecretConfigError";
  }
}

const decode32 = (value: string, name: string) => {
  const bytes = Buffer.from(value.trim(), "base64");
  if (bytes.length !== 32) {
    throw new AiSecretConfigError(`${name} must be 32 bytes, base64-encoded`);
  }
  return bytes;
};

export interface EncryptionKeyring {
  currentVersion: number;
  keys: ReadonlyMap<number, Buffer>;
}

const parseVersion = (raw: string, name: string) => {
  const version = Number(raw);
  if (!Number.isInteger(version) || version < 1) {
    throw new AiSecretConfigError(`${name} must be a positive integer`);
  }
  return version;
};

// Exported for tests; the app uses getEncryptionKeyring().
export const parseEncryptionKeyring = (
  env: Record<string, string | undefined>,
): EncryptionKeyring => {
  const current = env.AI_KEYS_ENCRYPTION_KEY;
  if (!current) {
    throw new AiSecretConfigError("AI_KEYS_ENCRYPTION_KEY is not configured");
  }

  const currentVersion = parseVersion(
    env.AI_KEYS_ENCRYPTION_KEY_VERSION ?? "1",
    "AI_KEYS_ENCRYPTION_KEY_VERSION",
  );
  const keys = new Map<number, Buffer>([
    [currentVersion, decode32(current, "AI_KEYS_ENCRYPTION_KEY")],
  ]);

  for (const entry of (env.AI_KEYS_ENCRYPTION_OLD_KEYS ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)) {
    const separator = entry.indexOf(":");
    if (separator < 1) {
      throw new AiSecretConfigError(
        'AI_KEYS_ENCRYPTION_OLD_KEYS entries must look like "<version>:<base64>"',
      );
    }
    const version = parseVersion(
      entry.slice(0, separator),
      "AI_KEYS_ENCRYPTION_OLD_KEYS version",
    );
    if (keys.has(version)) {
      throw new AiSecretConfigError(
        `Encryption key version ${version} is defined twice`,
      );
    }
    keys.set(
      version,
      decode32(
        entry.slice(separator + 1),
        `AI_KEYS_ENCRYPTION_OLD_KEYS v${version}`,
      ),
    );
  }

  // Two versions sharing one key would make "rotation" a no-op
  const values = [...keys.values()];
  values.forEach((key, index) => {
    if (values.slice(index + 1).some((other) => timingSafeEqual(key, other))) {
      throw new AiSecretConfigError(
        "Each encryption key version must use a different key",
      );
    }
  });

  return { currentVersion, keys };
};

// Exported for tests; the app uses getProxySigningKey().
export const parseProxySigningKey = (
  env: Record<string, string | undefined>,
  keyring: EncryptionKeyring,
) => {
  const raw = env.AI_PROXY_TOKEN_SIGNING_KEY;
  if (!raw) {
    throw new AiSecretConfigError(
      "AI_PROXY_TOKEN_SIGNING_KEY is not configured",
    );
  }
  const bytes = Buffer.from(raw.trim(), "base64");
  if (bytes.length < MIN_SIGNING_KEY_BYTES) {
    throw new AiSecretConfigError(
      `AI_PROXY_TOKEN_SIGNING_KEY must be at least ${MIN_SIGNING_KEY_BYTES} bytes, base64-encoded`,
    );
  }
  for (const key of keyring.keys.values()) {
    if (key.length === bytes.length && timingSafeEqual(key, bytes)) {
      throw new AiSecretConfigError(
        "AI_PROXY_TOKEN_SIGNING_KEY must be different from every encryption key",
      );
    }
  }
  return bytes;
};

// Parsed once per process; env vars don't change at runtime.
let keyringCache: EncryptionKeyring | undefined;
let signingKeyCache: Buffer | undefined;

export const getEncryptionKeyring = () =>
  (keyringCache ??= parseEncryptionKeyring(process.env));

export const getProxySigningKey = () =>
  (signingKeyCache ??= parseProxySigningKey(
    process.env,
    getEncryptionKeyring(),
  ));

// For tests that change env between cases.
export const resetSecretCachesForTests = () => {
  keyringCache = undefined;
  signingKeyCache = undefined;
};

// Checked at server start (instrumentation.ts). In production a problem stops the
// server instead of letting it run with a weaker configuration.
export const assertAiSecurityConfig = (
  env: Record<string, string | undefined> = process.env,
) => {
  const problems: string[] = [];
  const attempt = (check: () => void) => {
    try {
      check();
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
    }
  };

  let keyring: EncryptionKeyring | undefined;
  attempt(() => {
    keyring = parseEncryptionKeyring(env);
  });
  if (keyring) attempt(() => parseProxySigningKey(env, keyring!));

  if (!env.AI_CREDENTIALS_CONVEX_KEY) {
    problems.push("AI_CREDENTIALS_CONVEX_KEY is not configured");
  }

  if (env.NODE_ENV === "production") {
    if (env.AI_ALLOW_ENV_KEYS === "true") {
      problems.push("AI_ALLOW_ENV_KEYS must not be enabled in production");
    }
    if (!env.APP_URL?.startsWith("https://")) {
      problems.push("APP_URL must be the public https:// URL in production");
    }
    if (!env.INNGEST_SIGNING_KEY) {
      problems.push("INNGEST_SIGNING_KEY is required in production");
    }
    if (!env.INNGEST_EVENT_KEY) {
      problems.push("INNGEST_EVENT_KEY is required in production");
    }
    if (env.AI_KEY_ROTATION_CONVEX_KEY) {
      problems.push(
        "AI_KEY_ROTATION_CONVEX_KEY must not be set in the app runtime (rotation script only)",
      );
    }
  }

  return problems;
};
