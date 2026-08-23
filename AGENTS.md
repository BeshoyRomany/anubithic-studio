# AGENTS.md

Anubithic Studio is a browser-based IDE (Replit-style project workspace with file explorer and code editor), built chapter-by-chapter as a learning project. The excalidraw files in `Anubithic Studio - docs/` are numbered design docs (01-auth … 09-code-editor) matching the git history — consult the relevant one before working on a feature area.

## Commands

- `npm run dev` — Next.js dev server on **port 3001** with `--experimental-https` (self-signed certs `localhost+1*.pem` in repo root)
- `npm run build` — production build
- `npm run lint` — ESLint (`eslint-config-next`, no custom rules)
- `npx convex dev` — run/sync the Convex backend (no script defined in package.json)
- No test framework is set up.

## Stack

Next.js 16 (App Router, React 19) · Convex (database + server functions) · Clerk (auth) · Inngest (background jobs) · Sentry (error tracking) · Vercel AI SDK (Google + Anthropic) · Firecrawl (scraping) · CodeMirror 6 (editor) · Tailwind v4 + shadcn/ui (new-york style) · Zustand (editor state).

## Structure & boundaries

- `src/app/` — routes only: `/` (home), `/projects/[projectId]` (the IDE layout), `/api/inngest` (Inngest route handler). Feature logic does not live here; pages delegate to `src/features/`.
- `src/features/<name>/` — feature modules (`auth`, `projects`, `editor`) organized into `views/`, `components/`, `hooks/`, `layouts/`, plus `extensions/` and `store/` in the editor. New feature code belongs in a feature folder, not in `app/` or a shared directory.
- `src/components/ui/` — shadcn/ui primitives; prefer regenerating via the `shadcn` CLI over hand-editing.
- `src/inngest/` — Inngest client (id `anubithic-studio`, Sentry middleware) and functions. Functions use `step.run` steps; the AI functions extract URLs from prompts and scrape them via Firecrawl before calling the model.
- `src/proxy.ts` — Clerk middleware (Next.js 16's replacement for `middleware.ts`). The Sentry tunnel route `/monitoring` must not be caught by its matcher.
- `convex/` — backend: `schema.ts` (tables `projects`, `files`), `projects.ts`, `files.ts`, `auth.ts`/`auth.config.ts`. `convex/_generated/` is auto-generated — never edit it.
- `src/lib/` — shared clients (`firecrawl.ts`) and `utils.ts` (`cn`).

## Conventions

- Path alias `@/*` → `./src/*`.
- Filenames are kebab-case (`editor-view.tsx`, `use-editor-store.ts`).
- Convex mutations/queries authenticate via `verifyAuth(ctx)` from `convex/auth.ts`; ownership is checked against Clerk's `identity.subject` stored as `ownerId`. Keep queries index-backed (`by_owner`, `by_project`, `by_parent`, `by_project_parent`).
- Editor state goes through the Zustand store at `src/features/editor/store/use-editor-store.ts`: tabs per project AND the file-tree expansion state (root + folders). The tree's auto-reveal of the active file (VS Code style) reacts to `activeTabId` changes via `src/features/projects/hooks/use-reveal-active-file.ts` — don't wire reveal calls into individual UI components. CodeMirror language/theme/minimap setup lives in `src/features/editor/extensions/` and `components/custom-setup.ts`.
- Comments frequently use `#region … #endregion` blocks explaining design decisions — preserve them when editing.

## Gotchas

- Dev server is HTTPS on port 3001, not HTTP on 3000.
- Requires many env vars in `.env.local` (Clerk, Convex, `CLERK_JWT_ISSUER_DOMAIN`, Google/Anthropic, Firecrawl, Sentry). `convex/auth.config.ts` throws at import time if `CLERK_JWT_ISSUER_DOMAIN` is missing.
- Sentry wraps `next.config.ts` via `withSentryConfig`; instrumentation lives in `src/instrumentation*.ts`.
- CI has only a Gemini PR-review workflow (triggered by `/gemini-review` comment) — no build/test gates.
