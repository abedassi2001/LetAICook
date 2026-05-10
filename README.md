
# letAIcook

AI-powered engineering execution and Jira coordination platform.

**Contributors & AI assistants:** read [`AI_PROJECT_INSTRUCTIONS.md`](./AI_PROJECT_INSTRUCTIONS.md) before changing code. It defines product goals (admin vs worker tasks, Firebase-first), security, and the workflow every change must follow.

### Teammates: run the app in three steps

1. **Clone** this repository.
2. **Configure Firebase for the web app:** copy [`apps/web/firebase.web.env.sample`](./apps/web/firebase.web.env.sample) to **`apps/web/.env.local`** and fill in the `NEXT_PUBLIC_*` values from the Firebase console. This file is listed in **`.gitignore`** — never commit it or put real keys in the repo.
3. **Start:** from the repo root run **`docker compose up --build`** (recommended; see [Docker (team development)](#docker-team-development)) *or* install Node.js, `cd apps/web`, `npm install`, `npm run dev`. Open [http://localhost:3000](http://localhost:3000) → **Sign in** at [`/login`](http://localhost:3000/login) (defaults to planning chat at [`/chat`](http://localhost:3000/chat); task board at [`/tasks`](http://localhost:3000/tasks)). For **AI planning chat**, set **`GOOGLE_API_KEY`** on the API service (see [AI planning chat](#ai-planning-chat)).

Firebase rules, first admin setup, and native (non-Docker) API commands are documented in the sections below.

---

## Overview

letAIcook is an AI engineering coordination platform that transforms software ideas into:
- structured engineering roadmaps
- intelligent task generation
- automated sprint planning
- Jira ticket creation
- AI-powered task assignment
- deployment guidance
- engineering explanations

The platform understands:
- software architecture
- dependencies
- developer roles
- workload balancing
- deployment workflows

---

# Core Features

## AI Roadmap Generator
Generate engineering roadmaps from simple project ideas.

## Intelligent Task Decomposition
Break large features into production-ready engineering tasks.

## Jira AI Integration
Automatically create and assign Jira tickets based on:
- developer skills
- workload
- project phase
- architecture requirements

## Skill Matching Engine
Assign tasks to the best engineer automatically.

## Dependency Tracking
Track blockers and relationships between engineering tasks.

## Sprint Planning
Generate sprint structures and priorities automatically.

## Deployment Guidance
Generate:
- Dockerfiles
- CI/CD templates
- deployment plans
- infrastructure suggestions

---

# High Level Architecture

*Target platform (roadmap):* frontend → FastAPI → services → data stores and external APIs.

Frontend (Next.js)
        ↓
FastAPI Backend
        ↓
--------------------------------
| Project Service              |
| Task Generation Engine       |
| Skill Matching Engine        |
| Sprint Planning Engine       |
| Jira Integration Service     |
| AI Orchestrator              |
--------------------------------
        ↓
PostgreSQL + Redis (planned for full product)
        ↓
OpenAI API + Jira API

**Current scaffold in this repo:** the **task board** and roles use **Firebase** (Firestore + Auth) per [`AI_PROJECT_INSTRUCTIONS.md`](./AI_PROJECT_INSTRUCTIONS.md). The FastAPI app exposes `GET /health` and **`POST /chat/plan`** (Gemini / Google AI Studio–backed planning assistant); do not assume PostgreSQL/Redis are required to run the UI.

**Current repo layout (scaffold):** product docs live in `Plan/`. Runnable code starts under `apps/`:

- `apps/web` — Next.js UI (**Firestore task board** at `/tasks`, **planning chat** at `/chat`, **AI System Designer** at `/system-designer`).
- `apps/api` — FastAPI (`GET /health`, `POST /chat/plan`, more integrations to follow).
- `firebase/` — Firestore security rules + root `firebase.json` for the Firebase CLI.

---

# Docker (team development)

Teammates can run the app **without installing Node.js or Python** on their machine. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows / macOS) or Docker Engine + Compose v2 on Linux.

### One-time per developer

1. Clone the repo from GitHub.
2. Add Firebase web config to **`apps/web/.env.local`** (copy `apps/web/firebase.web.env.sample` and fill in `NEXT_PUBLIC_*`). This file is **gitignored** — share values through your team’s usual secret channel, not the repo.
3. From the **repository root**:

```bash
docker compose up --build
```

4. Open **http://localhost:3000** (tasks: **http://localhost:3000/tasks**). Optional API health check: **http://localhost:8000/health**.

Source under `apps/web` and `apps/api` is **bind-mounted**; edits on the host reload inside the containers. `node_modules` for the web app lives in a Docker **named volume**; the web entrypoint runs **`npm ci`** when `package-lock.json` changes (tracked via `.npm-install-stamp`). After pulling new dependencies, run **`docker compose up --build`** so the updated entrypoint runs. If you still see **“Module not found”**, run `docker compose down`, remove the Compose volume that backs **`web_node_modules`** (see `docker volume ls`, name ends with `_web_node_modules`), then `docker compose up --build` again.

### Useful commands

| Command | Purpose |
|--------|---------|
| `docker compose up --build web` | Run only the Next.js app (skip API). |
| `docker compose build web` | Rebuild after `package.json` / lockfile changes. |
| `docker compose build api` | Rebuild after `requirements.txt` changes. |
| `docker compose down` | Stop containers. |

### Firebase CLI / rules

Deploying **Firestore rules** still uses the [Firebase CLI](https://firebase.google.com/docs/cli) on a machine that has it (your laptop or CI): `firebase deploy --only firestore:rules`. The containers do not replace that step.

### Compose note

`docker-compose.yml` uses `env_file` with `required: false` for `apps/web/.env.local` (Compose **v2.24+**). If `docker compose` errors on a missing env file, create `apps/web/.env.local` from the sample first. The **API** service optionally loads **`apps/api/.env.local`** the same way (see [AI planning chat](#ai-planning-chat)).

---

# AI planning chat

The **`/chat`** page calls the FastAPI endpoint **`POST /chat/plan`**, which uses the **Google Gemini** API (key from **[Google AI Studio](https://aistudio.google.com/)**). The key stays **only** on the server (`apps/api`), never in `NEXT_PUBLIC_*` variables.

1. In [Google AI Studio](https://aistudio.google.com/), open **Get API key** and create/copy a key.
2. In the repo, copy [`apps/api/api.env.sample`](./apps/api/api.env.sample) to **`apps/api/.env.local`** and set **`GOOGLE_API_KEY=`**_your key_ (this path is gitignored via `.env.*`). Alternatively you may use **`GEMINI_API_KEY`** if you prefer that name.
3. Restart the API container or process so the variable is loaded (`docker compose up --build` after changing `.env.local`, or restart the `api` service).
4. Open [http://localhost:3000/chat](http://localhost:3000/chat). The browser calls the API at **`NEXT_PUBLIC_API_BASE_URL`** if set (`apps/web/.env.local`), otherwise **`http://localhost:8000`**.

Optional: **`GEMINI_MODEL`** (default **`gemini-2.5-flash-lite`**). Avoid **`gemini-2.0-flash`** — it is deprecated and often reports **free-tier quota `limit: 0`**. If you still see **429 / quota** errors: enable **billing** on the Google Cloud project tied to your API key, create a **new** key under a fresh project, or set **`GEMINI_MODEL`** / **`GEMINI_MODEL_FALLBACKS`** in `apps/api/.env.local` (see [`apps/api/api.env.sample`](./apps/api/api.env.sample)). The API retries fallback models automatically when quota errors occur.

**`CORS_ORIGINS`** is a comma-separated list; default allows `http://localhost:3000`.

---

# AI System Designer (`/system-designer`)

The **`/system-designer`** page renders **only** from structured JSON: nested **`diagrams`** (Mermaid strings), **`relationships`** (or explicit **`react_flow_*`**), **`pages`**, **`backend_services`**, **`api_routes`**, **`database_schema`**, and tasks. Data comes from **`POST /design-project`**, **JSON import**, or Firestore history. Legacy flat diagram keys from older snapshots are normalized on load (see `apps/web/src/lib/system-design/normalize.ts`). It can use **planning chat context** automatically (messages are mirrored to `sessionStorage` from **`/chat`**).

1. Ensure **`GOOGLE_API_KEY`** (or **`GEMINI_API_KEY`**) is set on the API — the same key powers planning chat and system design (see [`apps/api/api.env.sample`](./apps/api/api.env.sample)). Restart the API after changes.
2. Deploy updated **Firestore rules** so `users/{uid}/systemDesigns/{docId}` is allowed for the signed-in user: `firebase deploy --only firestore:rules`.
3. Open [http://localhost:3000/system-designer](http://localhost:3000/system-designer) after signing in.

**API (FastAPI):** `POST /design-project`, `POST /design-project/jira-tasks`, `POST /design-project/pitch` — all use **Gemini** with the same **`GOOGLE_API_KEY`** / **`GEMINI_MODEL`** as **`POST /chat/plan`**. Planning chat messages can stream into the designer description (see `apps/web/src/lib/planning-sync.ts`).

---

# Firebase + Auth (tasks on Firestore)

### Where to get the “API” values (web app config)

These are **not** secret service-account keys. They identify your Firebase project in the browser.

1. Open [Firebase console](https://console.firebase.google.com/) → select your project (or create one).
2. **Project settings** (gear icon) → **General** → scroll to **Your apps**.
3. If you have no web app yet: add a **Web** app → register it (nickname e.g. `letAIcook-web`) → **Register app**.
4. Under **SDK setup and configuration**, choose **npm** or the config object. Copy these fields into `apps/web/.env.local` (see `apps/web/firebase.web.env.sample`):

   - `apiKey` → `NEXT_PUBLIC_FIREBASE_API_KEY`
   - `authDomain` → `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
   - `projectId` → `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
   - `storageBucket` → `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
   - `messagingSenderId` → `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
   - `appId` → `NEXT_PUBLIC_FIREBASE_APP_ID`

5. Put the same `projectId` into **`.firebaserc`** as `default` so `firebase deploy` targets the right project.

### Enable products in the console

1. **Build → Firestore Database** → create database (start in **production mode**; you will deploy our rules next).
2. **Build → Authentication** → **Sign-in method** → enable **Email/Password**.

### Deploy security rules

From the **repo root** (install [Firebase CLI](https://firebase.google.com/docs/cli), run `firebase login` once):

```bash
firebase deploy --only firestore:rules
```

Rules live in `firebase/firestore.rules`: signed-in **admins** manage all tasks; **workers** read/update only tasks where `assigneeUid` is their Auth uid. Profiles live in `users/{uid}`.

### First admin account

Sign-up in the app creates **`role: "worker"`** only. To get an admin:

1. **Authentication** → **Users** → copy the **User UID** of the account that should be admin.
2. **Firestore** → **users** → document id = that UID → set field **`role`** to string **`admin`** (add other fields to match `UserProfileDoc` if the doc is missing: `displayName`, `emailLower`, `createdAt`, `updatedAt` as timestamps).

Alternatively: sign up once, then edit the new `users/{uid}` document in Firestore and change `role` to `admin`.

### Data model (quick reference)

| Collection | Purpose |
|------------|---------|
| `users/{uid}` | `displayName`, `emailLower`, `role` (`admin` \| `worker`), timestamps |
| `projects/demo-project/tasks/{taskId}` | Task: `publishedByUid`, `assigneeUid`, `dueAt`, `completedAt`, `completedByUid`, status, priority, times, etc. |

Types: `apps/web/src/lib/user-model.ts`, `apps/web/src/lib/task-model.ts`.

### Run the web app

```bash
cd apps/web
npm install
npm run dev
```

Open [http://localhost:3000/tasks](http://localhost:3000/tasks): sign in, publish tasks (admin), assign workers, mark done (worker).

### Local emulators (optional)

```bash
firebase emulators:start --only firestore,auth
```

In `apps/web/.env.local` set `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true` (Firestore `127.0.0.1:8080`, Auth `127.0.0.1:9099` per `firebase.ts`).

### API stub (FastAPI)

```bash
cd apps/api
python -m venv .venv
.\.venv\Scripts\activate   # Windows; on macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Then open [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health).

---

# Tech Stack

## Frontend
- Next.js
- TailwindCSS
- shadcn/ui

## Backend
- FastAPI
- PostgreSQL
- Redis
- SQLAlchemy
- Alembic

## AI Layer
- Google Gemini API (planning chat via `apps/api`)
- OpenAI API (roadmap / other services as the product grows)

## Infrastructure
- Docker
- GitHub Actions
- VPS / Cloud Deployment

---

# Vision

letAIcook aims to become an AI technical project orchestrator capable of:
- understanding engineering workflows
- coordinating teams
- automating sprint planning
- orchestrating deployments
- improving engineering execution

---

# License

MIT
