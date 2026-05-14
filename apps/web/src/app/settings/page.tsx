import { SettingsClient } from "./settings-client";
import { DashboardLayout } from "@/components/dashboard-layout";

export default function SettingsPage() {
  return (
    <DashboardLayout title="Settings" description="Manage your preferences and integrations.">
      <SettingsClient />
    </DashboardLayout>
  );
}
