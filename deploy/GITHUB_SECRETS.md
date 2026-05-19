# GitHub Actions secrets for CI deploy

Open: **https://github.com/abedassi2001/LetAICook/settings/secrets/actions**

Click **New repository secret** for each row. Use the **Name** column exactly (no spaces, no `=`).

## Required (copy from `apps/web/.env.production.local`)

| GitHub secret **Name** | Copy **Value** from this line in `.env.production.local` |
|------------------------|----------------------------------------------------------|
| `FIREBASE_WEB_API_KEY` | line `NEXT_PUBLIC_FIREBASE_API_KEY=` → paste only the part **after** `=` |
| `FIREBASE_MESSAGING_SENDER_ID` | line `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=` → value after `=` |
| `FIREBASE_APP_ID` | line `NEXT_PUBLIC_FIREBASE_APP_ID=` → value after `=` |

Also required (you likely already have these):

| Name | Example |
|------|---------|
| `GCP_PROJECT_ID` | `letaicook` |
| `GCP_SA_KEY` | full JSON of `github-deploy` service account |
| `GOOGLE_API_KEY` | Gemini API key |

## Optional

CI defaults these from `GCP_PROJECT_ID` if you omit them:

- `FIREBASE_AUTH_DOMAIN` → `letaicook.firebaseapp.com`
- `FIREBASE_PROJECT_ID` → `letaicook`
- `FIREBASE_STORAGE_BUCKET` → `letaicook.firebasestorage.app`

## Alternate names (also accepted)

If you already created secrets with `NEXT_PUBLIC_` in the name, CI accepts:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

## Common mistakes

- Putting `NEXT_PUBLIC_FIREBASE_API_KEY=AIza...` in the **Name** field — wrong. Name must be `FIREBASE_WEB_API_KEY`, value is only `AIza...`.
- Using **Environment secrets** instead of **Repository secrets** — use repository secrets unless you configured environments.
- Secrets on a **fork** — use secrets on the repo that runs Actions (`abedassi2001/LetAICook`).

After saving all three Firebase secrets, **Actions** → failed run → **Re-run all jobs**.
