import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");

    // AI key security config (secrets present, valid, independent; no dev fallbacks).
    // Production fails closed; messages name settings, never their values.
    const { assertAiSecurityConfig } = await import(
      "./features/ai/server/secrets"
    );
    const problems = assertAiSecurityConfig();
    if (problems.length > 0) {
      const summary = `AI security configuration invalid:\n- ${problems.join("\n- ")}`;
      if (process.env.NODE_ENV === "production") throw new Error(summary);
      console.warn(summary);
    }
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
