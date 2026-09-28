// The ONLY way AI code paths log errors. AI SDK / provider errors carry request bodies
// (user code, prompts), provider responses and URLs, and console output is forwarded to
// Sentry Logs — so errors are reduced to fixed metadata here and nothing else is logged.

export interface SafeAiError {
  code: string; // internal error code
  route: string;
  provider?: string;
  model?: string;
  errorType: string;
  status?: number;
  requestId?: string;
}

interface ErrorLike {
  name?: unknown;
  statusCode?: unknown;
  status?: unknown;
  responseHeaders?: unknown;
}

const SAFE_NAME = /^[A-Za-z][A-Za-z0-9_]{0,59}$/;
// Provider request ids are short opaque tokens (e.g. "req_011C…")
const SAFE_REQUEST_ID = /^[A-Za-z0-9_\-:.]{1,100}$/;

const codeFor = (errorType: string, status?: number) => {
  if (errorType === "NoKeyError") return "no_key";
  if (errorType === "KeyVersionUnavailableError")
    return "key_version_unavailable";
  if (errorType === "AiSecretConfigError") return "config";
  if (errorType === "TimeoutError" || errorType === "AbortError")
    return "timeout";
  if (status === 401 || status === 403) return "provider_auth";
  if (status === 429) return "provider_rate_limit";
  if (status && status >= 500) return "provider_unavailable";
  if (status) return "provider_rejected";
  return "internal";
};

export const toSafeAiError = (
  error: unknown,
  context: { route: string; provider?: string; model?: string },
): SafeAiError => {
  const candidate = (error ?? {}) as ErrorLike;
  const rawName =
    typeof candidate.name === "string" ? candidate.name : "UnknownError";
  const errorType = SAFE_NAME.test(rawName) ? rawName : "UnknownError";

  const rawStatus = candidate.statusCode ?? candidate.status;
  const status =
    typeof rawStatus === "number" && rawStatus >= 100 && rawStatus < 600
      ? rawStatus
      : undefined;

  const headers =
    candidate.responseHeaders && typeof candidate.responseHeaders === "object"
      ? (candidate.responseHeaders as Record<string, unknown>)
      : {};
  const rawRequestId = headers["request-id"] ?? headers["x-request-id"];
  const requestId =
    typeof rawRequestId === "string" && SAFE_REQUEST_ID.test(rawRequestId)
      ? rawRequestId
      : undefined;

  return {
    code: codeFor(errorType, status),
    route: context.route,
    provider: context.provider,
    model: context.model,
    errorType,
    status,
    requestId,
  };
};

export const logAiError = (
  error: unknown,
  context: { route: string; provider?: string; model?: string },
) => {
  console.error("[ai]", JSON.stringify(toSafeAiError(error, context)));
};
