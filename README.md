
# letAIcook

AI-powered engineering execution and Jira coordination platform.

**Contributors & AI assistants:** read [`AI_PROJECT_INSTRUCTIONS.md`](./AI_PROJECT_INSTRUCTIONS.md) before changing code. It defines product goals (admin vs worker tasks, Firebase-first), security, and the workflow every change must follow.

### Teammates: run the app in three steps

1. **Clone** this repository.
2. **Configure Firebase for the web app:** copy [`apps/web/firebase.web.env.sample`](./apps/web/firebase.web.env.sample) to **`apps/web/.env.local`** and fill in the `NEXT_PUBLIC_*` values from the Firebase console. This file is listed in **`.gitignore`** — never commit it or put real keys in the repo.
3. **Start:** from the repo root run **`docker compose up --build`** (recommended; see [Docker (team development)](#docker-team-development)) *or* install Node.js, `cd apps/web`, `npm install`, `npm run dev`. Open [http://localhost:3000/tasks](http://localhost:3000/tasks) after the app is up.

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

**Current scaffold in this repo:** the **task board** and roles use **Firebase** (Firestore + Auth) per [`AI_PROJECT_INSTRUCTIONS.md`](./AI_PROJECT_INSTRUCTIONS.md). The FastAPI app is a stub today (`GET /health`); do not assume PostgreSQL/Redis are required to run the UI.

**Current repo layout (scaffold):** product docs live in `Plan/`. Runnable code starts under `apps/`:

- `apps/web` — Next.js UI (includes a **Firestore task board** demo at `/tasks`).
- `apps/api` — FastAPI stub (`GET /health`); orchestration services will grow here per the plan.
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

Source under `apps/web` and `apps/api` is **bind-mounted**; edits on the host reload inside the containers. `node_modules` for the web app lives in a Docker volume and is populated on first start via `npm ci`.

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

`docker-compose.yml` uses `env_file` with `required: false` for `apps/web/.env.local` (Compose **v2.24+**). If `docker compose` errors on a missing env file, create `apps/web/.env.local` from the sample first.

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
- OpenAI API

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
