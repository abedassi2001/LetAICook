"use client";

import { useAuth } from "@/contexts/auth-context";
import { useState } from "react";

export function AuthForm() {
  const { signInEmail, signUpEmail } = useAuth();
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [teamId, setTeamId] = useState("");
  const [isTeamLead, setIsTeamLead] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (authMode === "signin") {
        await signInEmail(email, password);
      } else {
        if (!teamId.trim()) {
          throw new Error("Team ID is required to create an account.");
        }
        await signUpEmail(email, password, displayName, teamId, isTeamLead ? "admin" : "worker");
      }
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-md">
      {/* Tab Switcher */}
      <div className="relative mb-6 flex rounded-2xl bg-app-elevated/80 p-1 ring-1 ring-app-border backdrop-blur-sm">
        <div
          className="absolute top-1 bottom-1 rounded-xl bg-app-accent transition-all duration-300 ease-in-out"
          style={{
            left: authMode === "signin" ? "4px" : "50%",
            right: authMode === "signin" ? "50%" : "4px",
          }}
        />
        <button
          id="tab-signin"
          type="button"
          className={`relative z-10 flex-1 rounded-xl py-2.5 text-sm font-semibold transition-colors duration-300 ${
            authMode === "signin" ? "text-white" : "text-app-muted hover:text-app-text"
          }`}
          onClick={() => setAuthMode("signin")}
        >
          Sign in
        </button>
        <button
          id="tab-signup"
          type="button"
          className={`relative z-10 flex-1 rounded-xl py-2.5 text-sm font-semibold transition-colors duration-300 ${
            authMode === "signup" ? "text-white" : "text-app-muted hover:text-app-text"
          }`}
          onClick={() => setAuthMode("signup")}
        >
          Sign up
        </button>
      </div>

      <form className="space-y-4" onSubmit={(e) => void handleSubmit(e)}>
        {authMode === "signup" && (
          <>
            <div className="group relative">
              <input
                id="displayName"
                className="peer w-full rounded-xl border border-app-border bg-app-elevated/60 px-4 pb-2.5 pt-5 text-sm text-app-text placeholder-transparent backdrop-blur-sm transition-all focus:border-app-accent focus:outline-none focus:ring-1 focus:ring-app-accent"
                placeholder="Name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
              />
              <label htmlFor="displayName" className="absolute left-4 top-2 text-xs font-medium text-app-muted transition-all peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-sm peer-focus:top-2 peer-focus:text-xs peer-focus:text-app-accent">
                Full Name
              </label>
            </div>

            <div className="group relative">
              <input
                id="teamId"
                className="peer w-full rounded-xl border border-app-border bg-app-elevated/60 px-4 pb-2.5 pt-5 text-sm text-app-text placeholder-transparent backdrop-blur-sm transition-all focus:border-app-accent focus:outline-none focus:ring-1 focus:ring-app-accent"
                placeholder="Team ID"
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                required
              />
              <label htmlFor="teamId" className="absolute left-4 top-2 text-xs font-medium text-app-muted transition-all peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-sm peer-focus:top-2 peer-focus:text-xs peer-focus:text-app-accent">
                Team ID <span className="opacity-60">(shared with your team)</span>
              </label>
            </div>

            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-app-border bg-app-elevated/60 px-4 py-3 transition-all hover:border-app-accent/50">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={isTeamLead}
                  onChange={(e) => setIsTeamLead(e.target.checked)}
                  className="sr-only"
                />
                <div className={`h-5 w-5 rounded border-2 transition-all ${isTeamLead ? "border-app-accent bg-app-accent" : "border-app-border bg-app-bg"}`}>
                  {isTeamLead && (
                    <svg className="h-full w-full p-0.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              </div>
              <span className="text-sm text-app-muted">I am the Team Lead <span className="text-app-text/60">(can assign tasks)</span></span>
            </label>
          </>
        )}

        <div className="relative">
          <input
            id="email"
            type="email"
            className="peer w-full rounded-xl border border-app-border bg-app-elevated/60 px-4 pb-2.5 pt-5 text-sm text-app-text placeholder-transparent backdrop-blur-sm transition-all focus:border-app-accent focus:outline-none focus:ring-1 focus:ring-app-accent"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <label htmlFor="email" className="absolute left-4 top-2 text-xs font-medium text-app-muted transition-all peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-sm peer-focus:top-2 peer-focus:text-xs peer-focus:text-app-accent">
            Email address
          </label>
        </div>

        <div className="relative">
          <input
            id="password"
            type="password"
            className="peer w-full rounded-xl border border-app-border bg-app-elevated/60 px-4 pb-2.5 pt-5 text-sm text-app-text placeholder-transparent backdrop-blur-sm transition-all focus:border-app-accent focus:outline-none focus:ring-1 focus:ring-app-accent"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete={authMode === "signin" ? "current-password" : "new-password"}
          />
          <label htmlFor="password" className="absolute left-4 top-2 text-xs font-medium text-app-muted transition-all peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-sm peer-focus:top-2 peer-focus:text-xs peer-focus:text-app-accent">
            Password
          </label>
        </div>

        {error && (
          <div className="flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-950/30 px-4 py-3 backdrop-blur-sm">
            <svg className="mt-0.5 h-4 w-4 shrink-0 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        <button
          id="btn-submit-auth"
          type="submit"
          disabled={busy}
          className="relative w-full overflow-hidden rounded-xl bg-app-accent py-3.5 text-sm font-semibold text-white shadow-[0_0_20px_rgba(139,92,246,0.3)] transition-all duration-300 hover:bg-app-accent-bright hover:shadow-[0_0_30px_rgba(139,92,246,0.5)] hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50 disabled:scale-100"
        >
          {busy ? (
            <span className="flex items-center justify-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Please wait…
            </span>
          ) : (
            authMode === "signin" ? "Sign in →" : "Create account →"
          )}
        </button>
      </form>
    </div>
  );
}

