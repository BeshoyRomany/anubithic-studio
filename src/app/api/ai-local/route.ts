import { z } from "zod";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { api } from "../../../../convex/_generated/api";
import { rateLimit } from "@/lib/rate-limit";
import { DEFAULT_OLLAMA_URL } from "@/features/ai/models";
import { getSettings } from "@/features/ai/server/credentials";
import {
  requireAiCredentialsKey,
  userConvexClient,
} from "@/features/ai/server/convex-ai";
import {
  assertSafeOllamaUrl,
  safeFetch,
} from "@/features/ai/server/url-safety";

const requestSchema = z.object({
  baseUrl: z.string().trim().optional(),
  // Ollama tags look like "qwen2.5:14b" or "user/model:tag"
  model: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .regex(/^[\w.\-/:]+$/, "That doesn't look like an Ollama model name"),
});

export interface LocalModelCheck {
  model: string;
  supportsTools: boolean;
  parameterSize: string | null; // e.g. "7.6B", from Ollama
}

// Connects the user's local model: reach their Ollama, confirm the model is installed,
// read whether it can call tools, then save it (and select it) in their settings.
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
      { error: parsed.error.issues[0]?.message ?? "Enter a model name" },
      { status: 400 },
    );
  }

  // Each attempt makes our server call a URL the user chose
  const limited = await rateLimit(`ai-local:${userId}`, {
    limit: 20,
    windowMs: 10 * 60_000,
  });
  if (limited) return limited;

  const { model } = parsed.data;
  const savedUrl = parsed.data.baseUrl?.replace(/\/$/, "") || undefined;
  const baseUrl = savedUrl ?? DEFAULT_OLLAMA_URL;

  try {
    await assertSafeOllamaUrl(baseUrl);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid URL" },
      { status: 400 },
    );
  }

  let show: Response;
  try {
    show = await safeFetch(`${baseUrl}/api/show`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model }),
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    return NextResponse.json(
      {
        error: `Couldn't reach Ollama at ${baseUrl}. Is "ollama serve" running?`,
      },
      { status: 502 },
    );
  }

  if (show.status === 404) {
    return NextResponse.json(
      { error: `"${model}" isn't installed. Run: ollama pull ${model}` },
      { status: 404 },
    );
  }

  if (!show.ok) {
    return NextResponse.json(
      { error: `Ollama answered ${show.status}` },
      { status: 502 },
    );
  }

  const info = (await show.json().catch(() => ({}))) as {
    capabilities?: string[];
    details?: { parameter_size?: string };
  };

  const check: LocalModelCheck = {
    model,
    supportsTools: info.capabilities?.includes("tools") ?? false,
    parameterSize: info.details?.parameter_size ?? null,
  };

  // Written AS the user: Convex takes the owner from the Clerk session, so this server
  // credential can't point another user's local model at a different server
  const client = await userConvexClient();
  await client.mutation(api.aiCredentials.saveLocalModel, {
    credentialsKey: requireAiCredentialsKey(),
    ollamaBaseUrl: savedUrl,
    localModel: check.model,
    localModelSupportsTools: check.supportsTools,
    localModelParameterSize: check.parameterSize ?? undefined,
  });

  return NextResponse.json(check);
}

export type LocalModelStatus =
  | { status: "online" }
  | { status: "offline" | "missing" | "none"; message?: string };

// Live check of the saved local model: is Ollama running, and is the model still there?
// Saved settings alone can't tell: the server may have been closed since.
export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await getSettings(userId);

  if (!settings?.localModel) {
    return NextResponse.json({ status: "none" } satisfies LocalModelStatus);
  }

  const baseUrl = settings.ollamaBaseUrl ?? DEFAULT_OLLAMA_URL;

  try {
    await assertSafeOllamaUrl(baseUrl);
    const show = await safeFetch(`${baseUrl}/api/show`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: settings.localModel }),
      signal: AbortSignal.timeout(4_000),
    });

    if (show.status === 404) {
      return NextResponse.json({
        status: "missing",
        message: `"${settings.localModel}" isn't installed anymore. Run: ollama pull ${settings.localModel}`,
      } satisfies LocalModelStatus);
    }

    return NextResponse.json({ status: "online" } satisfies LocalModelStatus);
  } catch {
    return NextResponse.json({
      status: "offline",
      message: `Ollama isn't running at ${baseUrl}. Start it with: ollama serve`,
    } satisfies LocalModelStatus);
  }
}
