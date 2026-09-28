import { NextResponse } from "next/server";

import { AiProvider, CLOUD_PROVIDERS } from "@/features/ai/models";
import { AI_LIMITS } from "@/features/ai/server/ai-limits";
import { stripUnsupportedAnthropicBlocks } from "@/features/ai/server/anthropic-compat";
import { requireAiCredentialsKey } from "@/features/ai/server/convex-ai";
import {
  getProviderCredentials,
  NoKeyError,
} from "@/features/ai/server/credentials";
import {
  attachSignatures,
  rememberSignatures,
  type SignatureStore,
} from "@/features/ai/server/gemini-signatures";
import {
  clampOutputTokens,
  extractRequestId,
  providerShapedError,
  sanitizeUpstreamError,
} from "@/features/ai/server/proxy-policy";
import {
  PROXY_TOKEN_MAX_USES,
  verifyProxyToken,
} from "@/features/ai/server/proxy-token";
import { logAiError } from "@/features/ai/server/safe-log";
import { safeFetch } from "@/features/ai/server/url-safety";
import { convex } from "@/lib/convex-client";
import { rateLimit } from "@/lib/rate-limit";
import { api } from "../../../../../../convex/_generated/api";

//#region Agent proxy
// Inngest runs agent-kit's model calls, so it holds a scoped capability (proxy-token.ts),
// never the user's key. For every request this route checks, in order:
//   provider + endpoint allowlist → token signature/expiry/provider → body size → model
//   → per-user rate limit → run binding + replay budget (Convex) → output-token cap
// and only then decrypts the user's key and calls the provider with it in a header.
// Provider error bodies are never passed back (they reach Inngest and Sentry).
//#endregion

// Agent turns can take minutes on large models.
export const maxDuration = 300;

// Enabled cloud providers plus the user's local Ollama
const PROVIDERS = new Set<AiProvider>([...CLOUD_PROVIDERS, "ollama"]);

// Only the endpoints agent-kit calls: this must never become an open relay.
const ALLOWED_PATHS: Record<AiProvider, RegExp> = {
  anthropic: /^messages$/,
  google: /^models\/[\w.-]+:generateContent$/,
  openai: /^chat\/completions$/,
  deepseek: /^chat\/completions$/,
  qwen: /^chat\/completions$/,
  ollama: /^chat\/completions$/,
};

// Messages for rejected tokens are deliberately generic
const TOKEN_REJECTIONS: Record<string, [number, string]> = {
  expired: [401, "Agent credential expired"],
  replayed: [401, "Agent credential already used"],
  run_finished: [401, "Agent run is no longer active"],
  wrong_run: [403, "Agent credential not valid for this run"],
  wrong_project: [403, "Agent credential not valid for this project"],
  not_member: [403, "Not a member of this project"],
};

// Gemini thought signatures live in Convex between agent turns (see gemini-signatures.ts)
const convexSignatureStore = (userId: string): SignatureStore => {
  const credentialsKey = requireAiCredentialsKey();
  return {
    get: (keys) =>
      convex.query(api.aiCredentials.getGeminiSignatures, {
        credentialsKey,
        keys,
      }),
    save: async (entries) => {
      await convex.mutation(api.aiCredentials.saveGeminiSignatures, {
        credentialsKey,
        userId,
        entries,
      });
    },
  };
};

// Each agent-kit format carries the token where it would carry a real key. (agent-kit's
// Gemini adapter puts it in `?key=`; this only ever holds our scoped token, and the
// provider key itself is always sent upstream in a header.)
const readToken = (request: Request) => {
  const bearer = request.headers.get("authorization")?.match(/^Bearer (.+)$/);
  return (
    bearer?.[1] ??
    request.headers.get("x-api-key") ??
    new URL(request.url).searchParams.get("key")
  );
};

// Fixed headers only: caller-supplied headers (e.g. anthropic-beta) are not forwarded.
const upstreamAuthHeaders = (
  provider: AiProvider,
  apiKey: string,
): Record<string, string> => {
  switch (provider) {
    case "anthropic":
      return { "x-api-key": apiKey, "anthropic-version": "2023-06-01" };
    case "google":
      return { "x-goog-api-key": apiKey };
    default:
      return { Authorization: `Bearer ${apiKey}` };
  }
};

