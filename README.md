# letAIcook

**Coordination platform for teams:** plan work with an AI assistant, visualize system architecture from structured data, and run a **Firebase-backed task board** (admin vs worker roles).

**Contributors and AI tools:** read [`AI_PROJECT_INSTRUCTIONS.md`](./AI_PROJECT_INSTRUCTIONS.md) first. It defines product intent, Firestore paths, security, and the workflow for every change.

---

## What this project is

letAIcook helps a team **stay aligned from idea to delivery**:

1. **Planning** — Talk through scope and execution on **`/chat`** (Gemini on the server).
2. **System design** — On **`/system-designer`**, turn a project description (including text synced from planning) into **structured JSON**: diagrams (Mermaid), service map, APIs, schema, React Flow graph, exports.
3. **Tasks** — On **`/tasks`**, admins publish and assign work; workers execute and complete items in **Firestore** (`projects/{projectId}/tasks/{taskId}`).

**Data today:** identities and tasks and designer workspaces live in **Firebase** (Auth + Firestore). **Server-side AI** uses **one Google Gemini API key** on **`apps/api`** (`GOOGLE_API_KEY` or `GEMINI_API_KEY`). Planning chat history is kept in the **browser** (`sessionStorage`) for handoff to the designer until a future Firestore-backed chat store is added.

**Roadmap / product docs:** extra ideas and UML-style notes may live under `Plan/`; **implementation must match** `AI_PROJECT_INSTRUCTIONS.md`.

---

## Teammates: run in three steps

1. **Clone** this repository.
2. **Web:** copy [`apps/web/firebase.web.env.sample`](./apps/web/firebase.web.env.sample) → **`apps/web/.env.local`** and fill `NEXT_PUBLIC_*` from the Firebase console (never commit real values).
3. **Start:** from the repo root run **`docker compose up --build`** (recommended) *or* `cd apps/web && npm install && npm run dev`. Open [http://localhost:3000](http://localhost:3000) → sign in at [`/login`](http://localhost:3000/login) → default experience is [`/chat`](http://localhost:3000/chat).

**AI features:** copy [`apps/api/api.env.sample`](./apps/api/api.env.sample) → **`apps/api/.env.local`** and set **`GOOGLE_API_KEY`** (or **`GEMINI_API_KEY`**). Restart the API container after edits. Same key powers **`/chat`** and **`/system-designer`** generation.

---

## Repository layout

| Path | Role |
|------|------|
| `apps/web` | Next.js (App Router, TypeScript, Tailwind). Routes: `/login`, `/chat`, `/system-designer`, `/tasks`. |
| `apps/api` | FastAPI: `GET /health`, `POST /chat/plan`, `POST /design-project`, `POST /design-project/jira-tasks`, `POST /design-project/pitch`. |
| `firebase/` | `firestore.rules`, `firebase.json` — deploy with Firebase CLI. |
| `Plan/` | Optional roadmap / domain notes (non-canonical vs `AI_PROJECT_INSTRUCTIONS.md`). |

---

## Architecture (current)

```text
Browser (Next.js)
    → Firebase Auth + Firestore (tasks, profiles, system designer workspace)
    → FastAPI (localhost:8000 or NEXT_PUBLIC_API_BASE_URL)
          → Google Gemini API (single key; never exposed as NEXT_PUBLIC_*)
```

There is **no PostgreSQL or Redis** in this repo today; do not assume they are required to run the app.

---

## Features implemented in code

| Area | Description |
|------|-------------|
| **Tasks** | Firestore task board; admin publishes/assigns; worker sees assigned tasks and updates status. |
| **Planning chat** | Multi-turn chat to **`POST /chat/plan`**; context stored in `sessionStorage` and summarized for the designer via `apps/web/src/lib/planning-sync.ts`. |
| **System designer** | **`POST /design-project`** returns JSON; UI renders Mermaid, React Flow, tables; export PNG / JSON / Markdown; versions stored under **`users/{uid}/systemDesigns/workspace`**. |

Optional extras: **Jira-style backlog** and **pitch** markdown from **`POST /design-project/jira-tasks`** and **`/pitch`**.

---

## Docker (team development)

Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine + Compose v2 on Linux).

```bash
docker compose up --build
```

