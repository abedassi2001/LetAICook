"use client";

import { AppProviders } from "@/components/app-providers";
import { AppShell } from "@/components/app-shell";
import { RequireAuth } from "@/components/require-auth";
import type { ReactNode } from "react";

export function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <AppProviders>
      <RequireAuth>
        <AppShell>{children}</AppShell>
      </RequireAuth>
    </AppProviders>
  );
}
