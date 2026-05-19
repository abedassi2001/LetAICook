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

1. Builds and deploys **API** → Cloud Run  
2. Builds **web** with production env → **Firebase Hosting**

Add these **GitHub repository secrets**:

| Secret | Purpose |
|--------|---------|
| `GCP_PROJECT_ID` | e.g. `letaicook` |
| `GCP_SA_KEY` | Service account JSON (roles: Cloud Run Admin, Artifact Registry Writer, Firebase Hosting Admin) |
| `GOOGLE_API_KEY` | Gemini key for API |
| `FIREBASE_TOKEN` | From `firebase login:ci` |
| `FIREBASE_WEB_API_KEY` | Web SDK apiKey |
| `FIREBASE_AUTH_DOMAIN` | authDomain |
| `FIREBASE_PROJECT_ID` | projectId |
| `FIREBASE_STORAGE_BUCKET` | storageBucket |
| `FIREBASE_MESSAGING_SENDER_ID` | messagingSenderId |
| `FIREBASE_APP_ID` | appId |

Optional variable: `GCP_REGION` (default `us-central1`).

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
