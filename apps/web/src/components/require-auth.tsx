"use client";

import { useAuth } from "@/contexts/auth-context";
import { resolveSignedInUser } from "@/lib/auth-session";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const signedIn = resolveSignedInUser(user);

  useEffect(() => {
    if (loading) return;

    const id = window.setTimeout(() => {
      if (resolveSignedInUser(user)) return;
      const returnUrl = pathname || "/chat";
      router.replace(`/login?returnUrl=${encodeURIComponent(returnUrl)}`);
    }, 0);

    return () => window.clearTimeout(id);
  }, [user, loading, router, pathname]);

  if (loading && !signedIn) {
    return (
      <div className="flex min-h-[50vh] flex-1 flex-col items-center justify-center gap-3">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-app-border border-t-app-accent"
          aria-hidden
        />
        <p className="text-sm text-app-muted">Checking session…</p>
      </div>
    );
  }

  if (!signedIn) {
    return null;
  }

  return <>{children}</>;
}