- **Web:** [http://localhost:3000](http://localhost:3000)  
- **API:** [http://localhost:8000/health](http://localhost:8000/health)

Source under `apps/web` and `apps/api` is bind-mounted. The web service uses a **named volume** for `node_modules`; the image entrypoint runs **`npm ci`** when `package-lock.json` changes (see `.npm-install-stamp` in `apps/web`). After dependency changes, use **`docker compose up --build`**. If you see **“Module not found”**, run `docker compose down`, remove the `*_web_node_modules` volume from `docker volume ls`, then start again.

| Command | Purpose |
|---------|---------|
| `docker compose up --build web` | Web only. |
| `docker compose build api` | After `apps/api/requirements.txt` changes. |
| `docker compose down` | Stop containers. |

Compose loads `apps/web/.env.local` and `apps/api/.env.local` when present (`required: false`; Compose v2.24+).

---

## Environment variables (summary)

| Where | Variable | Purpose |
|-------|----------|---------|
| `apps/web/.env.local` | `NEXT_PUBLIC_FIREBASE_*` | Firebase web SDK (public). |
| `apps/web/.env.local` | `NEXT_PUBLIC_API_BASE_URL` | Optional; default `http://localhost:8000`. |
| `apps/api/.env.local` | `GOOGLE_API_KEY` or `GEMINI_API_KEY` | Gemini for chat + system designer. |
| `apps/api/.env.local` | `GEMINI_MODEL`, `GEMINI_MODEL_FALLBACKS` | Optional model selection and 429 fallbacks. |
| `apps/api/.env.local` | `CORS_ORIGINS` | Comma-separated origins; default includes `http://localhost:3000`. |

Details: [`apps/api/api.env.sample`](./apps/api/api.env.sample), [`apps/web/firebase.web.env.sample`](./apps/web/firebase.web.env.sample).

---

## AI planning chat (`/chat`)

Uses **`POST /chat/plan`** and **Gemini**. Prefer **`gemini-2.5-flash-lite`**; avoid deprecated **`gemini-2.0-flash`** (often quota `0` on free tier). On **429 / quota**, try billing, a new key/project, or **`GEMINI_MODEL_FALLBACKS`**. See Google’s [rate limits](https://ai.google.dev/gemini-api/docs/rate-limits).

---

## AI System Designer (`/system-designer`)

- **Input:** project description (typed or **synced from planning** until you edit the box); optional last messages sent as `context_messages` to the API.
- **Output:** structured JSON (diagrams, services, APIs, schema, relationships, React Flow, tasks). **Legacy** flat diagram fields in old snapshots are normalized in `apps/web/src/lib/system-design/normalize.ts`.
- **Persistence:** Firestore doc **`users/{uid}/systemDesigns/workspace`** (requires **deployed rules** — see below).

---

## Firebase + Auth

### Web config

In the [Firebase console](https://console.firebase.google.com/) → Project settings → Your apps → Web app, copy values into `apps/web/.env.local`. Set **`.firebaserc`** `default` project to the same `projectId`.

### Enable products

- **Firestore** — create database (production mode), then deploy rules.
- **Authentication** — enable **Email/Password**.

### Deploy Firestore rules (required for tasks + designer)

From the **repo root** (after `firebase login`):

```bash
firebase deploy --only firestore:rules
```

Rules file: [`firebase/firestore.rules`](./firebase/firestore.rules). They allow:

- **`users/{uid}`** — profile; sign-up creates `role: worker`; promote an admin in Console (see below).
- **`users/{uid}/systemDesigns/{docId}`** — system designer workspace (owner only).
- **`projects/{projectId}/tasks/{taskId}`** — admin-wide or assignee-scoped access per rules.

If **`FirebaseError: Missing or insufficient permissions`** appears on **`/system-designer`** or **`/tasks`**, the console project often still has **default deny** or an **old ruleset**: redeploy from this repo and confirm **`NEXT_PUBLIC_FIREBASE_PROJECT_ID`** matches the project you deployed to.

### First admin

Sign-up creates **`worker`** only. In Firestore **`users/{uid}`**, set **`role`** to **`admin`** for the account that should manage all tasks (see [`AI_PROJECT_INSTRUCTIONS.md`](./AI_PROJECT_INSTRUCTIONS.md)).

### Data model (quick reference)

| Path | Purpose |
|------|---------|
| `users/{uid}` | Profile: `displayName`, `emailLower`, `role`, timestamps. |
| `users/{uid}/systemDesigns/workspace` | Designer draft + `latest` snapshot + `versions`. |
| `projects/demo-project/tasks/{taskId}` | Tasks (`DEMO_PROJECT_ID` in `task-model.ts`). |

Types: `apps/web/src/lib/user-model.ts`, `task-model.ts`, `system-design-model.ts`.

### Run without Docker

```bash
cd apps/web && npm install && npm run dev
cd apps/api && python -m venv .venv && .venv\Scripts\activate && pip install -r requirements.txt && uvicorn main:app --reload --port 8000
```

### Firebase emulators (optional)

`firebase emulators:start --only firestore,auth` — set `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true` in `apps/web/.env.local` per `firebase.ts`.

---

## Tech stack (as in repo)

| Layer | Stack |
|-------|--------|
| Frontend | Next.js, React, TypeScript, Tailwind CSS |
| Backend | FastAPI, Uvicorn |
| Data | Firebase Auth, Cloud Firestore |
| AI | Google Gemini API (server-side only) |

---

## Vision (directional)

Grow letAIcook into a fuller **technical orchestration** tool: richer task lifecycle, optional Jira integration, persisted chat threads, and tighter links between planning, architecture JSON, and delivery. **`Plan/`** may describe ambitions; **`AI_PROJECT_INSTRUCTIONS.md`** remains the contract for what the codebase must honor today.

---

## License

MIT
