# letAIcook — AI & builder instructions (canonical)

**This file is the single source of truth for how we extend the codebase.**  
Before writing, editing, or reviewing code—whether you are a human or an AI assistant—you **must** read this document and align your work with it. If something here conflicts with chat history, an older doc, or a suggestion from an AI, **this file wins** until the product owner updates it.

---

## 1. Product we are building

We are building a **web application** that helps teams **manage work while designing and building a project** end-to-end.

- **Admins** can **create and assign tasks** to people on the team (send work, set expectations).
- **Workers** (employees, teammates, contractors) **execute tasks** and **mark them complete / notify completion** so admins and the team see progress in one place.
- The app should support **visibility of project status** so the build stays coordinated from planning through delivery.

**Primary data & hosting goal:** use **Firebase** (Firestore for tasks and related data, and Firebase-backed hosting/deployment for the web app) with the **project owner’s Firebase account**. Do not introduce a second database or hosting story for core tasks unless the product owner explicitly changes this document.

---

## 2. Roles (must shape data model, UI, and security)

| Role | Capabilities (intent) |
|------|------------------------|
| **Admin** | Manage projects; create, edit, assign, and prioritize tasks; see all team activity relevant to the project; reopen or reject work if needed. |
| **Worker** | See **assigned** (or relevant) tasks; update progress; **complete tasks** and surface **completion / notifications** to admins and the team. |

**Rule:** Any feature that touches permissions must eventually map to **Firebase Auth** + **Firestore security rules**. Until Auth is fully wired, do not assume “open rules” are acceptable for production—call that out in PRs and in this file when tightening rules.

---

## 3. Technical anchors (do not drift silently)

These are the current repo conventions. If you change them, **update this file** in the same change.

| Area | Convention |
|------|------------|
| **Web UI** | Next.js in `apps/web` (App Router, TypeScript). |
| **Backend stub** | FastAPI in `apps/api` for logic that must **not** run in the browser (secrets, privileged APIs, webhooks). |
| **Users in Firestore** | Profiles under `users/{uid}` with `role`: `admin` \| `worker` (see `user-model.ts`). Tied to Firebase Auth uid. |
| **Tasks in Firestore** | Documents under `projects/{projectId}/tasks/{taskId}`. Demo project id: `DEMO_PROJECT_ID` in `task-model.ts`. |
| **Task fields** | `task-model.ts`: includes `publishedByUid`, `assigneeUid`, `dueAt`, `completedAt`, `completedByUid`, status, priority, times, `jiraIssueKey`. **Change types, UI, and `firebase/firestore.rules` together.** |
| **Firebase config (web)** | `apps/web/.env.local` — copy from `apps/web/firebase.web.env.sample`. Never commit secrets. |
| **Firestore rules** | `firebase/firestore.rules` + `firebase.json` at repo root. |
| **Product / UML docs** | `Plan/` — use for roadmap and domain language; **implementation must still match this instruction file.** |

---

## 4. Security & secrets (non-negotiable)

- **Never** commit Firebase service account JSON, Jira API tokens, or private keys.
- **Client-side code** may only use the **public** Firebase web config (`NEXT_PUBLIC_*`). Anything privileged belongs in `apps/api`, **Cloud Functions**, or another server environment with secrets in env vars / secret manager.
- When adding collections or fields, **update Firestore rules** so admins and workers only read/write what their role allows.

---

## 5. Workflow for AI assistants (follow on every request)

When the user asks to add or change something:

1. **Read this file first** (and `Plan/` if the change affects domain or architecture).
2. **Restate** how the request maps to admin/worker flows and Firebase (one short paragraph).
3. **Implement the smallest change** that satisfies the request; match existing patterns in `apps/web` and `apps/api`.
4. **If you touch Firestore shape or paths**, update `task-model.ts` (or equivalent), any affected UI, and `firebase/firestore.rules` in a consistent way.
5. **Verify** before considering the task done:
   - `apps/web`: `npm run lint` and `npm run build` when TS/React changed.
   - `apps/api`: run or at least import-check if Python changed.
6. **Document** new env vars or setup steps in `README.md` **or** in this file’s “Changelog / setup notes” section below.

If instructions are ambiguous, **ask** rather than inventing product behavior.

---

## 6. Instructions for human builders (and their AI tools)

### Quick start (teammates)

1. Clone the repo and read this file plus the root **`README.md`**.
2. Create **`apps/web/.env.local`** from **`apps/web/firebase.web.env.sample`** (fill `NEXT_PUBLIC_*` from the Firebase console). That file is **gitignored** — do not commit it or paste keys into issues/PRs.
3. Run locally either **`docker compose up --build`** from the repo root (see README *Docker*) or **`cd apps/web && npm install && npm run dev`** (see README *Run the web app*). Tasks UI: **`/tasks`**.

### Builder checklist

- **Before** you let an AI generate or modify code, open or attach **`AI_PROJECT_INSTRUCTIONS.md`** and require the model to **acknowledge** that it read and will follow it.
- **Review every AI-generated diff** for: correct Firestore paths, rules, role boundaries, and absence of leaked secrets.
- **Cursor:** this repo includes **`.cursor/rules/`** so assistants are reminded to follow this document; keep that rule enabled.
- If someone’s AI “skipped” this file, **treat the output as unsafe** until reconciled with these instructions.

---

## 7. Changelog / setup notes

| Date | Note |
|------|------|
| (initial) | Tasks demo at `/tasks`; Firebase web SDK + Firestore; demo rules are permissive—replace with Auth-scoped rules before production. |
| 2026-05-09 | `/tasks` uses **Firebase Auth** (email/password) + role-based **Firestore rules**. Profiles in `users/{uid}` (`admin` \| `worker`); tasks in `projects/demo-project/tasks` with `publishedByUid`, `assigneeUid`, `dueAt`, `completedAt`, `completedByUid`. First admin is promoted manually in Console (see README). |
| 2026-05-09 | **Docker:** root `docker-compose.yml` runs `apps/web` (Next.js) and `apps/api` (FastAPI) for local dev; teammates need `apps/web/.env.local` + Docker. See README “Docker (team development)”. |
| 2026-05-09 | **Quick start:** Section 6 now lists clone → `.env.local` → Docker or `npm run dev`; root `.gitignore` covers `.env.*` and common service-account filename patterns. |
| 2026-05-10 | **`/chat`:** Next.js planning chat → FastAPI `POST /chat/plan` (Gemini / Google AI Studio). Secrets: `GOOGLE_API_KEY` or `GEMINI_API_KEY` in `apps/api` only; optional `GEMINI_MODEL`, `GEMINI_MODEL_FALLBACKS`, `NEXT_PUBLIC_API_BASE_URL`. Default model `gemini-2.5-flash-lite` (not deprecated `gemini-2.0-flash`). See README “AI planning chat”. |
| 2026-05-10 | **UI:** Dark theme (black + green); `AuthProvider` in root layout; `/login` → default `/chat`; `/chat` and `/tasks` use shared sidebar shell; task board auth form removed (sign in on `/login`). |

*(Append a one-line note here whenever this file or Firebase setup changes materially.)*

---

## 8. License / ownership

Project license per root `README.md`. This instruction file is part of the repo and should be kept accurate as the product evolves.
