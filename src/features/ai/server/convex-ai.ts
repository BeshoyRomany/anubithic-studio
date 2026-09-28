import "server-only";

import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";

// Server credential for convex/aiCredentials.ts (separate from the general internal key).
export const requireAiCredentialsKey = () => {
  const key = process.env.AI_CREDENTIALS_CONVEX_KEY;
  if (!key) {
    throw new Error("AI_CREDENTIALS_CONVEX_KEY is not configured");
  }
  return key;
};

// A Convex client acting AS the signed-in user, for writes that must derive the owner
// from the user's own Clerk session (saveKey, saveLocalModel) rather than an argument.
export const userConvexClient = async () => {
  const { sessionClaims, getToken } = await auth();
  // The native Clerk↔Convex integration uses the session token; older setups a template
  const token =
    sessionClaims?.aud === "convex"
      ? await getToken()
      : await getToken({ template: "convex" });

  if (!token) {
    throw new Error("No Convex token for the current session");
  }

  const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  client.setAuth(token);
  return client;
};
