/** User-facing Firebase Auth errors with deploy troubleshooting hints. */
export function formatAuthError(err: unknown): string {
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code: string }).code)
      : "";
  const message =
    err instanceof Error ? err.message : "Authentication failed";

  const deployHint =
    typeof window !== "undefined"
      ? ` Add “${window.location.hostname}” under Firebase Console → Authentication → Settings → Authorized domains, and under Google Cloud → APIs & Credentials → OAuth Web client → Authorized JavaScript origins (${window.location.origin}).`
      : "";

  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
      return `Sign-in failed (wrong email/password, or Google is not allowed on this URL).${deployHint}`;
    case "auth/user-not-found":
      return "No account exists for this email. Sign up first, or check you are using the production Firebase project (not emulators).";
    case "auth/unauthorized-domain":
      return `This site URL is not authorized for Firebase Auth.${deployHint}`;
    case "auth/operation-not-allowed":
      return "This sign-in method is disabled. In Firebase Console → Authentication → Sign-in method, enable Email/Password and/or Google.";
    case "auth/popup-blocked":
      return "The sign-in popup was blocked. Allow popups for this site or try again.";
    case "auth/popup-closed-by-user":
      return "Sign-in was cancelled.";
    default:
      return message.includes("Firebase:")
        ? message
        : `Firebase: ${message}`;
  }
}

/**
 * Google sign-in via full-page redirect often loses the session on Cloud Run (*.run.app)
 * because auth completes on firebaseapp.com and third-party storage is blocked.
 * Popup keeps the user on your origin and is more reliable when OAuth origins are configured.
 */
export function shouldUseGoogleRedirect(): boolean {
  return false;
}
