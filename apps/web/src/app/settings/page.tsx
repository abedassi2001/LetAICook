import { RequireAuth } from "@/components/require-auth";
import { SettingsClient } from "./settings-client";
import { DashboardLayout } from "@/components/dashboard-layout";

export default function SettingsPage() {
  return (
    <RequireAuth>
      <DashboardLayout title="Settings" description="Manage your preferences and integrations.">
        <SettingsClient />
      </DashboardLayout>
    </RequireAuth>
  );
}
