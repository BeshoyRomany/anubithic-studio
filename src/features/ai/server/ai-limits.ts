// Every AI cost/abuse limit in one place. Values are set from what the app actually sends:
// the agent asks for up to 16,000 output tokens per turn and runs at most 20 turns, quick
// edit rewrites a selection, and suggestions complete a line or two.

export const AI_LIMITS = {
  proxy: {
    // Per user + provider + model. An agent run is ≤ 20 turns + 1 title call, so 60/min
    // leaves room for two runs at once while capping what a stolen token can do.
    requestsPerWindow: 60,
    windowMs: 60_000,
    maxOutputTokens: 16_000,
    maxBodyBytes: 4 * 1024 * 1024, // agent context: system prompt + history + file contents
    upstreamTimeoutMs: 280_000, // under the route's maxDuration of 300s
  },
  quickEdit: {
    requestsPerWindow: 30,
    windowMs: 60_000,
    maxOutputTokens: 8_192,
    maxBodyBytes: 1024 * 1024,
  },
  suggestion: {
    // Fired on typing pauses; 2 per second sustained is far above normal typing
    requestsPerWindow: 120,
    windowMs: 60_000,
    maxOutputTokens: 512,
    maxBodyBytes: 256 * 1024,
  },
  // Agent runs one user can have in flight at once (Inngest concurrency key)
  agentConcurrencyPerUser: 2,
} as const;