const reject = (provider: AiProvider, status: number, message: string) =>
  new NextResponse(providerShapedError(provider, status, message), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string; path: string[] }> },
) {
  const { provider: rawProvider, path } = await params;
  const provider = rawProvider as AiProvider;
  const upstreamPath = path.join("/");

  if (!PROVIDERS.has(provider) || !ALLOWED_PATHS[provider].test(upstreamPath)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const token = readToken(request);
  const check = token
    ? verifyProxyToken(token, { provider })
    : ({ ok: false, reason: "malformed" } as const);
  if (!check.ok) {
    return reject(provider, 401, "Invalid or expired agent credential");
  }
  const { payload } = check;

  // Body size, before reading more than the limit
  const limits = AI_LIMITS.proxy;
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > limits.maxBodyBytes) {
    return reject(provider, 413, "Request too large");
  }
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody) > limits.maxBodyBytes) {
    return reject(provider, 413, "Request too large");
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("not an object");
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return reject(provider, 400, "Invalid request body");
  }

  // The request must ask for the exact model the token was issued for.
  // Gemini names it in the path (models/<id>:generateContent), the others in the body.
  const requestedModel =
    provider === "google"
      ? upstreamPath.slice("models/".length).split(":")[0]
      : body.model;
  if (requestedModel !== payload.mdl) {
    return reject(provider, 403, "Model not allowed for this credential");
  }

  const limited = await rateLimit(
    `ai-proxy:${payload.sub}:${provider}:${payload.mdl}`,
    { limit: limits.requestsPerWindow, windowMs: limits.windowMs },
  );
  if (limited) {
    return reject(provider, 429, "Too many agent requests, slow down");
  }

  // Run binding + replay budget: the run must still be processing, in this project,
  // for a member, and this token must not have exceeded its uses
  const consumed = await convex.mutation(api.aiCredentials.consumeProxyToken, {
    credentialsKey: requireAiCredentialsKey(),
    jti: payload.jti,
    userId: payload.sub,
    projectId: payload.prj,
    runId: payload.run,
    expiresAt: payload.exp,
    maxUses: PROXY_TOKEN_MAX_USES,
  });
  if (!consumed.ok) {
    const [status, message] = TOKEN_REJECTIONS[consumed.reason] ?? [
      403,
      "Agent credential rejected",
    ];
    return reject(provider, status, message);
  }

  const context = { route: "ai-proxy", provider, model: payload.mdl };
  const signatures = convexSignatureStore(payload.sub);
  let upstreamBody = JSON.stringify(
    clampOutputTokens(provider, body, limits.maxOutputTokens),
  );
  if (provider === "google") {
    upstreamBody = await attachSignatures(
      upstreamBody,
      payload.sub,
      signatures,
    );
  }

  try {
    const { apiKey, baseUrl } = await getProviderCredentials(
      payload.sub,
      provider,
    );

    const upstream = await safeFetch(`${baseUrl}/${upstreamPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...upstreamAuthHeaders(provider, apiKey),
      },
      body: upstreamBody,
      signal: AbortSignal.timeout(limits.upstreamTimeoutMs),
    });

    if (!upstream.ok) {
      const requestId = extractRequestId(upstream.headers);
      await upstream.body?.cancel();
      logAiError(
        {
          name: "ProviderError",
          statusCode: upstream.status,
          responseHeaders: { "request-id": requestId },
        },
        context,
      );
      return new NextResponse(
        sanitizeUpstreamError(provider, upstream.status, requestId),
        {
          status: upstream.status,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    let responseText = await upstream.text();
    if (provider === "anthropic") {
      responseText = stripUnsupportedAnthropicBlocks(responseText);
    }
    if (provider === "google") {
      await rememberSignatures(responseText, payload.sub, signatures);
    }

    return new NextResponse(responseText, {
      status: upstream.status,
      headers: {
        "Content-Type":
          upstream.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (error) {
    logAiError(error, context);
    if (error instanceof NoKeyError) {
      return reject(provider, 402, error.message);
    }
    if (error instanceof Error && error.name === "TimeoutError") {
      return reject(provider, 504, "Model provider timed out");
    }
    return reject(provider, 502, "Couldn't reach the model provider");
  }
}
