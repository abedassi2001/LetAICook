# letAIcook — Architecture & UML (as implemented)

**Canonical product rules:** [`AI_PROJECT_INSTRUCTIONS.md`](../AI_PROJECT_INSTRUCTIONS.md)  
**This document:** describes how the **running codebase** is structured today (May 2026).  
Older notes in `letAIcook_Use_Cases_and_UML.md` reference PostgreSQL/Redis and are **not** current.

---

## 1. What the system does

letAIcook is a **coordination web app** for teams building software:

| Flow | Route | Primary storage | Server AI |
|------|--------|-----------------|-----------|
| Sign in | `/login` | Firebase Auth + `users/{uid}` | — |
| Planning chat | `/chat` | `sessionStorage` + `users/{uid}/planningChat/current` | `POST /chat/plan` → Gemini |
| System designer | `/system-designer` | `users/{uid}/systemDesigns/workspace` | `POST /design-project` → Gemini JSON |
| Task board | `/tasks` | `projects/{projectId}/tasks/{taskId}` | — (optional Jira via API proxy) |
| Settings | `/settings` | `users/{uid}` (Jira creds on profile) | `GET/POST /jira/*` |

**Roles:** `admin` (publish/assign all tasks) and `worker` (assigned tasks, complete work). Enforced in **Firestore security rules** + UI.

---

## 2. Deployment topology

```mermaid
flowchart TB
  subgraph Client["Browser"]
    Next["Next.js  apps/web"]
  end

  subgraph GoogleCloud["Google Cloud"]
    Auth["Firebase Auth"]
    FS["Cloud Firestore"]
    Host["Firebase Hosting<br/>(optional)"]
    CR["Cloud Run<br/>apps/api FastAPI"]
  end

  subgraph External["External APIs"]
    Gemini["Google Gemini API<br/>GOOGLE_API_KEY on API only"]
    Jira["Atlassian Jira Cloud REST"]
  end

  subgraph LocalOnly["Optional — not in Docker API image"]
    Script["scripts/evening_task_reminder.py<br/>Firebase Admin SDK"]
  end

  Next -->|"Firebase Web SDK<br/>NEXT_PUBLIC_*"| Auth
  Next --> FS
  Next -->|"fetch getPublicApiBaseUrl()"| CR
  Next -.->|"rewrite /__letaicook_api/*<br/>LETAICOOK_API_PROXY_TARGET"| CR
  Host --> Next
  CR --> Gemini
  CR --> Jira
  Script --> FS

  style Gemini fill:#1a3a1a,stroke:#4ade80
  style FS fill:#1a2a3a,stroke:#60a5fa
```

**Local dev:** `docker compose` runs **web** (`:3000`) and **api** (`:8000`) with bind mounts.  
**Production:** Firebase Hosting (web) + Cloud Run (API) — see [`deploy/README.md`](../deploy/README.md).

There is **no PostgreSQL or Redis** in this repository.

---

## 3. Repository component map

```mermaid
flowchart LR
  subgraph apps_web["apps/web — Next.js App Router"]
    Routes["app/<br/>login, chat, system-designer, tasks, settings"]
    Ctx["contexts/auth-context"]
    Lib["lib/<br/>firebase, api-base, *-model, planning-sync, jira-client"]
    Comp["components/<br/>app-shell, system-design/*, require-auth"]
    Routes --> Ctx
    Routes --> Lib
    Routes --> Comp
  end

  subgraph apps_api["apps/api — FastAPI"]
    Main["main.py → letaicook_api.main:app"]
    RHealth["routers/health"]
    RChat["routers/chat"]
    RDesign["routers/design"]
    RJira["routers/jira"]
    Svc["services/gemini_shared"]
    Main --> RHealth
    Main --> RChat
    Main --> RDesign
    Main --> RJira
    RChat --> Svc
    RDesign --> Svc
  end

  subgraph firebase_root["firebase/"]
    Rules["firestore.rules"]
  end

  subgraph scripts_dir["scripts/"]
    Reminder["evening_task_reminder.py"]
  end

  apps_web --> Rules
  apps_web --> apps_api
  Reminder --> firebase_root
```

---

## 4. Actors & use cases (implemented)

