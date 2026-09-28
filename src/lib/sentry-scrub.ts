// Removes secrets from everything sent to Sentry (errors, traces, logs, breadcrumbs).
// A second safety net: the code never logs keys on purpose, and request bodies are
// not captured at all (see sentry.server.config.ts).

const FILTERED = "[Filtered]";

// Secret shapes, each starting at a word boundary so "desk-reservation-..." isn't hit.
const SECRET_PATTERNS: [RegExp, string][] = [
  [/(?<![\w-])abpt1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, FILTERED], // our agent proxy tokens
  [/(?<![\w-])sk-ant-[\w-]{10,}/g, FILTERED], // Anthropic
  [/(?<![\w-])sk-(?:proj-|svcacct-|admin-)?[\w-]{20,}/g, FILTERED], // OpenAI, DeepSeek, DashScope
  [/(?<![\w-])AIza[\w-]{30,}/g, FILTERED], // Google
  // Keys providers echo back masked, e.g. OpenAI's "sk-proj-abc****wxyz"
  [/(?<![\w-])(?:sk-|AIza)[\w.-]*\*{2,}[\w*.-]*/g, FILTERED],
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, `$1 ${FILTERED}`],
  // Credentials in query strings (e.g. ?key=…, &api_key=…, &token=…)
  [
    /([?&](?:key|api[-_]?key|access[-_]?token|token|auth)=)[^&\s"'#]+/gi,
    `$1${FILTERED}`,
  ],
];

// Field names whose values are always secret, wherever they appear.
const SECRET_FIELDS =
  /^(api[-_]?key|apikey|authorization|x-api-key|x-goog-api-key|cookie|set-cookie|ciphertext|authtag|auth_tag|auth_key|token|proxy[-_]?token|internal[-_]?key|credentials[-_]?key|password|secret)$/i;

const scrubString = (value: string) =>
  SECRET_PATTERNS.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    value,
  );

// Deep copy with secrets replaced. Depth-limited so a cyclic or huge object can't hang it.
export const scrubSecrets = <T>(value: T, depth = 0): T => {
  if (typeof value === "string") return scrubString(value) as T;
  if (!value || typeof value !== "object" || depth > 12) return value;

  if (Array.isArray(value)) {
    return value.map((item) => scrubSecrets(item, depth + 1)) as T;
  }

  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = SECRET_FIELDS.test(key)
      ? FILTERED
      : scrubSecrets(item, depth + 1);
  }
  return result as T;
};

// Plug into Sentry.init({ ...sentryScrubHooks }).
export const sentryScrubHooks = {
  beforeSend: <T>(event: T) => scrubSecrets(event),
  beforeSendTransaction: <T>(event: T) => scrubSecrets(event),
  beforeSendLog: <T>(log: T) => scrubSecrets(log),
  beforeBreadcrumb: <T>(breadcrumb: T) => scrubSecrets(breadcrumb),
};
