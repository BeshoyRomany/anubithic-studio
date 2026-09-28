import { createHash } from "node:crypto";

//#region Gemini thought signatures
// Gemini 3 attaches a `thoughtSignature` to each tool call and requires it back, unchanged,
// in later requests. agent-kit drops it, so without this every second agent turn fails with
// "Function call is missing a thought_signature". The proxy remembers each signature
// (keyed by user + call name + args) and re-attaches it on the way back to Gemini.
//#endregion

interface GeminiPart {
  functionCall?: { name: string; args?: unknown };
  thoughtSignature?: string;
}

interface GeminiContent {
  parts?: GeminiPart[];
}

// Same call → same key, whatever order agent-kit serialises the args in.
const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [
          key,
          canonical((value as Record<string, unknown>)[key]),
        ]),
    );
  }
  return value;
};

// Hashed: args can hold the user's code, which must not be stored in plain form.
const callKey = (
  userId: string,
  call: NonNullable<GeminiPart["functionCall"]>,
) =>
  createHash("sha256")
    .update(
      `${userId}\n${call.name}\n${JSON.stringify(canonical(call.args ?? {}))}`,
    )
    .digest("base64url");

export interface SignatureStore {
  get: (keys: string[]) => Promise<Record<string, string>>;
  save: (entries: { key: string; signature: string }[]) => Promise<void>;
}

// Request going to Gemini: put back the signatures agent-kit dropped. Returns the new body.
export const attachSignatures = async (
  body: string,
  userId: string,
  store: SignatureStore,
) => {
  let request: { contents?: GeminiContent[] };
  try {
    request = JSON.parse(body);
  } catch {
    return body;
  }

  const missing = (request.contents ?? [])
    .flatMap((content) => content.parts ?? [])
    .filter((part) => part.functionCall && !part.thoughtSignature);

  if (missing.length === 0) return body;

  const keys = missing.map((part) => callKey(userId, part.functionCall!));
  const found = await store.get([...new Set(keys)]);

  // Only the first call of a parallel batch carries a signature; the rest stay without
  missing.forEach((part, index) => {
    const signature = found[keys[index]];
    if (signature) part.thoughtSignature = signature;
  });

  return JSON.stringify(request);
};

// Response coming from Gemini: remember any signatures it attached to tool calls.
export const rememberSignatures = async (
  responseText: string,
  userId: string,
  store: SignatureStore,
) => {
  let response: { candidates?: { content?: GeminiContent }[] };
  try {
    response = JSON.parse(responseText);
  } catch {
    return;
  }

  const entries = (response.candidates ?? [])
    .flatMap((candidate) => candidate.content?.parts ?? [])
    .filter((part) => part.functionCall && part.thoughtSignature)
    .map((part) => ({
      key: callKey(userId, part.functionCall!),
      signature: part.thoughtSignature!,
    }));

  if (entries.length > 0) await store.save(entries);
};

// In-memory store for scripts (ai:check); the app uses Convex (see ai-proxy route).
export const createMemorySignatureStore = (): SignatureStore => {
  const map = new Map<string, string>();
  return {
    get: async (keys) =>
      Object.fromEntries(
        keys.filter((key) => map.has(key)).map((key) => [key, map.get(key)!]),
      ),
    save: async (entries) => {
      for (const { key, signature } of entries) map.set(key, signature);
    },
  };
};