```mermaid
flowchart TB
  Admin((Admin))
  Worker((Worker))
  Gemini((Gemini API))
  JiraSys((Jira Cloud))

  subgraph UC["Primary use cases"]
    UC1[Plan project scope via AI chat]
    UC2[Generate architecture JSON]
    UC3[Publish & assign tasks]
    UC4[Execute & complete assigned tasks]
    UC5[Sync tasks with Jira issues]
    UC6[Configure Jira credentials]
  end

  Admin --> UC1
  Admin --> UC2
  Admin --> UC3
  Admin --> UC5
  Admin --> UC6
  Worker --> UC1
  Worker --> UC2
  Worker --> UC4
  Worker --> UC6

  UC1 --> Gemini
  UC2 --> Gemini
  UC5 --> JiraSys
  UC6 --> JiraSys
```

---

## 5. Firestore data model (class diagram)

Paths and types are defined in `apps/web/src/lib/*-model.ts` and enforced by `firebase/firestore.rules`.

```mermaid
classDiagram
  direction TB

  class UserProfileDoc {
    +string displayName
    +UserRole role
    +string emailLower
    +Timestamp createdAt
    +Timestamp updatedAt
    +string jiraDomain
    +string jiraEmail
    +string jiraApiToken
    +string jiraDefaultProject
    +string teamId
  }

  class PlanningChatFirestoreDoc {
    +string ownerUid
    +PlanningChatMessage[] messages
    +Timestamp updatedAt
  }

  class PlanningChatMessage {
    +user | assistant role
    +string content
  }

  class SystemDesignWorkspaceDoc {
    +string ownerUid
    +string descriptionDraft
    +SystemDesignRawSnapshot latest
    +SystemDesignVersion[] versions
    +Timestamp updatedAt
  }

  class SystemDesignVersion {
    +number version
    +Timestamp createdAt
    +snapshot snapshot
    +string note
  }

  class TaskDoc {
    +string title
    +string description
    +TaskStatus status
    +TaskPriority priority
    +string publishedByUid
    +string assigneeUid
    +Timestamp dueAt
    +Timestamp completedAt
    +string completedByUid
    +string jiraIssueKey
    +number timeEstimateMinutes
    +number timeSpentMinutes
  }

  UserProfileDoc "1" --> "0..*" TaskDoc : publishes / assigned
  UserProfileDoc "1" --> "1" PlanningChatFirestoreDoc : planningChat/current
  UserProfileDoc "1" --> "1" SystemDesignWorkspaceDoc : systemDesigns/workspace
  SystemDesignWorkspaceDoc "1" *-- "0..*" SystemDesignVersion
  PlanningChatFirestoreDoc "1" *-- "1..*" PlanningChatMessage
```

**Collection paths:**

| Path | Document id | Type source |
|------|-------------|-------------|
| `users/{uid}` | Auth uid | `user-model.ts` |
| `users/{uid}/planningChat/{docId}` | `current` | `planning-chat-model.ts` |
| `users/{uid}/systemDesigns/{docId}` | `workspace` | `system-design-model.ts` |
| `projects/{projectId}/tasks/{taskId}` | auto | `task-model.ts` (`DEMO_PROJECT_ID = demo-project`) |

---

## 6. Security rules (who can read/write)

```mermaid
flowchart TD
  A[Request with Firebase Auth token] --> B{Signed in?}
  B -->|no| DENY[Deny]
  B -->|yes| C{Resource path}

  C -->|users/uid| D{uid == auth.uid or admin?}
  D -->|read profile| OK
  D -->|create own profile| OK role worker or admin
  D -->|update| OK if admin OR own uid

  C -->|users/uid/planningChat/*| E{uid == auth.uid?}
  E -->|yes| OK

  C -->|users/uid/systemDesigns/*| E

  C -->|projects/*/tasks/*| F{admin?}
  F -->|yes| FULL[create read update delete]
  F -->|no worker| G{assigneeUid == auth.uid?}
  G -->|read update| OK
  G -->|create self-assigned| OK if publishedByUid also self
```

Server-side **Jira** and **Gemini** calls bypass Firestore rules (API holds secrets). The evening reminder script uses **Admin SDK** and is intended for a trusted machine only.

---

## 7. Authentication & profile lifecycle

```mermaid
sequenceDiagram
  actor User
  participant Login as /login AuthForm
  participant Auth as Firebase Auth
  participant FS as Firestore users/uid
  participant Ctx as AuthProvider

  User->>Login: email + password
  alt Sign up
    Login->>Auth: createUserWithEmailAndPassword
    Login->>FS: setDoc role worker default
  else Sign in
    Login->>Auth: signInWithEmailAndPassword
  end
  Auth-->>Ctx: onAuthStateChanged user
  Ctx->>FS: onSnapshot users/uid
  FS-->>Ctx: UserProfileDoc role admin or worker
  Ctx-->>User: profile drives TasksBoard isAdmin
```

