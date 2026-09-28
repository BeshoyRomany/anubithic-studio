import { z } from "zod";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { api } from "../../../../convex/_generated/api";
import { CLOUD_PROVIDERS } from "@/features/ai/models";
import { encryptKey } from "@/features/ai/server/key-crypto";
import {
  requireAiCredentialsKey,
  userConvexClient,
} from "@/features/ai/server/convex-ai";
import { verifyKey } from "@/features/ai/server/verify-key";
import { rateLimit } from "@/lib/rate-limit";

const requestSchema = z.object({
  provider: z.enum(CLOUD_PROVIDERS),
  apiKey: z.string().trim().min(8).max(512),
});

// Saves a user's provider key: test it, encrypt it, store only ciphertext + last 4.
// The key is never logged and never sent back.
export async function POST(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = requestSchema.safeParse(
    await request.json().catch(() => null),
  );

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Choose a provider and paste a valid key" },
      { status: 400 },
    );
  }

  // Without a limit this route is a free "is this stolen key valid?" checker
  const limited = await rateLimit(`ai-keys:${userId}`, {
    limit: 10,
    windowMs: 10 * 60_000,
  });
  if (limited) return limited;

  const { provider, apiKey } = parsed.data;
  const check = await verifyKey(provider, apiKey);

  if (!check.ok) {
    return NextResponse.json(
      {
        error:
          check.reason === "invalid"
            ? "The provider rejected this key. Check it and try again."
            : "Couldn't reach the provider to check this key. Try again in a moment.",
      },
      { status: check.reason === "invalid" ? 400 : 502 },
    );
  }

  const last4 = apiKey.slice(-4);

  try {
    // Written AS the user (their Clerk session): Convex takes the owner from the session,
    // so this server credential can't write a key onto another account
    const client = await userConvexClient();
    await client.mutation(api.aiCredentials.saveKey, {
      credentialsKey: requireAiCredentialsKey(),
      provider,
      last4,
      ...encryptKey(apiKey, userId, provider),
    });
  } catch {
    // Deliberately not logging the error: it's raised in a scope that holds the key
    return NextResponse.json(
      { error: "Couldn't save the key. Try again in a moment." },
      { status: 500 },
    );
  }

  return NextResponse.json({ provider, last4 });
}
