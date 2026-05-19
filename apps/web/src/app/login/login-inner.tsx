"use client";

import { AuthForm } from "@/components/auth-form";
import { AmbientBackground } from "@/components/ui/ambient-background";
import { FadeIn } from "@/components/ui/motion";
import { IconSparkle } from "@/components/ui/nav-icons";
import { useAuth } from "@/contexts/auth-context";
import { resolveSignedInUser } from "@/lib/auth-session";
import { clearAuthReturnUrl, readAuthReturnUrl } from "@/lib/auth-redirect";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";

export function LoginInner() {
  const { user, profile, loading, error: authError, signOutUser } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const safeReturn = useMemo(
    () => readAuthReturnUrl(searchParams.get("returnUrl")),
    [searchParams],
  );

  const signedIn = resolveSignedInUser(user);

  useEffect(() => {
    if (loading || !signedIn) return;
    clearAuthReturnUrl();
    router.replace(safeReturn);
  }, [signedIn, loading, safeReturn, router]);

  if (loading || signedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center app-mesh">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-app-border border-t-app-accent" />
      </div>
    );
  }

  if (user && !profile) {
    return (
      <AmbientBackground variant="hero" className="flex min-h-screen flex-col items-center justify-center px-4">
        <div className="glass-panel-strong max-w-md rounded-2xl p-6 text-amber-100">
          <p className="font-medium">No Firestore profile</p>
          <p className="mt-2 text-sm opacity-90">
            Your account exists in Auth but not in{" "}
            <code className="rounded bg-black/30 px-1">users/{user.uid}</code>. Create that
            document in the Firebase Console (e.g. role &quot;worker&quot; or &quot;admin&quot;).
          </p>
          <button
            type="button"
            onClick={() => void signOutUser()}
            className="mt-4 text-sm text-app-accent underline"
          >
            Sign out
          </button>
        </div>
        <Link href="/" className="mt-8 text-sm text-app-muted hover:text-app-accent">
          ← Home
        </Link>
      </AmbientBackground>
    );
  }

  return (
    <AmbientBackground variant="hero" className="min-h-screen">
      <div className="mx-auto grid min-h-screen max-w-6xl lg:grid-cols-2">
        <div className="hidden flex-col justify-center px-10 lg:flex">
          <FadeIn>
            <div className="inline-flex items-center gap-2 rounded-full border border-app-border-bright/50 bg-app-elevated/40 px-4 py-1.5 text-xs text-app-muted">
              <IconSparkle className="h-3.5 w-3.5 text-app-accent" />
              letAIcook workspace
            </div>
            <h1 className="mt-6 text-4xl font-bold tracking-tight">
              <span className="text-gradient">Ship faster</span>
              <br />
              with AI planning
            </h1>
            <p className="mt-4 max-w-md text-lg leading-relaxed text-app-muted">
              Sign in to access planning chat, system design, and your team task board — all in
              one coordinated flow.
            </p>
            <ul className="mt-8 space-y-3 text-sm text-app-muted">
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-app-accent" />
                Gemini-powered project planning
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-app-violet" />
                Architecture & diagram generation
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-app-accent-bright" />
                Jira-synced task board
              </li>
            </ul>
          </FadeIn>
        </div>

        <div className="flex flex-col items-center justify-center px-4 py-12 lg:px-10">
          <FadeIn className="w-full max-w-md">
            <div className="mb-8 text-center lg:text-left">
              <p className="text-sm font-medium text-app-accent lg:hidden">letAIcook</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-app-text">
                Welcome back
              </h2>
              <p className="mt-2 text-sm text-app-muted">
                Sign in to continue to planning chat and your workspace.
              </p>
            </div>
            <AuthForm />
            {authError ? (
              <p className="mt-4 rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-300">
                {authError}
              </p>
            ) : null}
            <Link
              href="/"
              className="mt-8 block text-center text-sm text-app-muted underline-offset-4 hover:text-app-accent hover:underline lg:text-left"
            >
              ← Back to home
            </Link>
          </FadeIn>
        </div>
      </div>
    </AmbientBackground>
  );
}
