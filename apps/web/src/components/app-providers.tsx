"use client";

import { FirebaseAnalytics } from "@/components/firebase-analytics";
import { AuthProvider } from "@/contexts/auth-context";
import type { ReactNode } from "react";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <FirebaseAnalytics />
      {children}
    </AuthProvider>
  );
}
