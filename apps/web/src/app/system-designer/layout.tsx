import { DashboardLayout } from "@/components/dashboard-layout";

export default function SystemDesignerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
