import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import type { AiProvider } from "../models";
import { getProxySigningKey } from "./secrets";

//#region Agent proxy capability
// Inngest runs agent-kit's model calls on its own servers, so it needs *something* to
// authenticate to our /api/ai-proxy. It gets this signed capability instead of the user's
// key. The capability is scoped to one user, provider, model, project and agent run
// (messageId), carries a unique id (jti), and lives 5 minutes.
//
// Why not strictly single-use: a new token is minted every time the Inngest function body
// runs, and each one is used by exactly one model step — but Inngest retries a failed
// step with the SAME stored request, so it can arrive up to PROXY_TOKEN_MAX_USES times.
// The proxy enforces that budget per jti (replay protection) and also rejects the token as
// soon as the run is no longer "processing" (Convex `aiCredentials.consumeProxyToken`).
//#endregion

export const PROXY_TOKEN_PREFIX = "abpt1";
export const PROXY_TOKEN_TTL_MS = 5 * 60 * 1000;
// 1 attempt + Inngest's default 3 step retries
export const PROXY_TOKEN_MAX_USES = 4;
const MAX_TOKEN_LENGTH = 2048;

const payloadSchema = z
  .object({
    v: z.literal(2),
    jti: z.string().uuid(),
    sub: z.string().min(1).max(200), // userId
    prv: z.string().min(1).max(50), // provider
    mdl: z.string().min(1).max(200), // model
    prj: z.string().min(1).max(100), // projectId
    run: z.string().min(1).max(100), // messageId (the agent run)
    iat: z.number().int(),
    exp: z.number().int(),
  })
  .strict();

export type ProxyTokenPayload = z.infer<typeof payloadSchema>;

export interface ProxyTokenScope {
  userId: string;
  provider: AiProvider;
  model: string;
  projectId: string;
  runId: string;
}

const sign = (data: string, key: Buffer) =>
  createHmac("sha256", key).update(data).digest("base64url");

export const createProxyToken = (
  scope: ProxyTokenScope,
  { now = Date.now(), key = getProxySigningKey() } = {},
) => {
  const payload: ProxyTokenPayload = {
    v: 2,
    jti: randomUUID(),
    sub: scope.userId,
    prv: scope.provider,
    mdl: scope.model,
    prj: scope.projectId,
    run: scope.runId,
    iat: now,
    exp: now + PROXY_TOKEN_TTL_MS,
  };
  const body = `${PROXY_TOKEN_PREFIX}.${Buffer.from(JSON.stringify(payload)).toString("base64url")}`;
  return `${body}.${sign(body, key)}`;
};

export type ProxyTokenCheck =
  | { ok: true; payload: ProxyTokenPayload }
  | {
      ok: false;
      reason:
        | "malformed"
        | "bad_signature"
        | "expired"
        | "wrong_provider"
        | "wrong_model";
    };

// Signature (constant time), shape, expiry, provider and — when known — model.
// Project/run/replay checks need Convex and happen in consumeProxyToken.
export const verifyProxyToken = (
  token: string,
  expected: { provider: string; model?: string },
  { now = Date.now(), key = getProxySigningKey() } = {},
): ProxyTokenCheck => {
  if (token.length > MAX_TOKEN_LENGTH)
    return { ok: false, reason: "malformed" };

  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== PROXY_TOKEN_PREFIX) {
    return { ok: false, reason: "malformed" };
  }

  const body = `${parts[0]}.${parts[1]}`;
  const expectedSignature = Buffer.from(sign(body, key));
  const received = Buffer.from(parts[2]);
  if (
    expectedSignature.length !== received.length ||
    !timingSafeEqual(expectedSignature, received)
  ) {
    return { ok: false, reason: "bad_signature" };
  }

  let payload: ProxyTokenPayload;
  try {
    payload = payloadSchema.parse(
      JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")),
    );
  } catch {
    return { ok: false, reason: "malformed" };
  }

  // A token dated in the future (clock skew beyond 1 minute) is treated as malformed
  if (
    payload.iat > now + 60_000 ||
    payload.exp - payload.iat > PROXY_TOKEN_TTL_MS
  ) {
    return { ok: false, reason: "malformed" };
  }
  if (payload.exp <= now) return { ok: false, reason: "expired" };
  if (payload.prv !== expected.provider)
    return { ok: false, reason: "wrong_provider" };
  if (expected.model !== undefined && payload.mdl !== expected.model) {
    return { ok: false, reason: "wrong_model" };
  }

  return { ok: true, payload };
};
