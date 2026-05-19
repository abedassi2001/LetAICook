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
  const [displayName, setDisplayName] = useState("");
  const [teamId, setTeamId] = useState("");
  const [isTeamLead, setIsTeamLead] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      } else {
        if (!teamId.trim()) {
          throw new Error("Team ID is required to create an account.");
        }
        await signUpEmail(email, password, displayName, teamId, isTeamLead ? "admin" : "worker");
      }
      setPassword("");
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
          onClick={() => setAuthMode("signin")}
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
          onClick={() => setAuthMode("signup")}
        >
          Sign up
        </button>
      </div>

      <form className="space-y-4" onSubmit={(e) => void handleSubmit(e)}>
        {authMode === "signup" ? (
          <>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-app-muted">Name</span>
              <input
                className={inputClass}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-app-muted">Team ID (Shared with your team)</span>
              <input
                className={inputClass}
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                placeholder="e.g. startup-x"
                required
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isTeamLead}
                onChange={(e) => setIsTeamLead(e.target.checked)}
                className="h-4 w-4 rounded border-app-border bg-app-bg text-app-accent focus:ring-app-accent"
              />
              <span className="text-app-muted">I am the Team Lead (can assign tasks)</span>
            </label>
          </>
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
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-app-muted">Password</span>
          <input
            type="password"
            className={inputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete={authMode === "signin" ? "current-password" : "new-password"}
          />
        </label>

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
