# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Anubithic Studio is a browser-based AI IDE (Replit/Lovable-style): file explorer, CodeMirror editor, an agentic chat that edits project files, a WebContainer live preview, and GitHub import/export. It is built chapter-by-chapter as a learning project — the numbered excalidraw files in `Anubithic Studio - docs/` (01-authentication … 15-gitHub-Import-and-export) map to the git history. Consult the doc for a feature area before working on it.

## Commands

- `npm run dev` — Next.js dev server on **HTTPS port 3001** (`--experimental-https`, self-signed certs `localhost+1*.pem` in repo root). Not HTTP 3000.
- `npm run build` / `npm run start` — production build / serve
- `npm run lint` — ESLint (`eslint-config-next`, no custom rules)
- `npx convex dev` — run/sync the Convex backend (no package.json script)
- `npx inngest-cli@latest dev` — local Inngest dev server if you need to exercise background jobs
- `npm test` — Vitest + convex-test security tests (`tests/`). `npm run ai:check` tests models; `npm run ai:rotate-keys` rotates the key-encryption key (see `docs/security/byok.md`).

## Stack

Next.js 16 (App Router, React 19) · Convex (database + server functions) · Clerk (auth, also the source of GitHub OAuth tokens) · Inngest + `@inngest/agent-kit` (background jobs and the coding agent) · Vercel AI SDK (Anthropic / Google / DeepSeek / Ollama) · Firecrawl (URL scraping) · WebContainers + xterm (preview/terminal) · Octokit (GitHub) · CodeMirror 6 · Tailwind v4 + shadcn/ui (new-york) · Zustand · Sentry.

## Architecture

### Three trust zones

This is the single most important thing to understand; getting it wrong causes auth failures.

1. **Browser → Convex directly.** Client components use Convex React hooks. These call the *public* API in `convex/projects.ts`, `files.ts`, `conversations.ts`, which authenticate with `verifyAuth(ctx)` (`convex/auth.ts`). Anything scoped to a project goes through `verifyProjectAccess(ctx, projectId, { minimum? })`, which admits the owner (`ownerId` = Clerk's `identity.subject` = `users.clerkId`) and active `projectContributors` rows (role `admin` or `contributor`). Roles rank owner > admin > contributor: pass `minimum: "admin"` for rename / export / managing contributors, `minimum: "owner"` for deleting the project and promoting/demoting admins. Don't hand-roll `project.ownerId !== identity.subject` checks — they lock contributors out.
2. **Browser → Next.js route handlers** (`src/app/api/**`). These guard with Clerk's `auth()` from `@clerk/nextjs/server`, then either call Convex over HTTP or emit an Inngest event.
3. **Server → Convex** (route handlers, Inngest functions). There is no Clerk identity in this zone, so it uses `convex/system.ts`: every function there takes an `internalKey` argument validated against `ANUBITHIC_STUDIO_CONVEX_INTERNAL_KEY`. Use the shared `ConvexHttpClient` in `src/lib/convex-client.ts`.

Never call a `convex/system.ts` function from the browser, and never add a client-facing function that skips `verifyAuth`. Route handlers that act on a project must check the caller's role with `api.system.getProjectRole` (passing Clerk's `userId`) — the internal key alone authorizes the *server*, not the user.

### Event-driven background work

Long work is never done in the request. A route handler validates, writes a placeholder row to Convex, sends an Inngest event, and returns immediately; the UI observes progress through Convex reactivity (`messages.status` / `messages.steps`, `projects.importStatus` / `exportStatus`).

Events and their functions (all registered in [route.ts](src/app/api/inngest/route.ts) — a new function must be added there or it will never run):

| Event | Function | Cancel event |
| --- | --- | --- |
| `message/sent` | [process-message.ts](src/features/conversations/inngest/process-message.ts) | `message/cancel` (matched on `messageId`) |
| `github/import.repo` | [import-github-repo.ts](src/features/projects/inngest/import-github-repo.ts) | — |
| `github/export.repo` | [export-to-github.ts](src/features/projects/inngest/export-to-github.ts) | `github/export.cancel` (matched on `projectId`) |

