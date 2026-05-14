"use client";

import { AppShell } from "@/components/app-shell";
import { RequireAuth } from "@/components/require-auth";
import type { ReactNode } from "react";

interface DashboardLayoutProps {
  children: ReactNode;
  title?: string;
  description?: string;
}

export function DashboardLayout({ children, title, description }: DashboardLayoutProps) {
  return (
    <RequireAuth>
      <AppShell>
        {(title || description) && (
          <div className="border-b border-app-border px-6 py-4">
            {title && <h1 className="text-lg font-semibold text-app-text">{title}</h1>}
            {description && <p className="mt-0.5 text-sm text-app-muted">{description}</p>}
          </div>
        )}
        {children}
      </AppShell>
    </RequireAuth>
  );
}
