const RETURN_KEY = "letaicook_auth_return";

function normalizeReturnPath(path: string | null | undefined): string | null {
  if (!path?.startsWith("/") || path.startsWith("//")) return null;
  if (path === "/login" || path.startsWith("/login?")) return null;
  return path;
}

/** Persist return path before Google sign-in (redirect flow may drop query params). */
export function stashAuthReturnUrl(returnUrl: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(RETURN_KEY, normalizeReturnPath(returnUrl) ?? "/chat");
}

export function readAuthReturnUrl(searchReturnUrl: string | null): string {
  return (
    normalizeReturnPath(searchReturnUrl) ??
    (typeof window !== "undefined"
      ? normalizeReturnPath(sessionStorage.getItem(RETURN_KEY))
      : null) ??
    "/chat"
  );
}

export function clearAuthReturnUrl(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(RETURN_KEY);
}
