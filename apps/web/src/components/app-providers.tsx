"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

const AuthProviderLazy = dynamic(
  () =>
    import("@/contexts/auth-context").then((mod) => mod.AuthProvider),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-screen items-center justify-center app-mesh">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-app-border border-t-app-accent" />
      </div>
    ),
  },
);

const FirebaseAnalyticsLazy = dynamic(
  () =>
    import("@/components/firebase-analytics").then((mod) => mod.FirebaseAnalytics),
  { ssr: false },
);

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProviderLazy>
      <FirebaseAnalyticsLazy />
      {children}
    </AuthProviderLazy>
  );
}
