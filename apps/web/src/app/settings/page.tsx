import { DashboardLayout } from "@/components/dashboard-layout";
import { PageHeader } from "@/components/ui/page-header";
import { Suspense } from "react";
import { SettingsClient } from "./settings-client";

export default function SettingsPage() {
  return (
    <DashboardLayout>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl">
            <PageHeader
              eyebrow="Settings"
              title="Preferences"
              description="Manage your profile and connect Jira Cloud for task sync."
            />
            <Suspense fallback={<p className="text-sm text-app-muted">Loading settings…</p>}>
              <SettingsClient />
            </Suspense>
          </div>
        </div>
    </DashboardLayout>
  );
}