Conventions in these functions: wrap every side effect in `step.run`; throw `NonRetriableError` for config/validation problems so Inngest doesn't retry; implement `onFailure` to write a terminal status back to Convex, otherwise the UI spins forever. Cancellation is declared via `cancelOn` with an `if` expression comparing `event.data.*` to `async.data.*`.

### The coding agent

`process-message.ts` builds an agent-kit network. Its tools live one per file in `src/features/conversations/inngest/tools/` (`list-files`, `read-files`, `create-files`, `update-files`, `create-folders`, `rename-file`, `delete-files`, `scrape-urls`) and are factory functions (`createXTool(...)`) closing over `projectId` and the internal key — they mutate Convex, which is what makes edits appear live in the user's editor. Model choice and prompts live in `src/features/ai/` (see below). A separate small agent generates the conversation title when it is still `DEFAULT_CONVERSATION_TITLE`. Tool progress is surfaced by appending to the `steps` array on the message row.

Editor-inline AI (quick-edit, suggestion) is a different path: synchronous route handlers `api/quick-edit` and `api/suggestion` calling the Vercel AI SDK, paired with CodeMirror extensions under `src/features/editor/extensions/{quick-edit,suggestion}/` (an `index.tsx` for the extension, a `fetcher.ts` for the call). Both AI paths scrape any URLs found in the instruction with Firecrawl and inject them as `<doc url=…>` context.

### AI layer (`src/features/ai/`)

Never hard-code a model or import a provider (`openai(...)`, `anthropic(...)`) in a feature. `models.ts` is the registry (provider, API id, tier, `promptProfile`, `supportsTools`). ONE model, the user's pick in `userAiSettings`, drives every AI feature, running on the **user's own key** (Bring Your Own Key):

