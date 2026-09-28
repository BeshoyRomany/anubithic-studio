# BYOK key security: design, operations and threat model

How Anubithic Studio stores and uses users' AI provider keys. This describes the code as it
is; nothing here is a guarantee beyond what the code and the listed tests verify.
Tests: `npm test` (tests/ai, tests/convex).

## Controls

| Area | Implementation | Code |
| --- | --- | --- |
| Encryption | AES-256-GCM, random 96-bit IV per encryption, 128-bit tag (length enforced), AAD = `userId:provider` | `src/features/ai/server/key-crypto.ts` |
| Key management | Versioned keyring from env; each row records its `keyVersion` | `src/features/ai/server/secrets.ts` |
| Separate secrets | Encryption key and proxy signing key are independent; the signing key must differ from every encryption key | `secrets.ts` |
| Startup checks | Missing/malformed secrets, `AI_ALLOW_ENV_KEYS` in production, non-https `APP_URL`, missing Inngest keys, or the rotation key in the runtime → the server refuses to start in production | `secrets.ts` (`assertAiSecurityConfig`), `src/instrumentation.ts` |
| Browser exposure | No route or query returns key material; `aiKeys.list` returns provider, last 4, dates | `src/app/api/ai-keys/route.ts`, `convex/aiKeys.ts` |
| Convex least privilege | AI data needs `AI_CREDENTIALS_CONVEX_KEY` (not the general internal key). Writes (`saveKey`, `saveLocalModel`) also need the user's Clerk session — the owner is `ctx.auth`, never an argument. Listing across users needs `AI_KEY_ROTATION_CONVEX_KEY`, absent at runtime. Missing credential = reject. | `convex/aiCredentials.ts`, `convex/aiKeyRotation.ts`, `convex/serverCredentials.ts` |
| Agent capability | Signed token (`abpt1.` prefix, HMAC-SHA256, constant-time check) bound to user, provider, model, project, run (messageId) and a jti; 5-minute lifetime | `src/features/ai/server/proxy-token.ts` |
| Run binding + replay | Every proxy request calls `consumeProxyToken`: run exists, is in the token's project, is still `processing`, user is still a member, and the jti has < 4 uses | `convex/aiCredentials.ts` |
| Proxy limits | Endpoint allowlist, 4 MB body, model must equal the token's, 60 req/min per user+provider+model, output tokens capped at 16,000, 280 s upstream timeout, caller headers not forwarded | `src/app/api/ai-proxy/[provider]/[...path]/route.ts`, `ai-limits.ts`, `proxy-policy.ts` |
| Editor limits | Quick edit 30/min, 8,192 output tokens, 1 MB body; suggestions 120/min, 512 output tokens, 256 KB body | `ai-limits.ts`, `src/app/api/{quick-edit,suggestion}/route.ts` |
| Agent concurrency | 2 agent runs in flight per user (Inngest concurrency key) | `process-message.ts` |
| Keys in URLs | Provider keys only in headers (`x-api-key`, `Authorization`, `x-goog-api-key`); caller headers never forwarded | proxy route, `resolve-model.ts`, `verify-key.ts` |
| Logging | AI errors are logged only as metadata (`safe-log.ts`); provider error bodies are replaced before they reach agent-kit, Inngest or Sentry; Sentry collects no bodies, frame variables, AI prompts or auth headers, and `sentry-scrub.ts` removes keys, masked keys, proxy tokens, Bearer values and credential query params | `safe-log.ts`, `proxy-policy.ts`, `sentry.*.config.ts`, `src/lib/sentry-scrub.ts` |
| Caching | None: every request re-reads and decrypts; plaintext exists only in the request's memory | `credentials.ts` |
| Audit | `aiKeyAudit` rows for saved / replaced / deleted / rewrapped (who, provider, version, time — never key material) | `convex/schema.ts` |
| Dev fallback | `AI_ALLOW_ENV_KEYS` works only when `NODE_ENV === "development"`; production refuses to start with it set | `credentials.ts`, `secrets.ts` |

