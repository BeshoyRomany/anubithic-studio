# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Anubithic Studio is a browser-based AI IDE (Replit/Lovable-style): file explorer, CodeMirror editor, an agentic chat that edits project files, a WebContainer live preview, and GitHub import/export. It is built chapter-by-chapter as a learning project — the numbered excalidraw files in `Anubithic Studio - docs/` (01-authentication … 15-gitHub-Import-and-export) map to the git history. Consult the doc for a feature area before working on it.

## Commands

- `npm run dev` — Next.js dev server on **HTTPS port 3001** (`--experimental-https`, self-signed certs `localhost+1*.pem` in repo root). Not HTTP 3000.
- `npm run build` / `npm run start` — production build / serve
- `npm run lint` — ESLint (`eslint-config-next`, no custom rules)
- `npx convex dev` — run/sync the Convex backend (no package.json script)
- `npx inngest-cli@latest dev` — local Inngest dev server if you need to exercise background jobs
- No test framework is set up.

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

`process-message.ts` builds an agent-kit network. Its tools live one per file in `src/features/conversations/inngest/tools/` (`list-files`, `read-files`, `create-files`, `update-files`, `create-folders`, `rename-file`, `delete-files`, `scrape-urls`) and are factory functions (`createXTool(...)`) closing over `projectId` and the internal key — they mutate Convex, which is what makes edits appear live in the user's editor. Prompts are in `src/features/conversations/prompts/`. A separate small agent generates the conversation title when it is still `DEFAULT_CONVERSATION_TITLE`. Tool progress is surfaced by appending to the `steps` array on the message row.

Editor-inline AI (quick-edit, suggestion) is a different path: synchronous route handlers `api/quick-edit` and `api/suggestion` calling the Vercel AI SDK directly, paired with CodeMirror extensions under `src/features/editor/extensions/{quick-edit,suggestion}/` (an `index.tsx` for the extension, a `fetcher.ts` for the call). Both AI paths scrape any URLs found in the instruction with Firecrawl and inject them as `<doc url=…>` context.

### Preview (WebContainers)

[use-webcontainers.ts](src/features/preview/hooks/use-webcontainers.ts) keeps a **module-level singleton** WebContainer plus a boot promise — only one instance may exist per page, so never boot it inside a component. Convex's flat `files` rows are converted to a nested `FileSystemTree` by [file-tree.ts](src/features/preview/utils/file-tree.ts). After the initial mount the hook diffs per-path content and writes only changed files. Install/dev commands come from `projects.settings` (AI-populated on first run, editable in the preview settings popover).

This requires cross-origin isolation: `next.config.ts` sets `Cross-Origin-Embedder-Policy: credentialless` and `COOP: same-origin` on all routes, and the container boots with `coep: "credentialless"`. Don't remove those headers, and be aware they constrain any third-party embed.

### GitHub import/export

Route handlers get the user's GitHub token from Clerk (`clerkClient` OAuth access token), then hand it to the Inngest function. Import clears the project's files first (`api.system.cleanup`), then walks the repo tree with Octokit; binary files are detected with `isbinaryfile` and stored in Convex file storage (`storageId`) rather than as text `content`. Export creates the repo and pushes, reading binaries back out via storage URLs. Status is mirrored onto the project row for the UI.

### Data model

`convex/schema.ts`: `users` (Clerk mirror keyed by `clerkId`, lowercased `email`; upserted by `users.store` from `UserSync` in `<Providers>` — the email comes from the Clerk session-token claims, never the client), `projectContributors` (invites by email: always `pending` until the invitee ACCEPTS — email must match the verified Clerk token — then `active` with `userId`; accept/decline on the home page or `/invites/[inviteId]`; managed in `convex/contributors.ts`), `presence` (one row per project+user with the active `fileId` and `lastSeenAt`; heartbeated by `usePresence` inside `<PresenceBar>` — staleness is judged client-side because queries don't re-run as time passes), `projects` (owner, import/export status, WebContainer `settings`), `files` (flat rows with `parentId` forming the tree; text in `content` *or* binary in `storageId`), `conversations`, `messages` (`status`, and a `steps` array driving the agent progress UI). Keep queries index-backed: `by_owner`, `by_project`, `by_parent`, `by_project_parent`, `by_conversation`, `by_project_status`. `convex/_generated/` is auto-generated — never edit it.

## Structure & boundaries

- `src/app/` — routes only. `/`, `/projects/[projectId]` (the IDE), and `api/{inngest,messages,quick-edit,suggestion,github/{import,export}}`. Pages delegate to `src/features/`.
- `src/features/<name>/` — the unit of organization: `auth`, `projects`, `editor`, `conversations`, `preview`. Each has some of `views/`, `components/`, `hooks/`, `layouts/`, `store/`, `extensions/`, `prompts/`, `schemas/`, `inngest/`. New feature code belongs here, not in `app/` or a shared folder. Note that Inngest *functions* live with their feature while the *client* is shared in `src/inngest/client.ts`.
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
- `convex/auth.config.ts` throws at import time if `CLERK_JWT_ISSUER_DOMAIN` is missing. `.env.local` also needs Clerk, Convex, `ANUBITHIC_STUDIO_CONVEX_INTERNAL_KEY`, model provider keys, Firecrawl, and Sentry.
- `ANUBITHIC_STUDIO_CONVEX_INTERNAL_KEY` must be set in *both* the Next.js env and the Convex deployment env, or every server→Convex call fails.
- Sentry wraps `next.config.ts` via `withSentryConfig`; instrumentation is in `src/instrumentation*.ts`.
- CI has only a Gemini PR-review workflow (`.github/workflows/code-review.yml`, triggered by a `/gemini-review` comment) — no build or test gate.
- `AGENTS.md` covers the same ground for other agents; if you change a convention here, update it there too.