- **Security design, runbook and threat model: `docs/security/byok.md`.** Read it before touching key handling. Tests: `npm test`.
- Keys are saved only through `POST /api/ai-keys`: tested against the provider, AES-256-GCM encrypted with a versioned keyring (`server/key-crypto.ts`, `server/secrets.ts`), stored as ciphertext + `last4` via `api.aiCredentials.saveKey` **as the user** (Clerk session via `userConvexClient()`; the owner is `ctx.auth`, never an argument). `convex/aiKeys.ts` (browser) only lists (no ciphertext) and deletes. Never log a key or return it from a route or an Inngest step.
- Secrets have one purpose each and none is derived from another: `AI_KEYS_ENCRYPTION_KEY` (+ `_VERSION`, `_OLD_KEYS` during rotation), `AI_PROXY_TOKEN_SIGNING_KEY`, `AI_CREDENTIALS_CONVEX_KEY` (Next.js + Convex; gates `convex/aiCredentials.ts`), `AI_KEY_ROTATION_CONVEX_KEY` (rotation only, never in the runtime). `src/instrumentation.ts` validates them; production fails closed.
- Editor routes: `await resolveModel(userId)` → AI SDK `languageModel` with the decrypted key. They are rate-limited and output-capped via `server/ai-limits.ts`.
- Agents (agent-kit): `createAgentModel(definition, { userId, projectId, runId }, opts)`. agent-kit calls go through `step.ai.infer` (Inngest's servers), so the model points at `/api/ai-proxy/[provider]/…` with a 5-minute `abpt1.` capability bound to user + provider + model + project + run + jti. The proxy verifies it, calls `aiCredentials.consumeProxyToken` (run still processing, same project, still a member, replay budget), rate-limits, caps output tokens, and replaces provider error bodies. Keep all of that; the proxy only forwards the exact chat endpoints.
- `message/sent` carries `userId`: the agent runs on the SENDER's model and key.
- Prompts are written once as sections in `prompts/` and rendered per profile (`claude` → XML tags, others → markdown); editor output goes through `cleanCodeOutput`, agent text through `stripThinking`.
- Dev only (`NODE_ENV === "development"`): `AI_ALLOW_ENV_KEYS=true` falls back to the app's provider keys; `AI_DEFAULT_MODEL` overrides the default model.
- Logging: AI code logs errors only through `logAiError` (`server/safe-log.ts`, metadata only). Sentry collects no bodies, frame variables, AI prompts or auth headers, and `sentryScrubHooks` (`src/lib/sentry-scrub.ts`) runs on everything. Don't loosen these.
- Fetches to a user-supplied URL (Ollama) go through `assertSafeOllamaUrl` and `safeFetch` (no redirects; production DNS-pinned private-IP check).

## Structure & boundaries

- `src/app/` — routes only. `/`, `/projects/[projectId]` (the IDE), and `api/{inngest,messages,quick-edit,suggestion,github/{import,export}}`. Pages delegate to `src/features/`.
- `src/features/<name>/` — the unit of organization: `auth`, `projects`, `editor`, `conversations`, `preview`, `ai`. Each has some of `views/`, `components/`, `hooks/`, `layouts/`, `store/`, `extensions/`, `prompts/`, `schemas/`, `inngest/`. New feature code belongs here, not in `app/` or a shared folder. Note that Inngest *functions* live with their feature while the *client* is shared in `src/inngest/client.ts`.
- `src/components/ui/` — shadcn primitives; prefer regenerating with the `shadcn` CLI over hand-editing. `src/components/ai-elements/` — chat UI blocks.
- `src/proxy.ts` — Clerk middleware (Next.js 16's replacement for `middleware.ts`). Its matcher must not catch the Sentry tunnel route `/monitoring`.
- `src/lib/` — shared clients (`convex-client.ts`, `firecrawl.ts`) and `utils.ts` (`cn`).

## Conventions

- Path alias `@/*` → `./src/*`. Convex generated types are imported by relative path (`../../../../convex/_generated/dataModel`) since `convex/` sits outside `src/`.
- Filenames kebab-case (`editor-view.tsx`, `use-editor-store.ts`).
- Route handler bodies are validated with Zod before use.
- Editor state goes through the Zustand store [use-editor-store.ts](src/features/editor/store/use-editor-store.ts): per-project tabs *and* file-tree expansion state. The VS Code-style auto-reveal of the active file reacts to `activeTabId` in [use-reveal-active-file.ts](src/features/projects/hooks/use-reveal-active-file.ts) — don't wire reveal calls into individual components.
- CodeMirror language/theme/minimap setup lives in `src/features/editor/extensions/` and `components/custom-setup.ts`.
- Light/dark/system theming via `next-themes` (class on `<html>`, switcher in `src/components/theme-switcher.tsx`). Use theme tokens (`bg-background`, `border-foreground/10`), not `white/…` tints; non-CSS surfaces follow `resolvedTheme` (CodeMirror via a Compartment in `code-editor.tsx`, xterm in `preview-terminal.tsx`, the home canvas).
- Comments often use `#region … #endregion` blocks explaining design decisions, and the codebase is heavily commented by intent (it's a teaching project). Preserve that style and density when editing.

## Gotchas

- `<Providers>` uses `ConvexProviderWithAuth` with our own `useAuthFromClerk` (`src/features/auth/hooks/`), not `ConvexProviderWithClerk`. The only difference is that the Clerk plan claim `pla` is in its dependencies, so Convex re-authenticates when the plan changes and Pro gates update without a reload. Don't swap it back.
- `convex/auth.config.ts` throws at import time if `CLERK_JWT_ISSUER_DOMAIN` is missing. `.env.local` also needs Clerk, Convex, `ANUBITHIC_STUDIO_CONVEX_INTERNAL_KEY`, `AI_KEYS_ENCRYPTION_KEY`, `AI_PROXY_TOKEN_SIGNING_KEY` and `AI_CREDENTIALS_CONVEX_KEY` (each `openssl rand -base64 32`; the credentials key must also be set on the Convex deployment; never change the encryption key without the rotation runbook), Firecrawl, and Sentry. Provider keys are only needed with `AI_ALLOW_ENV_KEYS=true`.
- `ANUBITHIC_STUDIO_CONVEX_INTERNAL_KEY` must be set in *both* the Next.js env and the Convex deployment env, or every server→Convex call fails.
- Sentry wraps `next.config.ts` via `withSentryConfig`; instrumentation is in `src/instrumentation*.ts`.
- CI has only a Gemini PR-review workflow (`.github/workflows/code-review.yml`, triggered by a `/gemini-review` comment) — no build or test gate.
- `AGENTS.md` covers the same ground for other agents; if you change a convention here, update it there too.
