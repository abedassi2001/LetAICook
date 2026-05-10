"use client";

import { useAuth } from "@/contexts/auth-context";
import { useState } from "react";

export function AuthForm() {
  const { signInEmail, signUpEmail } = useAuth();
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
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
        await signUpEmail(email, password, displayName);
      }
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-md space-y-5">
      <div className="flex gap-2 rounded-xl bg-app-elevated p-1 ring-1 ring-app-border">
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
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-app-muted">Name</span>
            <input
              className="rounded-xl border border-app-border bg-app-bg px-4 py-2.5 text-app-text placeholder:text-app-muted/60 focus:border-app-accent focus:outline-none focus:ring-1 focus:ring-app-accent"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
          </label>
        ) : null}
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-app-muted">Email</span>
          <input
            type="email"
            className="rounded-xl border border-app-border bg-app-bg px-4 py-2.5 text-app-text placeholder:text-app-muted/60 focus:border-app-accent focus:outline-none focus:ring-1 focus:ring-app-accent"
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
            className="rounded-xl border border-app-border bg-app-bg px-4 py-2.5 text-app-text placeholder:text-app-muted/60 focus:border-app-accent focus:outline-none focus:ring-1 focus:ring-app-accent"
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
          className="w-full rounded-xl bg-app-accent py-3 text-sm font-semibold text-app-on-accent hover:bg-app-accent-bright disabled:opacity-50"
        >
          {busy ? "Please wait…" : authMode === "signin" ? "Sign in" : "Create account"}
        </button>
      </form>

      <p className="text-center text-xs text-app-muted">
        New accounts are workers. Promote an admin in Firestore{" "}
        <code className="rounded bg-app-elevated px-1 text-app-accent/90">users/{"{uid}"}</code> →{" "}
        <code className="rounded bg-app-elevated px-1 text-app-accent/90">role: &quot;admin&quot;</code>.
      </p>
    </div>
  );
}
