<div align="center">

<img src="./public/anubithic-studio-banner.png" alt="Anubithic Studio" width="100%" />

# 𓃣 Anubithic Studio

**The collaborative AI code studio: build apps together with your team and an AI agent in real time, run them instantly in the browser, and ship them to GitHub.**

<p>
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js_16-000000?style=for-the-badge&logo=nextdotjs&logoColor=white" />
  <img alt="React" src="https://img.shields.io/badge/React_19-61DAFB?style=for-the-badge&logo=react&logoColor=black" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" />
  <img alt="Convex" src="https://img.shields.io/badge/Convex-EE342F?style=for-the-badge&logo=convex&logoColor=white" />
  <img alt="Clerk" src="https://img.shields.io/badge/Clerk-6C47FF?style=for-the-badge&logo=clerk&logoColor=white" />
  <img alt="Inngest" src="https://img.shields.io/badge/Inngest-000000?style=for-the-badge&logo=inngest&logoColor=white" />
  <img alt="Vercel AI SDK" src="https://img.shields.io/badge/AI_SDK-000000?style=for-the-badge&logo=vercel&logoColor=white" />
  <img alt="WebContainers" src="https://img.shields.io/badge/WebContainers-1389FD?style=for-the-badge&logo=stackblitz&logoColor=white" />
  <img alt="Tailwind" src="https://img.shields.io/badge/Tailwind_CSS_4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" />
  <img alt="Sentry" src="https://img.shields.io/badge/Sentry-362D59?style=for-the-badge&logo=sentry&logoColor=white" />
</p>

</div>

---

## 📖 Overview

Anubithic Studio is an AI-powered code studio that runs entirely in your browser. Describe the app you want, and an AI agent builds it for you file by file while you watch. You can then run it instantly, refine it together with your team, and publish it to GitHub, all from one tab with nothing to install.

**Built for teams.** Invite your teammates to a project and build together in real time. You can see who's online, which file each person is working on, and every change the moment it happens, whether a teammate made it or the AI did.

**Your AI, your choice.** Connect your own Claude or GPT account, or run a model privately on your own machine. One choice powers every AI feature in the studio, and your keys stay protected.

**Design:** The studio is built around the Anubis mark. It has an animated logo, a home scene that follows the time of day, and polished **dark, light and system** themes throughout.

---

## ✨ Features

### 👥 Team Collaboration *(Pro)*

- **Invite anyone**: send an invite by email, even to people who haven't signed up yet
- **Clear roles**: owners, admins and contributors each get the right level of control, so the people who build and the people who manage can work side by side
- **See who's here**: a live status bar shows who is in the project and which file each person has open
- **Follow a teammate**: click someone's name to jump straight to the file they're working on
- **Real-time everything**: edits, new files and AI changes appear for everyone instantly

### 🤖 AI Coding Agent

- **From idea to app in one prompt**: describe what you want and a new project is created with the AI already building it
- **Works like a real developer**: it explores your project, reads your code, and creates, edits, reorganizes and cleans up files on its own
- **Watch it work**: every change appears live in your editor, and each step is shown in the chat as it happens
- **Always in control**: stop the AI at any moment
- **Organized conversations**: keep multiple chats per project, each named automatically, and come back to any of them later
- **Beautiful answers**: formatted text, highlighted code, math and diagrams right in the chat
- **Learns from any link**: paste a docs page or article and the AI reads it before answering

### ✍️ AI in the Editor

- **Smart autocomplete**: the AI suggests the next lines as you type; press `Tab` to accept
- **Quick Edit**: select code, say what to change, and it's rewritten in place
- **Ask about any selection**: send highlighted code straight to the chat

### 🔑 Bring Your Own AI

- **Claude & GPT models**: choose from Anthropic's Claude family or OpenAI's GPT family, from fast and low-cost to the most capable. Each is tested with the full agent workflow before it's offered, so you can switch models without losing any feature.
- **One choice, everywhere**: the model you pick powers the agent, autocomplete and Quick Edit
- **Run it locally**: connect a model on your own computer for full privacy, with suggestions on which models suit your hardware
- **Pay only for what you use**: usage goes to your own AI account, at the provider's prices
- **Your keys stay safe**: every key is checked before it's saved, encrypted, never shown again, and never handed to the AI
- **Transparent security**: a public security page explains exactly how your keys are protected

### 🖥️ Code Editor

- **A familiar, professional editor**: syntax highlighting for the most popular web and backend languages, a code minimap and one-key formatting
- **Tabs like your desktop IDE**: open, switch and preview files, with a path bar for the current file
- **Your layout, your way**: resize the chat, file tree, editor and preview panels
- **Never lose your place**: the file tree always follows the file you're working on

### 📁 File Explorer

- **Manage your project visually**: create, rename and delete files and folders right in the tree
- **Drag and drop**: reorganize your project by dragging files and folders
- **Images and assets included**: not just code, so your whole project lives in one place
- **Instantly recognizable**: icons for every common file type

### ▶️ Live Preview & Terminal

