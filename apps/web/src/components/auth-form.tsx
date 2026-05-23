"use client";

import { GlassCard } from "@/components/ui/glass-card";
import { useAuth } from "@/contexts/auth-context";
import { formatAuthError } from "@/lib/auth-errors";
import {
  clearAuthReturnUrl,
  readAuthReturnUrl,
  stashAuthReturnUrl,
} from "@/lib/auth-redirect";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

const inputClass = "app-input";
const MIN_PASSWORD_LEN = 6;

export function AuthForm() {
  const { signInEmail, signInGoogle, signUpEmail } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  function goAfterSignIn() {
    const dest = readAuthReturnUrl(searchParams.get("returnUrl"));
    clearAuthReturnUrl();
    router.replace(dest);
  }
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function switchMode(mode: "signin" | "signup") {
    setAuthMode(mode);
    setError(null);
    setPassword("");
    setConfirmPassword("");
  }

  async function handleGoogle() {
    setBusy(true);
    setError(null);
    try {
      stashAuthReturnUrl(readAuthReturnUrl(searchParams.get("returnUrl")));
      await signInGoogle();
      goAfterSignIn();
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (authMode === "signin") {
        await signInEmail(email, password);
        goAfterSignIn();
        return;
      }

      const name = displayName.trim();
      if (!name) {
        throw new Error("Enter your name.");
      }
      if (password.length < MIN_PASSWORD_LEN) {
        throw new Error(`Password must be at least ${MIN_PASSWORD_LEN} characters.`);
      }
      if (password !== confirmPassword) {
        throw new Error("Passwords do not match.");
      }

      await signUpEmail(email, password, name);
      goAfterSignIn();
      setPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <GlassCard strong className="w-full max-w-md space-y-5 p-6">
      <div className="flex gap-2 rounded-xl bg-app-bg/50 p-1 ring-1 ring-app-border/80">
        <button
          type="button"
          className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
            authMode === "signin"
              ? "bg-app-accent text-app-on-accent shadow-sm"
              : "text-app-muted hover:text-app-text"
          }`}
          onClick={() => switchMode("signin")}
        >
          Sign in
        </button>
        <button
          type="button"
          className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
            authMode === "signup"
              ? "bg-app-accent text-app-on-accent shadow-sm"
              : "text-app-muted hover:text-app-text"
          }`}
          onClick={() => switchMode("signup")}
        >
          Sign up
        </button>
      </div>

      <form className="space-y-4" onSubmit={(e) => void handleSubmit(e)}>
        {authMode === "signup" ? (
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-app-muted">Full name</span>
            <input
              className={inputClass}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoComplete="name"
              required
            />
          </label>
        ) : null}
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-app-muted">Email</span>
          <input
            type="email"
            className={inputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          {authMode === "signup" ? (
            <span className="text-xs text-app-muted">
              Use an address your team lead added on a project, or one your team already registered.
            </span>
          ) : null}
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-app-muted">Password</span>
          <input
            type="password"
            className={inputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={authMode === "signup" ? MIN_PASSWORD_LEN : undefined}
            autoComplete={authMode === "signin" ? "current-password" : "new-password"}
          />
        </label>
        {authMode === "signup" ? (
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-app-muted">Confirm password</span>
            <input
              type="password"
              className={inputClass}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={MIN_PASSWORD_LEN}
              autoComplete="new-password"
            />
          </label>
        ) : null}

        {error ? (
          <p className="rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-300">{error}</p>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          className="btn-primary w-full py-3"
        >
          {busy ? "Please wait…" : authMode === "signin" ? "Sign in" : "Create account"}
        </button>
      </form>

      {authMode === "signin" ? (
        <>
          <div className="relative">
            <div className="absolute inset-0 flex items-center" aria-hidden>
              <div className="w-full border-t border-app-border" />
            </div>
            <p className="relative flex justify-center text-xs uppercase tracking-wide text-app-muted">
              <span className="px-2">or</span>
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleGoogle()}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-app-border bg-app-bg px-4 py-3 text-sm font-medium text-app-text hover:border-app-accent disabled:opacity-50"
          >
            <span aria-hidden>G</span>
            Continue with Google
          </button>
        </>
      ) : null}
    </GlassCard>
  );
}
