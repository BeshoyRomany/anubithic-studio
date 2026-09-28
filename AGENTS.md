# AGENTS.md

Anubithic Studio is a browser-based IDE (Replit-style project workspace with file explorer and code editor), built chapter-by-chapter as a learning project. The excalidraw files in `Anubithic Studio - docs/` are numbered design docs (01-auth … 09-code-editor) matching the git history — consult the relevant one before working on a feature area.

## Commands

- `npm run dev` — Next.js dev server on **port 3001** with `--experimental-https` (self-signed certs `localhost+1*.pem` in repo root)
- `npm run build` — production build
- `npm run lint` — ESLint (`eslint-config-next`, no custom rules)
- `npx convex dev` — run/sync the Convex backend (no script defined in package.json)
- No test framework is set up.

## Stack

Next.js 16 (App Router, React 19) · Convex (database + server functions) · Clerk (auth) · Inngest (background jobs) · Sentry (error tracking) · Vercel AI SDK + Inngest agent-kit (Anthropic, OpenAI, Gemini, DeepSeek, Qwen, local Ollama) · Firecrawl (scraping) · CodeMirror 6 (editor) · Tailwind v4 + shadcn/ui (new-york style) · Zustand (editor state).

## Structure & boundaries

- `src/app/` — routes only: `/` (home), `/projects/[projectId]` (the IDE layout), `/api/inngest` (Inngest route handler). Feature logic does not live here; pages delegate to `src/features/`.
- `src/features/<name>/` — feature modules (`auth`, `projects`, `editor`) organized into `views/`, `components/`, `hooks/`, `layouts/`, plus `extensions/` and `store/` in the editor. New feature code belongs in a feature folder, not in `app/` or a shared directory.
- `src/components/ui/` — shadcn/ui primitives; prefer regenerating via the `shadcn` CLI over hand-editing.
- `src/inngest/` — Inngest client (id `anubithic-studio`, Sentry middleware). Inngest functions live with their feature and are registered in `src/app/api/inngest/route.ts`.
- `src/features/ai/` — the only place that chooses a model: `models.ts` (registry), `server/resolve-model.ts` (`resolveModel()` → AI SDK model + agent-kit model, call it outside `step.run`), `prompts/` (written once, rendered as XML for Claude or markdown for others), `utils/clean-output.ts`. Never import a provider directly in a feature. Models run on the user's own encrypted key (`/api/ai-keys`, `aiKeys` table); agent-kit calls go through `/api/ai-proxy` with a scoped, run-bound capability so Inngest never sees the key. AI credential data is behind `AI_CREDENTIALS_CONVEX_KEY` (`convex/aiCredentials.ts`), not the general internal key. Log AI errors only via `logAiError`. Security design, rotation runbook and threat model: `docs/security/byok.md`; tests: `npm test`.
- `src/proxy.ts` — Clerk middleware (Next.js 16's replacement for `middleware.ts`). The Sentry tunnel route `/monitoring` must not be caught by its matcher.
- `convex/` — backend: `schema.ts` (tables `projects`, `files`), `projects.ts`, `files.ts`, `auth.ts`/`auth.config.ts`. `convex/_generated/` is auto-generated — never edit it.
- `src/lib/` — shared clients (`firecrawl.ts`) and `utils.ts` (`cn`).

## Conventions

- Path alias `@/*` → `./src/*`.
- Filenames are kebab-case (`editor-view.tsx`, `use-editor-store.ts`).
- Convex mutations/queries authenticate via `verifyAuth(ctx)` from `convex/auth.ts`; project access goes through `verifyProjectAccess(ctx, projectId, { minimum? })`, which admits the owner (`ownerId` = Clerk `identity.subject` = `users.clerkId`) and active `projectContributors` rows (`admin` / `contributor`); roles rank owner > admin > contributor (`minimum: "admin"` for rename/export/team, `"owner"` for delete and admin promotion). Route handlers check the caller with `api.system.getProjectRole`. Keep queries index-backed (`by_owner`, `by_project`, `by_parent`, `by_project_parent`, `by_project_user`, `by_user_status`).
- Editor state goes through the Zustand store at `src/features/editor/store/use-editor-store.ts`: tabs per project AND the file-tree expansion state (root + folders). The tree's auto-reveal of the active file (VS Code style) reacts to `activeTabId` changes via `src/features/projects/hooks/use-reveal-active-file.ts` — don't wire reveal calls into individual UI components. CodeMirror language/theme/minimap setup lives in `src/features/editor/extensions/` and `components/custom-setup.ts`.
- Light/dark/system theming via `next-themes` (class on `<html>`, switcher in `src/components/theme-switcher.tsx`). Use theme tokens (`bg-background`, `border-foreground/10`), not `white/…` tints; non-CSS surfaces follow `resolvedTheme` (CodeMirror via a Compartment in `code-editor.tsx`, xterm in `preview-terminal.tsx`, the home canvas).
- Comments frequently use `#region … #endregion` blocks explaining design decisions — preserve them when editing.

## Team roles & permissions

Every project has one **owner** (`projects.ownerId`) plus optional team members in `projectContributors` with role `admin` or `contributor`. Only rows with `status: "active"` grant access; a `pending` invite grants nothing until the invitee accepts it. Enforce these rules server-side, with `verifyProjectAccess(..., { minimum })` in Convex and `api.system.getProjectRole` in route handlers. The UI only hides controls the server would reject anyway.

| Action | Owner | Admin | Contributor |
| --- | :-: | :-: | :-: |
| Open the project; read/edit/create/move/delete files | ✓ | ✓ | ✓ |
| Conversations + AI agent, preview settings | ✓ | ✓ | ✓ |
| Rename the project | ✓ | ✓ | |
| Export to GitHub (export / cancel / reset) | ✓ | ✓ | |
| Invite contributors; remove contributors or cancel their invites | ✓ | ✓ | |
| Invite as admin; promote/demote (`contributors.setRole`); remove admins | ✓ | | |
| Delete the project | ✓ | | |
| Leave the project | — | ✓ | ✓ |
| Can be removed from the team | never | by owner | by owner or admin |

- **Minimum role:** use `minimum: "admin"` for the admin rows above and `minimum: "owner"` for the owner-only rows. Everything else needs only membership (no `minimum`).
- **The owner can't be removed:** the owner is not a `projectContributors` row, so there is nothing to delete. `contributors.remove` also stops an admin from removing another admin.
- **Accepting invites:** it requires the signed-in account's email (from the verified Clerk token) to match the invite email. Never take the email from a client argument.
- **GitHub import:** it isn't in the table because it always creates a *new* project owned by the importer.
- **Pro plan gate:** team collaboration needs the **owner's** Pro plan (Clerk Billing). `invite` and `setRole` throw without it, using `isTeamEnabled` in `convex/contributors.ts`.
  - When the caller is the owner, the plan is read from their own token with `hasProPlan(identity)`, which parses the `pla` claim.
  - For anyone else, it's read from the owner's `users.isPro` snapshot.
  - Existing members keep their access after a downgrade, and removing people always works. A free owner with no team sees a "Collaborate · PRO" button that opens the upgrade toast.

## Gotchas

- Dev server is HTTPS on port 3001, not HTTP on 3000.
- Requires many env vars in `.env.local` (Clerk, Convex, `CLERK_JWT_ISSUER_DOMAIN`, Google/Anthropic, Firecrawl, Sentry). `convex/auth.config.ts` throws at import time if `CLERK_JWT_ISSUER_DOMAIN` is missing.
- Sentry wraps `next.config.ts` via `withSentryConfig`; instrumentation lives in `src/instrumentation*.ts`.
- CI has only a Gemini PR-review workflow (triggered by `/gemini-review` comment) — no build/test gates.
