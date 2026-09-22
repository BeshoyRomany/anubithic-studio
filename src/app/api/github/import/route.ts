import { z } from "zod";
import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";

import { convex } from "@/lib/convex-client";
import { inngest } from "@/inngest/client";

import { api } from "../../../../../convex/_generated/api";

const requestSchema = z.object({
  url: z.url(),
});

/**
 * Parses and validates a GitHub repository URL, extracting its owner and repo name.
 *
 * Example for "https://github.com/BeshoyRomany/anubithic-studio":
 * [
 *   "github.com/BeshoyRomany/anubithic-studio", // [0] Full match
 *   "BeshoyRomany",                           // [1] Owner
 *   "anubithic-studio"                        // [2] Repo
 * ]
 */
function parseGitHubUrl(url: string) {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) {
    throw new Error("Invalid GitHub URL");
  }

  return { owner: match[1], repo: match[2].replace(/\.git$/, "") };
}

export async function POST(request: Request) {
  const { userId, has } = await auth();

  //Check the user logged in
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hasPro = has({ plan: "pro" });

  if (!hasPro) {
    return NextResponse.json(
      { error: "Pro plan required", code: "PRO_PLAN_REQUIRED" },
      { status: 403 },
    );
  }

  const body = await request.json();
  const { url } = requestSchema.parse(body);

  //parse and extract {owner, repo} from the github url
  const { owner, repo } = parseGitHubUrl(url);

  const client = await clerkClient();
  const tokens = await client.users.getUserOauthAccessToken(userId, "github");
  const githubToken = tokens.data[0]?.token;

  if (!githubToken) {
    return NextResponse.json(
      {
        error: "GitHub not connected. Please reconnect your GitHub account.",
        code: "GITHUB_MISSING",
      },
      { status: 400 },
    );
  }

  const internalKey = process.env.ANUBITHIC_STUDIO_CONVEX_INTERNAL_KEY!;

  if (!internalKey) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  //create a project
  const projectId = await convex.mutation(api.system.createImportProject, {
    internalKey,
    name: repo,
    ownerId: userId,
  });

  //start a background job for importing
  const event = await inngest.send({
    name: "github/import.repo",
    data: {
      owner,
      repo,
      projectId,
      githubToken,
    },
  });

  //response
  return NextResponse.json({
    success: true,
    projectId,
    eventId: event.ids[0],
  });
}
