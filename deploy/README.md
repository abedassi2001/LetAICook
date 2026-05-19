# Deploy letAIcook to Firebase + Google Cloud

Customers open the **Cloud Run web** URL. Auth and tasks use **Firestore** (Firebase project). **Gemini + Jira** run on **Cloud Run** (FastAPI).

| Piece | Service | Public URL |
|-------|---------|------------|
| Web (Next.js) | Cloud Run (`letaicook-web`) | `https://letaicook-web-….run.app` |
| API (FastAPI) | Cloud Run (`letaicook-api`) | `https://letaicook-api-….run.app` |
| Database / login | Firebase Auth + Firestore | same Firebase project |

**CI:** push to `main` runs [`.github/workflows/deploy-firebase.yml`](../.github/workflows/deploy-firebase.yml) (API + web on Cloud Run, Firestore rules). `FIREBASE_TOKEN` is not required.

---

## One-time setup

### 1. Tools

- [Firebase CLI](https://firebase.google.com/docs/cli): `npm install -g firebase-tools`
- [Google Cloud SDK](https://cloud.google.com/sdk/docs/install): `gcloud`
- Log in: `firebase login` and `gcloud auth login`

### 2. Firebase project

Use the project in `.firebaserc` (default: `letaicook`). In [Firebase Console](https://console.firebase.google.com):

1. **Authentication** → enable Email/Password.
2. **Firestore** → create database (production mode).
3. **Project settings** → Web app → copy `NEXT_PUBLIC_FIREBASE_*` values.

### 3. Enable GCP APIs

```bash
gcloud config set project letaicook
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com firebasehosting.googleapis.com
```

### 4. Artifact Registry (Docker images for API)

```bash
gcloud artifacts repositories create letaicook \
  --repository-format=docker \
  --location=us-central1
```

---

## First deploy (manual)

### Step A — Deploy API to Cloud Run

From repo root (PowerShell):

```powershell
.\scripts\deploy-api-cloudrun.ps1 -ProjectId letaicook -Region us-central1
```

Or bash:

```bash
./scripts/deploy-api-cloudrun.sh letaicook us-central1
```

Set secrets with an env file (required on Windows — `CORS_ORIGINS` contains commas):

```powershell
copy deploy\cloudrun-env.sample.yaml deploy\cloudrun-env.yaml
# Edit deploy\cloudrun-env.yaml — add GOOGLE_API_KEY from https://aistudio.google.com/apikey
.\scripts\set-cloudrun-env.ps1
```

Note the **API URL** printed at the end (e.g. `https://letaicook-api-xxxxx-uc.a.run.app`).

#### Jira Cloud OAuth (one shared app for all users)

End users only click **Connect Jira** in Settings. They never enter `ATLASSIAN_CLIENT_ID`, client secrets, or API tokens.

**Deployment owner** (API service only — Cloud Run env or `apps/api/.env.local` for local dev):

| Variable | Example | Purpose |
|----------|---------|---------|
| `ATLASSIAN_CLIENT_ID` | From [Atlassian Developer Console](https://developer.atlassian.com/console/myapps/) | OAuth 2.0 (3LO) client id |
| `ATLASSIAN_CLIENT_SECRET` | Same app | Server-only; never in the web app |
| `ATLASSIAN_REDIRECT_URI` | `https://YOUR-API-URL/jira/oauth/callback` | Must match Console callback **exactly** |
| `FRONTEND_BASE_URL` | `https://letaicook.web.app` | Where users return after OAuth |
| `FIREBASE_PROJECT_ID` | `letaicook` | Verify Firebase ID tokens on API |

**Atlassian Console:** Authorization → OAuth 2.0 (3LO) → callback URL above; scopes `read:jira-work`, `write:jira-work`, `read:jira-user`, `offline_access`. For users outside your org, enable **distribution** (test users in dev; publish/allowlist in production).

Refresh tokens stay **server-side only** (see `JIRA_OAUTH_DATA_DIR` in `apps/api/api.env.sample`).

### Step B — Configure web env for production

Copy [`apps/web/production.env.sample`](../apps/web/production.env.sample) → `apps/web/.env.production.local` (gitignored) **or** set in Firebase Hosting build config:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=letaicook.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=letaicook
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=letaicook.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
NEXT_PUBLIC_API_BASE_URL=https://YOUR-CLOUD-RUN-URL
```

Do **not** set `NEXT_PUBLIC_USE_FIREBASE_EMULATOR` in production.

### Step C — Deploy Firestore rules + Hosting

```powershell
.\scripts\deploy-hosting.ps1 -ProjectId letaicook
```

This runs `prepare-hosting-deploy.ps1` (Cloud Run URL + Firebase vars from `.env.local`) then `firebase deploy`.

Your app is live at:

- **https://letaicook.web.app**
- **https://letaicook.firebaseapp.com**

Share either link with customers/teammates.

---

## Continuous deploy (GitHub Actions)

Workflow: [`.github/workflows/deploy-firebase.yml`](../.github/workflows/deploy-firebase.yml)

On every push to `main` (or manual **Run workflow**):

1. Builds and deploys **API** → Cloud Run (`letaicook-api`)
2. Builds and deploys **web** → Cloud Run (`letaicook-web`), updates API CORS
3. Deploys **Firestore rules** (`firebase deploy --only firestore:rules`)

Add these **GitHub repository secrets**:

| Secret | Purpose |
|--------|---------|
| `GCP_PROJECT_ID` | e.g. `letaicook` |
| `GCP_SA_KEY` | JSON for **github-deploy** service account (see IAM below) |
| `GOOGLE_API_KEY` | Gemini key for API |
| `FIREBASE_WEB_API_KEY` | Firebase web **apiKey** (required) |
| `FIREBASE_MESSAGING_SENDER_ID` | Firebase **messagingSenderId** (required) |
| `FIREBASE_APP_ID` | Firebase **appId** (required) |

Optional (CI defaults from `GCP_PROJECT_ID` if omitted): `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_STORAGE_BUCKET`.

Copy the three required values from [Firebase Console](https://console.firebase.google.com) → Project settings → Your apps → Web app config, or from `apps/web/.env.production.local` (see [GITHUB_SECRETS.md](./GITHUB_SECRETS.md)).

Optional variables: `GCP_REGION` (default `us-central1`), `CLOUD_RUN_SERVICE`, `CLOUD_RUN_WEB_SERVICE`.

### IAM for `github-deploy` (fixes CI `403` on Firestore rules)

In [Google Cloud Console → IAM](https://console.cloud.google.com/iam-admin/iam), grant the **github-deploy@…** service account (the one in `GCP_SA_KEY`):

| Role | Why |
|------|-----|
| **Cloud Run Admin** | Deploy API + web |
| **Artifact Registry Administrator** | Push Docker images |
| **Service Account User** | Act as runtime SA if needed |
| **Service Usage Admin** | Enable APIs in CI |
| **Firebase Rules Admin** (`roles/firebaserules.admin`) | `firebase deploy --only firestore:rules` (fixes `firebaserules.googleapis.com` 403) |

Or use **Firebase Admin** (`roles/firebase.admin`) instead of Rules Admin if you prefer one broader role.

PowerShell (replace email if your SA name differs):

```powershell
$Project = "letaicook"
$Sa = "github-deploy@${Project}.iam.gserviceaccount.com"
gcloud projects add-iam-policy-binding $Project --member="serviceAccount:$Sa" --role="roles/firebaserules.admin"
```

Re-run the failed GitHub Actions workflow after IAM propagates (~1–2 minutes).

### Chrome shows “This page couldn’t load” but Cloud Run looks healthy

The service can return **HTTP 200** while Chrome still fails (often **HTTP/3 / QUIC** or campus Wi‑Fi blocking UDP).

1. **Quick test** — open: `https://YOUR-WEB-URL/health`  
   Should show `{"ok":true,"service":"letaicook-web"}`.  
   If `/health` works but `/` does not, the issue is client-side (hydration/extensions), not Cloud Run.

2. **PowerShell** (same PC as Chrome):  
   `curl.exe -sI "https://YOUR-WEB-URL/"`  
   If you see `HTTP/1.1 200 OK`, the server is up; fix the browser/network below.

3. **Chrome** → `chrome://flags` → search **QUIC** → set **Experimental QUIC protocol** to **Disabled** → relaunch Chrome.

4. Try **phone hotspot** (bypass university firewall).

5. In Cloud Run, set **letaicook-web** → **Minimum instances = 1** (avoids cold-start timeouts). CI and `deploy-web-cloudrun.ps1` do this on the next deploy.

---

## Take production offline / bring it back

**Shutdown** (Hosting disabled + API not reachable from the internet):

```powershell
.\scripts\shutdown-production.ps1 -ProjectId letaicook
```

**Full redeploy** after fixes (env file, API, restore public ingress, web):

```powershell
# Ensure deploy\cloudrun-env.yaml exists with GOOGLE_API_KEY and CORS_ORIGINS
.\scripts\redeploy-production.ps1 -ProjectId letaicook
```

---

## Firebase App Hosting (Git auto-deploy)

Alternative: connect the repo in Firebase Console → **App Hosting** → import GitHub.

Use [`apps/web/apphosting.yaml`](../apps/web/apphosting.yaml) and define the same secrets in the App Hosting UI. Still deploy the API to Cloud Run separately and set `LETAICOOK_API_BASE_URL` secret to the Cloud Run URL.

---

## After deploy checklist

- [ ] Open `/login` on the `.web.app` URL and sign in  
- [ ] Planning chat calls API (check browser Network → `/chat/plan` → 200)  
- [ ] System designer generates JSON  
- [ ] Tasks board reads/writes Firestore  
- [ ] Add authorized domain in Firebase Auth if you use a custom domain  

---

## Custom domain

Firebase Console → Hosting → **Add custom domain** → follow DNS steps.  
Add the custom origin to Cloud Run `CORS_ORIGINS`.

---

## Local vs production

| | Local (`docker compose`) | Production |
|--|--------------------------|------------|
| Web | http://localhost:3000 | https://PROJECT.web.app |
| API | http://localhost:8000 | Cloud Run URL |
| Firebase | `.env.local` cloud or emulators | Cloud only |
