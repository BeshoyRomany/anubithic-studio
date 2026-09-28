// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import { sentryScrubHooks } from "@/lib/sentry-scrub";

Sentry.init({
  dsn: "https://27c0eb69dcce400d06fcb90b158dd1f8@o4511886204338176.ingest.de.sentry.io/4511886265155664",

  // Add optional integrations for additional features
  integrations: [
    // Masking made explicit: the API key field must never appear in a replay
    Sentry.replayIntegration({ maskAllText: true, maskAllInputs: true, blockAllMedia: true }),
  ],

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 1,
  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Define how likely Replay events are sampled.
  // This sets the sample rate to be 10%. You may want this to be 100% while
  // in development and sample at a lower rate in production
  replaysSessionSampleRate: 0.1,

  // Define how likely Replay events are sampled when an error occurs.
  replaysOnErrorSampleRate: 1.0,

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
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
