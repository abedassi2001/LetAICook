"use client";

import { AuthForm } from "@/components/auth-form";
import { useAuth } from "@/contexts/auth-context";
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
      router.replace(safeReturn);
    }
  }, [user, profile, loading, router, safeReturn]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-app-bg">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-app-border border-t-app-accent" />
      </div>
    );
  }

  if (user && profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-app-bg">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-app-border border-t-app-accent" />
      </div>
    );
  }

  if (user && !profile) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-app-bg px-4">
        <div className="max-w-md rounded-xl border border-amber-500/40 bg-amber-950/30 p-6 text-amber-100">
          <p className="font-medium">No Firestore profile</p>
          <p className="mt-2 text-sm opacity-90">
            Your account exists in Auth but not in{" "}
            <code className="rounded bg-black/30 px-1">users/{user.uid}</code>. Create that document in the
            Firebase Console (e.g. role &quot;worker&quot; or &quot;admin&quot;).
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
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-app-bg px-4 py-12">
      <div className="mb-10 text-center">
        <p className="text-sm font-medium text-app-accent">letAIcook</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-app-text">Sign in to continue</h1>
        <p className="mt-2 max-w-md text-sm text-app-muted">
          After you sign in you&apos;ll go to planning chat. Use the sidebar anytime to open your task board.
        </p>
      </div>
      <AuthForm />
      <Link
        href="/"
        className="mt-10 text-sm text-app-muted underline-offset-4 hover:text-app-accent hover:underline"
      >
        ← Back to home
      </Link>
    </div>
  );
}
