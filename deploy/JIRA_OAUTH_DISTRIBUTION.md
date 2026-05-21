# Jira OAuth: “You don’t have access to this app” (production)

## What users see

On **deployed** letAIcook, **Connect Jira** opens Atlassian and shows:

> **You don't have access to this app.**  
> This application is in development — only the owner of this application may grant it access to their account.

**Localhost often works** because the person testing is the **owner** of the OAuth app in the [Atlassian Developer Console](https://developer.atlassian.com/console/myapps/).

This is **not** a Cloud Run bug. The same `ATLASSIAN_CLIENT_ID` is used everywhere; Atlassian restricts who may authorize while the app is in **development**.

## Fix (deployment owner — one-time)

1. Open [Atlassian Developer Console](https://developer.atlassian.com/console/myapps/) → select your **OAuth 2.0 (3LO)** app (the one whose Client ID is in `ATLASSIAN_CLIENT_ID`).

2. Confirm **Callback URL** includes production **exactly**:
   ```
   https://letaicook-api-6dyzc2mqrq-uc.a.run.app/jira/oauth/callback
   ```
   (Use your real API URL from Cloud Run if different.)

3. Open **Distribution** (or **Settings → Distribution** / **Authorization → Distribution**, depending on Console UI).

4. Choose one path:

   ### Option A — Team in development (fastest)

   - **Enable distribution** / share the app for testing.
   - Under **Test users** (or **Allowed users**), add each teammate’s **Atlassian account email** (the email they use to log into `id.atlassian.com` / Jira).
   - Each added user can click **Connect Jira** on production after saving.

   ### Option B — Everyone in your org / public

   - Complete Atlassian’s **publish** / **marketplace** / **distribution** flow for your app type so any user can authorize (required for customers outside your test list).

5. Save. Wait a minute, then have the user try **Connect Jira** again (use a normal browser window, not an old tab).

## Verify production env (already set if Connect works for the owner)

In `deploy/cloudrun-env.yaml` (applied with `set-cloudrun-env.ps1`):

| Variable | Must match |
|----------|------------|
| `ATLASSIAN_REDIRECT_URI` | `https://<API>/jira/oauth/callback` |
| `FRONTEND_BASE_URL` | `https://<web>/` Cloud Run URL |

## Still failing?

| Symptom | Check |
|---------|--------|
| Owner works, others don’t | Distribution / test users (this doc) |
| Nobody works on production | Callback URL mismatch vs `ATLASSIAN_REDIRECT_URI` |
| Error after redirect back to Settings | API logs / `reason=` in URL (`jira_oauth_*` codes) |

See also [`deploy/README.md`](./README.md) — Jira Cloud OAuth section.