### Why the agent capability is not strictly single-use

agent-kit runs model calls through Inngest's `step.ai.infer`: Inngest's servers make the HTTP
call, so they must hold *some* credential for our proxy (running the call inside our own
`step.run` would require replacing agent-kit's model layer). A new capability is minted each
time the function body runs, and each is used by one model step — but Inngest retries a failed
step with the same stored request. The replay budget (4 = 1 attempt + 3 retries) keeps retries
working while bounding reuse, and the run binding makes the capability useless once the run
ends. The token (never the key) is therefore visible to Inngest and, for Gemini, in the proxy
URL (`?key=`), because agent-kit's Gemini adapter puts it there.

## Environment

| Variable | Where | Notes |
| --- | --- | --- |
| `AI_KEYS_ENCRYPTION_KEY` | Next.js | 32 bytes, base64. Current key |
| `AI_KEYS_ENCRYPTION_KEY_VERSION` | Next.js | Integer ≥ 1, default 1 |
| `AI_KEYS_ENCRYPTION_OLD_KEYS` | Next.js | `1:<b64>,2:<b64>` — only during/after a rotation, until migrated |
| `AI_PROXY_TOKEN_SIGNING_KEY` | Next.js | ≥ 32 bytes, base64, independent of encryption keys |
| `AI_CREDENTIALS_CONVEX_KEY` | Next.js **and** Convex | ≥ 32 characters |
| `AI_KEY_ROTATION_CONVEX_KEY` | Convex + rotation shell only | Never in the app runtime |
| `APP_URL` | Next.js | Public https URL (proxy base) |
| `INNGEST_SIGNING_KEY`, `INNGEST_EVENT_KEY` | Next.js | Required in production |

Generate secrets with `openssl rand -base64 32`. Use different values per environment.

## Runbook: rotating the master encryption key

Rotation never needs users to re-enter keys and never writes a row it could not verify.

1. **Generate** a new key: `openssl rand -base64 32`.
2. **Deploy the app with both keys**:
   `AI_KEYS_ENCRYPTION_KEY=<new>`, `AI_KEYS_ENCRYPTION_KEY_VERSION=<n+1>`,
   `AI_KEYS_ENCRYPTION_OLD_KEYS=<n>:<old>[,…]`. New and replaced keys now use version n+1;
   existing rows keep decrypting with their own version.
3. **Open the rotation window**: set `AI_KEY_ROTATION_CONVEX_KEY` (fresh random value) on the
   Convex deployment: `npx convex env set AI_KEY_ROTATION_CONVEX_KEY <value> --prod`.
4. **Dry run** from a trusted shell holding the same env as step 2 plus
   `NEXT_PUBLIC_CONVEX_URL` and `AI_KEY_ROTATION_CONVEX_KEY`:
   `npm run ai:rotate-keys`. It decrypts and re-encrypts in memory, writes nothing, and prints
   only counts.
5. **Apply**: `npm run ai:rotate-keys -- --apply`. Each row is verified before a
   compare-and-swap write; rows the user changed meanwhile are skipped (they already use the
   new version); failures are listed by row id and left untouched. Each rewrap is audited.
6. **Confirm** the final "Rows per key version" shows only the new version. Re-run step 5 if
   any rows were skipped or failed.
7. **Close the window**: `npx convex env remove AI_KEY_ROTATION_CONVEX_KEY --prod`, and clear
   it from the shell.
8. **Retire the old key**: remove it from `AI_KEYS_ENCRYPTION_OLD_KEYS` and redeploy. Only do
   this when step 6 shows zero rows on the old version — afterwards those rows could never be
   decrypted.

Rotate the proxy signing key by replacing `AI_PROXY_TOKEN_SIGNING_KEY` and redeploying; at
most one in-flight agent step fails and is retried with a fresh token.

## Threat model

**A. Database-only compromise (Convex data)**
- Obtains: ciphertext, IVs, tags, last 4, user ids, dates, audit rows.
- Can: see which users have keys for which providers.
- Cannot: decrypt keys (the key is only in the Next.js env); forge proxy tokens.
- Limits damage: AES-256-GCM with the key outside Convex.
- Residual: metadata exposure; Convex *write* access could delete keys (denial of service).

**B. Application server compromise (Next.js runtime and env)**
- Obtains: encryption keys, signing key, `AI_CREDENTIALS_CONVEX_KEY`.
- Can: read ciphertext for a known userId and decrypt it; forge proxy tokens; spend users' keys.
- Cannot: list all keys (needs the rotation key, absent at runtime); write users' keys without their sessions.
- Limits damage: limited mainly by detection and response. A server that legitimately decrypts keys can be made to decrypt them.
- Residual: **full exposure of any key whose owner's userId is known.** No design where the server calls providers can prevent this.

**C. Convex / internal-key compromise**
- General `ANUBITHIC_STUDIO_CONVEX_INTERNAL_KEY`: no access to any AI function.
- `AI_CREDENTIALS_CONVEX_KEY`:
  - Can: read ciphertext for known userIds (useless without the encryption key); read settings; create rate-limit rows.
  - Cannot: write keys or local-model URLs (needs the user's session); list keys; decrypt.
- Residual: combined with the encryption key (threat B) → decryption.

**D. Proxy-token theft (from Inngest data, access logs or the network)**
- Obtains: one capability.
- Can: call one model, with the victim's key, for the victim's current run only. Limited to ≤ 4 uses, ≤ 5 minutes, ≤ 16k output tokens per call, and 60/min.
- Cannot: read the key; change model, provider, project or run; use it after the run ends.
- Limits damage: signature, scope, run binding, replay budget, rate limit, token cap.
- Residual: a handful of billed calls during an active run.

**E. Inngest / dashboard compromise**
- Obtains: run history, including prompts, project content passed to tools, and proxy tokens.
- Can: see project content; replay tokens of runs that are still processing (see D).
- Cannot: obtain provider keys (never sent to Inngest).
- Residual: confidentiality of prompts and code in run history, a property of using Inngest for agent execution. Forged `message/sent` events would need the Inngest event key.

**F. Sentry / logging compromise**
- Obtains: error metadata, traces without bodies or auth headers.
- Cannot (per code): keys, tokens, request bodies or provider responses; the scrubber is a second net.
- Residual: logs outside this code (hosting access logs, which may include the Gemini proxy URL with a short-lived token); third-party SDK behaviour changes on upgrade.

**G. Malicious authenticated user (cross-user)**
- Cannot:
  - read another user's key (no endpoint accepts a target user);
  - write another user's key or local model (owner = session);
  - mint a token for another user (tokens are minted server-side from the authenticated sender);
  - alter a token (HMAC);
  - reuse another run's token (run binding).
- Verified by: `tests/convex/ai-credentials.test.ts`, `tests/ai/proxy-token.test.ts`, `tests/ai/proxy-route.test.ts`.
- Residual: can spend their own key within the rate limits.

**H. Malicious shared-project member**
- Can: run the agent in a shared project on **their own** key and model (the sender pays); see project files, as their role allows.
- Cannot: cause another member's key to be used (`userId` is the authenticated sender); use a token after being removed from the project (membership is re-checked on every proxy call).
- Residual: none specific to keys; normal project-permission model applies.

## Not fixed (deliberately)

- **Tokens pass through Inngest.** Removing them means replacing agent-kit's model layer with our own step-wrapped calls — an architecture change. Mitigated by scope, run binding, replay budget and limits.
- **Gemini token in a query string.** agent-kit's Gemini adapter puts the credential in `?key=`. It is our short-lived token, never the provider key; Sentry filters it; hosting access-log retention must be checked (see production checklist).
- **Application-server compromise.** A server that decrypts keys to use them can be made to decrypt them (threat B).
