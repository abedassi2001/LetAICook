"use client";

import { AuthForm } from "@/components/auth-form";
import { useAuth } from "@/contexts/auth-context";
import { getPublicApiBaseUrl } from "@/lib/api-base";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

export function LoginInner() {
  const { user, profile, loading, signOutUser } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get("returnUrl") || "/chat";
  const safeReturn =
    returnUrl.startsWith("/") && !returnUrl.startsWith("//") ? returnUrl : "/chat";

  useEffect(() => {
    if (loading) return;
    if (user && profile) {
      // Track user login in Elasticsearch (API indexes directly).
      fetch(`${getPublicApiBaseUrl()}/track-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: user.uid,
          email: user.email,
          timestamp: new Date().toISOString(),
        }),
      }).catch(console.error);

      router.replace(safeReturn);
    }
  }, [user, profile, loading, router, safeReturn]);

  const spinnerEl = (
    <div className="flex min-h-screen items-center justify-center bg-app-bg">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-app-border border-t-app-accent shadow-[0_0_20px_rgba(139,92,246,0.4)]" />
    </div>
  );

  if (loading || (user && profile)) return spinnerEl;

  if (user && !profile) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-app-bg px-4">
        <div className="absolute top-1/3 left-1/2 -z-10 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-500/10 blur-[100px]" />
        <div className="glass max-w-md rounded-2xl p-8 text-center shadow-2xl">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/20">
            <svg className="h-6 w-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <p className="text-lg font-semibold text-amber-300">No Firestore Profile</p>
          <p className="mt-2 text-sm text-app-muted">
            Your account exists in Auth but not in{" "}
            <code className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-xs text-amber-400">
              users/{user.uid}
            </code>
            . Create that document in the Firebase Console with a role of{" "}
            <span className="text-app-text">&quot;worker&quot;</span> or{" "}
            <span className="text-app-text">&quot;admin&quot;</span>.
          </p>
          <button
            type="button"
            onClick={() => void signOutUser()}
            className="mt-6 w-full rounded-xl border border-amber-500/30 py-2.5 text-sm font-medium text-amber-400 transition-all hover:bg-amber-500/10"
          >
            Sign out
          </button>
        </div>
        <Link href="/" className="mt-6 text-sm text-app-muted hover:text-app-accent">
          ← Back to home
        </Link>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen overflow-hidden bg-app-bg">
      {/* Background ambient blobs */}
      <div className="absolute top-0 left-0 -z-10 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-app-accent/15 blur-[120px]" />
      <div className="absolute bottom-0 right-0 -z-10 h-[500px] w-[500px] translate-x-1/2 translate-y-1/2 rounded-full bg-blue-600/15 blur-[120px]" />

      {/* Branding panel (visible on large screens) */}
      <div className="hidden flex-col justify-between border-r border-app-border bg-app-sidebar/60 p-12 backdrop-blur-sm lg:flex lg:w-2/5">
        <Link href="/" className="text-xl font-bold tracking-tight text-app-accent">
          letAIcook
        </Link>
        <div>
          <blockquote className="text-3xl font-semibold leading-snug text-app-text">
            &ldquo;Plan with AI, execute as a team — every sprint, every sprint.&rdquo;
          </blockquote>
          <p className="mt-4 text-sm text-app-muted">AI-powered project planning meets real-time task coordination.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-app-accent animate-pulse" />
          <p className="text-xs text-app-muted">Live system · Firebase + Gemini AI</p>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        {/* Mobile logo */}
        <Link href="/" className="mb-8 text-lg font-bold tracking-tight text-app-accent lg:hidden">
          letAIcook
        </Link>

        <div className="w-full max-w-md">
          <div className="mb-8 text-center lg:text-left">
            <h1 className="text-2xl font-bold tracking-tight text-app-text">Welcome back</h1>
            <p className="mt-2 text-sm text-app-muted">
              Sign in or create an account to start planning and shipping.
            </p>
          </div>

          <AuthForm />

          <Link
            href="/"
            className="mt-8 flex items-center justify-center gap-1.5 text-sm text-app-muted transition-colors hover:text-app-accent lg:justify-start"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