First **admin** is promoted manually in Firebase Console (`role: admin` on `users/{uid}`).

---

## 8. Planning chat flow (`/chat`)

```mermaid
sequenceDiagram
  actor User
  participant UI as PlanningChat
  participant SS as sessionStorage
  participant FS as Firestore planningChat/current
  participant API as FastAPI /chat/plan
  participant G as Gemini

  User->>UI: open /chat
  UI->>SS: read messages savedAt ownerUid
  opt signed in
    UI->>FS: getDoc
    Note over UI,FS: Pick newer of session vs Firestore by updatedAt
  end
  UI-->>User: show conversation

  User->>UI: send message
  UI->>SS: write context description savedAt
  UI->>UI: dispatch PLANNING_SYNC_EVENT
  UI->>API: POST messages history
  API->>G: GenerativeModel + system prompt
  G-->>API: assistant text
  API-->>UI: ChatPlanResponse.message
  UI->>SS: append assistant message
  opt signed in debounce 800ms
    UI->>FS: setDoc messages updatedAt
  end
```

**Handoff to designer:** `planning-sync.ts` builds `letaicook_planning_project_description` from **user** messages only; full thread is in `letaicook_planning_context`.

---

## 9. Planning → System Designer handoff

```mermaid
sequenceDiagram
  participant Chat as /chat PlanningChat
  participant SS as sessionStorage
  participant Designer as SystemDesignerClient
  participant FS as systemDesigns/workspace

  Chat->>SS: PLANNING_PROJECT_DESCRIPTION_KEY
  Chat->>SS: PLANNING_CONTEXT_KEY
  Chat->>Chat: PLANNING_SYNC_EVENT

  Designer->>SS: readPlanningProjectDescription on load
  Designer->>SS: readPlanningContext for API context_messages
  Note over Designer: Auto-fill description until user edits box
  Designer->>Designer: listen PLANNING_SYNC_EVENT while focused=false

  opt user signed in
    Designer->>FS: onSnapshot workspace descriptionDraft latest versions
  end
```

---

## 10. System designer generation (`/system-designer`)

```mermaid
sequenceDiagram
  actor User
  participant UI as SystemDesignerClient
  participant Norm as parseDesignJson normalize
  participant API as POST /design-project
  participant G as Gemini JSON mode
  participant FS as systemDesigns/workspace
  participant Views as Mermaid ReactFlow tables export

  User->>UI: Generate from description
  UI->>API: description + context_messages optional previous_design
  API->>G: DESIGN_JSON_INSTRUCTIONS
  G-->>API: JSON string
  API->>API: DesignProjectResponse.validate
  API-->>UI: structured design
  UI->>Norm: blueprint for tabs
  UI->>Views: architecture services database apis pages tasks diagrams
  UI->>FS: merge latest append version debounced save

  opt extras
    User->>UI: Jira backlog or pitch
    UI->>API: POST /design-project/jira-tasks or /pitch
    API->>G: markdown
  end
```

**UI tabs:** overview, architecture, services, database, apis, pages, tasks, diagrams.  
**Exports:** PNG / JSON / Markdown via `export-toolbar.tsx`.

---

## 11. Task board flow (`/tasks`)

```mermaid
sequenceDiagram
  actor Admin
  actor Worker
  participant Board as TasksBoard
  participant FS as projects/teamId/tasks
  participant JiraAPI as FastAPI /jira/*
  participant Jira as Jira Cloud

  Board->>FS: onSnapshot query by role
  Note over Board,FS: Admin all tasks Worker assigneeUid == uid

  Admin->>Board: create task assign worker set due
  Board->>FS: addDoc TaskDoc
  opt Jira linked
    Board->>JiraAPI: POST /jira/issues X-Jira-* headers from profile
    JiraAPI->>Jira: REST create
    Jira-->>Board: issue_key stored jiraIssueKey
  end

  Worker->>Board: update status to done
  Board->>FS: updateDoc completedAt completedByUid
  opt jiraIssueKey set
    Board->>JiraAPI: sync-status or transition
  end

  Admin->>Board: import from Jira project
  Board->>JiraAPI: GET /jira/projects/key/issues
  loop new keys
    Board->>FS: addDoc imported tasks
  end
```

**Status values:** `todo` | `in_progress` | `review` | `done` | `blocked`.  
**Team id:** `profile.teamId` or `DEMO_PROJECT_ID`.

---

## 12. FastAPI surface (all routes)

