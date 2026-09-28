import { NextResponse } from "next/server";

import { api } from "../../convex/_generated/api";
import { convex } from "./convex-client";
import { requireAiCredentialsKey } from "@/features/ai/server/convex-ai";

// Server-side fixed-window limit. `key` identifies who and what is limited, e.g.
// "ai-proxy:<userId>:<provider>:<model>". Returns a 429 response when over the limit.
export const rateLimit = async (
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number },
) => {
  const { ok, retryAfterMs } = await convex.mutation(
    api.aiCredentials.consumeRateLimit,
    { credentialsKey: requireAiCredentialsKey(), key, limit, windowMs },
  );

  if (ok) return null;

  const minutes = Math.max(1, Math.ceil(retryAfterMs / 60_000));
  return NextResponse.json(
    {
      error: `Too many requests. Try again in ${minutes} minute${minutes > 1 ? "s" : ""}.`,
    },
    {
      status: 429,
      headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) },
    },
  );
};