- **Run your app instantly**: install and launch your project right in the browser, with no setup and no server
- **See changes live**: the preview refreshes as you or the AI edit code
- **Built-in terminal**: follow what your app is doing as it installs and runs
- **Adjustable**: change how your project installs and starts

### 🐙 GitHub Import & Export *(Pro)*

- **Bring in any repository**: import a GitHub repo and start working on it in seconds
- **Publish in one click**: export your project to a new public or private GitHub repository
- **Progress you can see**: follow imports and exports as they run, and cancel an export anytime
- **No extra setup**: just sign in with GitHub

### 🏠 Projects & Home

- **Start from a prompt**: the home page gets you from idea to project in one step
- **Pick up where you left off**: your recent projects are always one click away
- **Keyboard-first**: a command palette and shortcuts for searching projects, importing and prompting
- **Stay organized**: rename and delete projects and conversations with confirmation

### 🔐 Platform

- **Easy sign-in**: email or social login, including GitHub
- **Free and Pro plans**: upgrade and Pro features unlock instantly, with no reload
- **Secure by design**: access to every project is checked on the server, for every action
- **Reliable**: errors are monitored so problems get fixed fast, without collecting your code or prompts

---

## 🧰 Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Framework** | Next.js 16 (App Router, Turbopack) |
| **Language** | TypeScript 5 (strict) |
| **UI** | React 19, Tailwind CSS 4, shadcn/ui, Radix UI, Base UI, Lucide, Motion |
| **Database & backend** | Convex (reactive database, server functions, file storage) |
| **Auth & billing** | Clerk (auth, Clerk Billing, GitHub OAuth tokens) |
| **Background jobs** | Inngest (durable steps, cancellation, concurrency) |
| **AI agent** | `@inngest/agent-kit` (multi-tool agent network) |
| **AI models** | Vercel AI SDK: Anthropic (Claude), OpenAI (GPT), Ollama |
| **Web scraping** | Firecrawl |
| **Editor** | CodeMirror 6 + minimap, indentation markers |
| **Runtime preview** | WebContainers + xterm.js |
| **GitHub** | Octokit |
| **Chat UI** | AI Elements, Streamdown, Shiki |
| **State** | Zustand (editor tabs, file-tree expansion) |
| **Forms & validation** | TanStack Form, React Hook Form, Zod 4 |
| **Monitoring** | Sentry |
| **Testing** | Vitest, convex-test |

---

## 🚀 Getting Started

### 1. Prerequisites