```mermaid
classDiagram
  class FastAPIApp {
    +GET /health
  }
  class ChatRouter {
    +POST /chat/plan
  }
  class DesignRouter {
    +POST /design-project
    +POST /design-project/jira-tasks
    +POST /design-project/pitch
  }
  class JiraRouter {
    +GET /jira/config
    +POST /jira/config/test
    +GET /jira/projects
    +GET /jira/projects/{key}/issues
    +POST /jira/issues
    +GET /jira/issues/{key}
    +PUT /jira/issues/{key}
    +DELETE /jira/issues/{key}
    +POST /jira/issues/{key}/transition
    +POST /jira/issues/{key}/sync-status
    +POST /jira/issues/batch
  }
  class GeminiShared {
    +google_api_key()
    +plan_model_candidates()
    +generate_content_with_fallback()
  }

  FastAPIApp --> ChatRouter
  FastAPIApp --> DesignRouter
  FastAPIApp --> JiraRouter
  ChatRouter --> GeminiShared
  DesignRouter --> GeminiShared
```

**Jira credentials:** per-request headers `X-Jira-Domain`, `X-Jira-Email`, `X-Jira-Token`, `X-Jira-Project` (from user profile via `jira-client.ts`) or server env fallbacks.

---

## 13. Web app navigation & guards

```mermaid
flowchart TD
  Root["/"] --> Landing[LandingPage or redirect]
  Login["/login"] --> AuthForm
  Chat["/chat"] --> RequireAuth
  Designer["/system-designer"] --> RequireAuth
  Tasks["/tasks"] --> RequireAuth
  Settings["/settings"] --> RequireAuth

  RequireAuth --> AppShell
  AppShell --> Sidebar["nav: Planning Designer Tasks Settings"]
  AppShell --> PageContent[route page component]

  AuthForm -->|success default| Chat
```

`AppProviders` wraps the tree with `AuthProvider` (`layout.tsx`).

---

## 14. API base URL resolution (browser → FastAPI)

```mermaid
flowchart TD
  Start[getPublicApiBaseUrl] --> E1{NEXT_PUBLIC_API_BASE_URL set?}
  E1 -->|yes| UseExplicit[use explicit URL]
  E1 -->|no| E2{NEXT_PUBLIC_USE_SAME_ORIGIN_API_PROXY?}
  E2 -->|yes| Proxy["origin + /__letaicook_api<br/>rewrite in next.config.ts"]
  E2 -->|no| E3{NEXT_PUBLIC_API_FOLLOW_WEB_HOST?}
  E3 -->|yes| LAN["same hostname port 8000"]
  E3 -->|no| Local["http://localhost:8000"]
```

---

## 15. End-to-end “idea to tracked work” (combined)

```mermaid
flowchart LR
  A[User signs in] --> B[Planning chat /chat]
  B --> C[sessionStorage + Firestore chat doc]
  C --> D[System Designer /system-designer]
  D --> E[Gemini JSON blueprint]
  E --> F[Firestore workspace + versions]
  F --> G[Optional Jira backlog markdown]
  B --> D
  D --> H[Manual or AI-suggested tasks]
  H --> I[Tasks board /tasks Firestore]
  I --> J[Optional Jira issue sync]
  I --> K[Worker completes + notifications via UI]
```

---

## 16. Key files reference

| Concern | Location |
|---------|----------|
| Product contract | `AI_PROJECT_INSTRUCTIONS.md` |
| Web entry & providers | `apps/web/src/app/layout.tsx`, `components/app-providers.tsx` |
| Auth | `apps/web/src/contexts/auth-context.tsx`, `app/login/` |
| Planning UI | `apps/web/src/app/chat/planning-chat.tsx` |
| Designer UI | `apps/web/src/app/system-designer/system-designer-client.tsx` |
| Tasks UI | `apps/web/src/app/tasks/tasks-board.tsx` |
| Firestore rules | `firebase/firestore.rules` |
| API app factory | `apps/api/letaicook_api/main.py` |
| Gemini shared | `apps/api/letaicook_api/services/gemini_shared.py` |
| Design normalization | `apps/web/src/lib/system-design/normalize.ts` |
| Evening reminder | `scripts/evening_task_reminder.py` |

---

## 17. How to view these diagrams

- **GitHub / GitLab:** Mermaid blocks render in the markdown preview.
- **VS Code / Cursor:** Markdown preview with Mermaid support, or paste a diagram into [mermaid.live](https://mermaid.live).
- **Export:** use mermaid-cli or the live editor to produce PNG/SVG for slides.

---

*Generated to match the repository as of 2026-05-19. When architecture changes, update this file in the same PR as code.*
