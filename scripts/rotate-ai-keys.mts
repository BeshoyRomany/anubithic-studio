// Re-encrypts every stored AI key under the CURRENT encryption key version.
//
//   npm run ai:rotate-keys            # dry run: decrypts + re-encrypts in memory, writes nothing
//   npm run ai:rotate-keys -- --apply # writes the re-encrypted rows (compare-and-swap)
//
// Needs, in the environment it runs in (see docs/security/byok.md for the runbook):
//   NEXT_PUBLIC_CONVEX_URL, AI_KEY_ROTATION_CONVEX_KEY,
//   AI_KEYS_ENCRYPTION_KEY + AI_KEYS_ENCRYPTION_KEY_VERSION (the NEW key),
//   AI_KEYS_ENCRYPTION_OLD_KEYS (every version still in use).
//
// Safety: each row is decrypted with its own version, re-encrypted, and decrypted AGAIN before
// being written; the write only happens if the row still holds the exact ciphertext that was
// read. A failure leaves that row untouched and is reported. Output never contains key
// material or user ids — only counts and row ids.

import { ConvexHttpClient } from "convex/browser";

import { anyApi } from "convex/server";
import type { api as GeneratedApi } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import type { AiProvider } from "../src/features/ai/models";
import { rewrapKey } from "../src/features/ai/server/key-crypto";
import { getEncryptionKeyring } from "../src/features/ai/server/secrets";

// Node loads the generated api.js as CommonJS in .mts scripts; anyApi is the same object
const api = anyApi as unknown as typeof GeneratedApi;

const apply = process.argv.includes("--apply");
const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const rotationKey = process.env.AI_KEY_ROTATION_CONVEX_KEY;

if (!convexUrl || !rotationKey) {
  console.error("NEXT_PUBLIC_CONVEX_URL and AI_KEY_ROTATION_CONVEX_KEY are required");
  process.exit(1);
}

const convex = new ConvexHttpClient(convexUrl);
const keyring = getEncryptionKeyring();
const target = keyring.currentVersion;

const counts = await convex.query(api.aiKeyRotation.countByVersion, { rotationKey });
console.log(`Mode: ${apply ? "APPLY" : "dry run"} · target version ${target}`);
console.log("Rows per key version:", counts);

const oldVersions = Object.keys(counts)
  .map(Number)
  .filter((version) => version !== target);

const missing = oldVersions.filter((version) => !keyring.keys.has(version));
if (missing.length > 0) {
  console.error(
    `Missing old keys for version(s) ${missing.join(", ")} in AI_KEYS_ENCRYPTION_OLD_KEYS. Nothing was changed.`,
  );
  process.exit(1);
}

let rewrapped = 0;
let verified = 0;
let skipped = 0;
const failed: string[] = [];

for (const version of oldVersions) {
  // Read everything first, then write: rows leave this index as they are rewrapped
  const rows: Awaited<ReturnType<typeof listPage>>["page"] = [];
  let cursor: string | null = null;
  do {
    const page = await listPage(version, cursor);
    rows.push(...page.page);
    cursor = page.isDone ? null : page.continueCursor;
  } while (cursor);

  for (const row of rows) {
    let next;
    try {
      next = rewrapKey(row, row.userId, row.provider as AiProvider, keyring);
    } catch {
      failed.push(String(row.id));
      continue;
    }
    verified++;
    if (!apply) continue;

    const result = await convex.mutation(api.aiKeyRotation.rewrap, {
      rotationKey,
      id: row.id as Id<"aiKeys">,
      expectedCiphertext: row.ciphertext,
      expectedKeyVersion: row.keyVersion,
      ...next,
    });
    if (result.status === "rewrapped") rewrapped++;
    else skipped++;
  }
}

console.log(
  apply
    ? `Rewrapped ${rewrapped}, skipped ${skipped} (changed by the user meanwhile), failed ${failed.length}`
    : `Would rewrap ${verified} row(s); failed verification ${failed.length}`,
);
if (failed.length > 0) console.error("Failed row ids:", failed.join(", "));
console.log(
  "Rows per key version now:",
  await convex.query(api.aiKeyRotation.countByVersion, { rotationKey }),
);
process.exit(failed.length > 0 ? 1 : 0);

function listPage(keyVersion: number, cursor: string | null) {
  return convex.query(api.aiKeyRotation.listByVersion, {
    rotationKey: rotationKey!,
    keyVersion,
    cursor,
  });
}