- **Node.js** ≥ 20 and npm
- Accounts for **Convex**, **Clerk**, **Inngest**, **Firecrawl** and **Sentry**
- An API key from at least one AI provider (Anthropic or OpenAI), **or** a local [Ollama](https://ollama.com) install

### 2. Clone and install

```bash
git clone https://github.com/BeshoyRomany/anubithic-studio.git
cd anubithic-studio
npm install
```

### 3. Environment variables

Create a `.env.local` file in the project root:

```bash
# App (public https URL; the agent's AI proxy is served from here)
APP_URL=https://localhost:3001

# Convex (written for you by `npx convex dev`)
CONVEX_DEPLOYMENT=
NEXT_PUBLIC_CONVEX_URL=

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_JWT_ISSUER_DOMAIN=

# Server → Convex (also set on the Convex deployment)
ANUBITHIC_STUDIO_CONVEX_INTERNAL_KEY=

# BYOK security (generate each with: openssl rand -base64 32)
AI_KEYS_ENCRYPTION_KEY=
AI_PROXY_TOKEN_SIGNING_KEY=
AI_CREDENTIALS_CONVEX_KEY=        # also set on the Convex deployment

# Firecrawl
FIRECRAWL_API_KEY=

# Sentry
SENTRY_AUTH_TOKEN=

# Inngest (required in production)
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=

# Dev only: fall back to the app's own provider keys
# AI_ALLOW_ENV_KEYS=true
# ANTHROPIC_API_KEY=
# OPENAI_API_KEY=
```

Set `CLERK_JWT_ISSUER_DOMAIN`, `ANUBITHIC_STUDIO_CONVEX_INTERNAL_KEY` and `AI_CREDENTIALS_CONVEX_KEY` on the **Convex deployment** as well:

```bash
npx convex env set ANUBITHIC_STUDIO_CONVEX_INTERNAL_KEY <value>
```

> **⚠️ Clerk:** enable **GitHub** as a social connection (with `repo` scope) for import/export, and create a **`pro`** plan in Clerk Billing to unlock the Pro features.

> **⚠️ Encryption key:** never change `AI_KEYS_ENCRYPTION_KEY` by hand once keys are stored. Follow the rotation runbook in [`docs/security/byok.md`](./docs/security/byok.md).

### 4. Start the backend

```bash
npx convex dev
```

### 5. Run it

Each in its own terminal:

```bash
npm run dev                      # Next.js on https://localhost:3001
npx inngest-cli@latest dev       # Inngest dev server (agent, import, export)
```

Open **https://localhost:3001** in your browser.

> **⚠️ HTTPS:** the dev server runs with `--experimental-https` using the self-signed `localhost+1*.pem` certificates in the repo root. WebContainers need a secure, cross-origin-isolated context, so plain `http://localhost:3000` won't work.

Then open the model picker, add your API key (or connect Ollama), and start prompting.

---

## 📜 Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Start the Next.js dev server over HTTPS on port 3001 |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint |
| `npm test` | Run the Vitest + convex-test security suite |
| `npm run ai:check` | Live-test the registered models against their providers |
| `npm run ai:rotate-keys` | Re-encrypt stored AI keys under a new encryption key |
| `npx convex dev` | Run and sync the Convex backend |
| `npx inngest-cli@latest dev` | Local Inngest dev server for background jobs |

---

## 🏗️ Architecture

### Modular by feature

Every feature is self-contained: its UI, hooks, store, prompts and background jobs live together:

```
src/
├── app/                        # Routes only — pages delegate to features
│   ├── page.tsx                # Home: prompt, recent projects
│   ├── projects/[projectId]/   # The IDE
│   ├── invites/[inviteId]/     # Accept a team invite
│   ├── security/               # Public BYOK security page
│   └── api/                    # messages, quick-edit, suggestion, ai-keys, ai-local,
│                               # ai-proxy, github/{import,export}, projects, inngest
├── features/<feature>/         # auth · projects · editor · conversations · preview · ai
│   ├── views/ components/ hooks/ layouts/ store/
│   ├── extensions/             # CodeMirror extensions (editor)
│   ├── prompts/ server/        # prompt sections, key crypto, proxy (ai)
│   └── inngest/                # background functions + agent tools
├── components/ui/              # shadcn/ui primitives
├── components/ai-elements/     # Chat UI blocks
├── inngest/client.ts           # Shared Inngest client
├── lib/                        # Convex HTTP client, Firecrawl, rate limit, Sentry scrub
└── proxy.ts                    # Clerk middleware
convex/                         # Schema + public API, auth helpers, system (server-only) API
tests/                          # Vitest + convex-test security tests
docs/security/byok.md           # BYOK design, runbook and threat model
```

### The agent pipeline

```
User sends a message → POST /api/messages (Clerk auth + role check)
   → placeholder assistant message written to Convex (status: processing)
   → Inngest event  message/sent
   → agent-kit network runs (≤ 20 turns) on the sender's model and key
        ↳ each tool call → Convex mutation → editor updates live
        ↳ each step appended to messages.steps → progress in the chat
   → final answer written, status: completed   (or cancelled via message/cancel)
```

Route handlers never do the long work. They validate with Zod, write a placeholder row, emit an event and return. Every side effect inside the job is a `step.run`, config errors throw `NonRetriableError`, and `onFailure` always writes a terminal status so the UI never spins forever. GitHub import (`github/import.repo`) and export (`github/export.repo`, cancellable) follow the same pattern.

### Three trust zones

1. **Browser → Convex:** public queries/mutations authenticate with `verifyAuth` and check project roles with `verifyProjectAccess`.
2. **Browser → Next.js route handlers:** guarded by Clerk's `auth()`, and they check the caller's project role before acting.
3. **Server → Convex:** Inngest functions and route handlers have no user identity, so `convex/system.ts` functions require an internal key. The browser never calls them.

### How the agent uses your key without seeing it

agent-kit model calls are executed by Inngest's servers, so they can't hold your provider key. Instead the model points at `/api/ai-proxy/[provider]/…` with a **5-minute signed capability** bound to user + provider + model + project + run. The proxy checks it against Convex (the run is still processing, you are still a member, the replay budget is not used up), decrypts your key for that one request, enforces rate and output-token limits, and replaces provider error bodies before anything is logged.

### Security highlights

- **Key encryption**: AES-256-GCM with a random IV per key, AAD bound to user + provider, and a versioned keyring with a rotation script (`npm run ai:rotate-keys`). Only the last 4 characters are ever returned.
- **Least privilege**: AI credential functions in Convex need a dedicated key *and* the user's Clerk session; each secret has one purpose, and none is derived from another.
- **Limits**: per-user rate limits and output-token caps on every AI route, request body size limits, and at most 2 agent runs in flight per user.
- **Audit**: every key save, replace, delete and re-encryption is logged, without any key material.
- **Safe logging**: AI errors are logged as metadata only, and Sentry scrubs bodies, prompts, keys and auth headers (tunneled through `/monitoring`).
- **Fail-closed startup**: production refuses to boot if a security secret is missing or malformed.
- **Local models**: user-supplied Ollama URLs are checked against private-IP and redirect attacks.
- **Tests**: Vitest + convex-test cover encryption, proxy tokens, logging and shared-project access. The full threat model is in [`docs/security/byok.md`](./docs/security/byok.md).

### Realtime updates

Nothing is polled. Chat messages, agent steps, file contents, import/export status and teammate presence are all Convex queries. When the database changes, every subscribed client re-renders, so the UI always matches the database.

---

## 📄 License

Released under the MIT License.

---

<div align="center">

**Built by [Beshoy Romany](https://github.com/BeshoyRomany)**

⭐ If you find this project useful, consider giving it a star!

</div>
