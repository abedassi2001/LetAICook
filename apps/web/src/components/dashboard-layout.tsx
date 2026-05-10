"use client";

import { AppShell } from "@/components/app-shell";
import { RequireAuth } from "@/components/require-auth";
import type { ReactNode } from "react";

export function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <AppShell>{children}</AppShell>
    </RequireAuth>
  );
}
