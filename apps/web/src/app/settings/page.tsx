import { DashboardLayout } from "@/components/dashboard-layout";
import { RequireAuth } from "@/components/require-auth";
import { PageHeader } from "@/components/ui/page-header";
import { SettingsClient } from "./settings-client";

export default function SettingsPage() {
  return (
    <RequireAuth>
      <DashboardLayout>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl">
            <PageHeader
              eyebrow="Settings"
              title="Preferences"
              description="Manage your profile and connect Jira Cloud for task sync."
            />
            <SettingsClient />
          </div>
        </div>
      </DashboardLayout>
    </RequireAuth>
  );
}
