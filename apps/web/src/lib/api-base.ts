/**
 * Base URL for browser → FastAPI (no trailing slash).
 *
 * **Firebase** (Auth + Firestore) always uses the project from `NEXT_PUBLIC_FIREBASE_*`
 * in `.env.local`. That is Google’s cloud unless you set
 * `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true` (local emulators).
 *
 * **This helper is only for the FastAPI base URL** (`/chat/plan`, `/design-project`, …).
 *
 * Resolution order:
 * 1. `NEXT_PUBLIC_API_BASE_URL` — set this in production to your public API origin
 *    (e.g. `https://api.yourdomain.com`).
 * 2. `NEXT_PUBLIC_USE_SAME_ORIGIN_API_PROXY=true` — use `/__letaicook_api` on the same
 *    host as the web app. Requires `LETAICOOK_API_PROXY_TARGET` at **Next build time**
 *    so `next.config` can register rewrites (see root README).
 * 3. `NEXT_PUBLIC_API_FOLLOW_WEB_HOST=true` — same hostname as the page, port
 *    `NEXT_PUBLIC_API_PORT` (default `8000`). Use when you open the app at
 *    `http://192.168.x.x:3000` so calls go to `http://192.168.x.x:8000` instead of
 *    `localhost` (SSR falls back to `http://localhost:8000` until the client runs).
 * 4. Default: `http://localhost:8000`.
 */
export function getPublicApiBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_API_BASE_URL?.trim().replace(/\/$/, "");
  if (explicit) return explicit;

  if (process.env.NEXT_PUBLIC_USE_SAME_ORIGIN_API_PROXY === "true") {
    const origin = getPublicWebOrigin();
    return origin ? `${origin}/__letaicook_api` : "http://localhost:8000";
  }

  if (process.env.NEXT_PUBLIC_API_FOLLOW_WEB_HOST === "true") {
    const lan = inferApiBaseFromWebHost();
    if (lan) return lan.replace(/\/$/, "");
  }

  return "http://localhost:8000";
}

function getPublicWebOrigin(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel}`;
  return "";
}

function inferApiBaseFromWebHost(): string | null {
  if (typeof window === "undefined" || !window.location?.hostname) return null;
  const port = (process.env.NEXT_PUBLIC_API_PORT || "8000").trim();
  const { protocol, hostname } = window.location;
  if (!hostname) return null;
  return `${protocol}//${hostname}:${port}`;
}
