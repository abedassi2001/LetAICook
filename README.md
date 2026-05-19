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

**Architecture diagrams:** [`Plan/letAIcook_Architecture_UML.md`](./Plan/letAIcook_Architecture_UML.md) (Mermaid — deployment, data model, flows). Older `Plan/letAIcook_Use_Cases_and_UML.md` is not aligned with the current stack. **Implementation must match** `AI_PROJECT_INSTRUCTIONS.md`.

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
| `apps/api` | FastAPI (`uvicorn main:app`). Source package `letaicook_api/` — `routers/` (health, chat, design, Jira), `services/` (Gemini). Same HTTP routes as before. |
| `firebase/` | `firestore.rules`, `firebase.json` — deploy with Firebase CLI. |
| `deploy/` | Production deploy guide (Firebase Hosting + Cloud Run). See [`deploy/README.md`](./deploy/README.md). |
| `scripts/` | Optional local tools (e.g. evening Firestore task reminder for Windows). |
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

## Production deploy (shareable link)

Deploy so teammates and customers can open **`https://<your-project-id>.web.app`**:

1. **API** → Google Cloud Run (Gemini + Jira): `.\scripts\deploy-api-cloudrun.ps1`
2. **Web + Firestore rules** → Firebase: `.\scripts\deploy-hosting.ps1`

Full steps, GitHub Actions CI, and secrets: **[`deploy/README.md`](./deploy/README.md)**.

---

## Environment variables (summary)

| Where | Variable | Purpose |
|-------|----------|---------|
| `apps/web/.env.local` | `NEXT_PUBLIC_FIREBASE_*` | Firebase web SDK (public); cloud project unless emulators are enabled. |
| `apps/web/.env.local` | `NEXT_PUBLIC_API_BASE_URL` | FastAPI origin for `/chat/plan`, `/design-project`, … (see `src/lib/api-base.ts`). |
| `apps/web/.env.local` | `NEXT_PUBLIC_USE_SAME_ORIGIN_API_PROXY`, `NEXT_PUBLIC_API_FOLLOW_WEB_HOST`, `NEXT_PUBLIC_API_PORT` | Optional; avoid hard-coding `localhost` for the API (see paragraph after the env table). |
| `apps/web` build (Vercel, etc.) | `LETAICOOK_API_PROXY_TARGET` | Server-only: enables Next rewrite `/__letaicook_api/*` → FastAPI when set at build. |
| `apps/api/.env.local` | `GOOGLE_API_KEY` or `GEMINI_API_KEY` | Gemini for chat + system designer. |
| `apps/api/.env.local` | `GEMINI_MODEL`, `GEMINI_MODEL_FALLBACKS` | Optional model selection and 429 fallbacks. |
| `apps/api/.env.local` | `CORS_ORIGINS` | Comma-separated origins; must include your deployed Next origin in production. |

Details: [`apps/api/api.env.sample`](./apps/api/api.env.sample), [`apps/web/firebase.web.env.sample`](./apps/web/firebase.web.env.sample).

**Using your real Firebase project (not emulators):** leave `NEXT_PUBLIC_USE_FIREBASE_EMULATOR` unset and fill all `NEXT_PUBLIC_FIREBASE_*` values from the Firebase console. Auth and Firestore then use Google’s cloud, not localhost.

**Calling FastAPI when it is not on `localhost:8000`:** set `NEXT_PUBLIC_API_BASE_URL` to your public API URL (for example `https://api.example.com`). If you open the app by LAN IP (`http://192.168.x.x:3000`), set `NEXT_PUBLIC_API_FOLLOW_WEB_HOST=true` so the browser uses the same host with port `8000` (see `apps/web/src/lib/api-base.ts`). For a single public web origin (for example Vercel) while the API stays on another host, set **`LETAICOOK_API_PROXY_TARGET`** at Next **build** time to the FastAPI base URL and **`NEXT_PUBLIC_USE_SAME_ORIGIN_API_PROXY=true`** in `apps/web/.env.local` so the browser calls `https://your-app.vercel.app/__letaicook_api/...` and Next rewrites to the API. Set **`CORS_ORIGINS`** on the API to include your deployed Next origin.

### Optional: evening task reminder (Windows)

`scripts/evening_task_reminder.py` reads open tasks from Firestore (`projects/{teamId}/tasks`) and shows a **native message box** (up to five items, newest `updatedAt` first for your assignments). It uses the **Firebase Admin SDK** with a **service account JSON** on your machine only — **never commit** that file.

1. Install deps once: `pip install -r scripts/requirements-task-reminder.txt` (not part of the API Docker image).
2. Copy [`scripts/task-reminder.env.sample`](./scripts/task-reminder.env.sample) to `scripts/.env.task-reminder` (gitignored via `.env.*`) or set variables in Task Scheduler.
3. Set **`GOOGLE_APPLICATION_CREDENTIALS`** to the JSON path, **`TASK_REMINDER_UID`** to your Firebase Auth uid, and optionally **`TASK_REMINDER_TEAM_ID`** (default `demo-project`). Admins can set **`TASK_REMINDER_ALL_OPEN_TASKS=1`** instead of `TASK_REMINDER_UID` to list the five most recently updated **team** open tasks (trusted PC only; Admin SDK bypasses Firestore rules).

Schedule **Task Scheduler** → daily at **18:00** → action: `python` with argument `scripts/evening_task_reminder.py` and “Start in” = repo root. Test with `python scripts/evening_task_reminder.py --dry-run`.

**Automated tests** (no Firebase project required; Firestore is mocked): from repo root, after `pip install -r scripts/requirements-task-reminder.txt`, run `pytest scripts/tests -v` or `python -m unittest discover -s scripts/tests -p "test_*.py" -v`. You should see all tests **OK** / **passed**.

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

### Automated tests

Tests use **mocks** so you do not need `GOOGLE_API_KEY` or Firebase for them.

| Where | Command | Notes |
|-------|---------|--------|
| **API** (`apps/api`) | `pytest` | From `apps/api` after `pip install -r requirements.txt`. **`tests/unit/`** — Pydantic design model, `gemini_shared` helpers (mocked). **`tests/integration/`** — `TestClient` for `/health`, `/chat/plan`, `/design-project` (no real API key). |
| **Web** (`apps/web`) | `npm run test` | Vitest; `npm run test:watch` for watch mode. Covers `parseDesignJson`, `buildProjectDescriptionFromMessages`. |

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
