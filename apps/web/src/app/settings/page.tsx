import { RequireAuth } from "@/components/require-auth";
import { SettingsClient } from "./settings-client";
import { DashboardLayout } from "@/components/dashboard-layout";

export default function SettingsPage() {
  return (
    <RequireAuth>
      <DashboardLayout>
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-app-text">Settings</h1>
          <p className="mt-1 text-sm text-app-muted">
            Manage your preferences and integrations.
          </p>
        </div>
        <SettingsClient />
      </DashboardLayout>
    </RequireAuth>
  );
}
