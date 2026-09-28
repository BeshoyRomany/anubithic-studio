// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import { sentryScrubHooks } from "./src/lib/sentry-scrub";

Sentry.init({
  dsn: "https://27c0eb69dcce400d06fcb90b158dd1f8@o4511886204338176.ingest.de.sentry.io/4511886265155664",

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 1,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Privacy: users' API keys and code pass through this server (Bring Your Own Key).
  // Nothing that could hold them is collected; sentryScrubHooks is the second net.
  dataCollection: {
    httpBodies: [], // request/response bodies (e.g. POST /api/ai-keys carries the key)
    stackFrameVariables: false, // local variables of a crashing frame (e.g. a decrypted key)
    genAI: { inputs: false, outputs: false }, // prompts and answers are the user's code
    cookies: false,
    httpHeaders: {
      request: { deny: ["authorization", "x-api-key", "x-goog-api-key", "cookie"] },
      response: { deny: ["set-cookie"] },
    },
  },
  ...sentryScrubHooks,
  integrations: [
    Sentry.vercelAIIntegration(),
    Sentry.consoleLoggingIntegration({ levels: ["log", "warn", "error"] }),
  ],
});
