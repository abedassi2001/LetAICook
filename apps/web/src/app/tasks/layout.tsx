import { AuthProvider } from "@/contexts/auth-context";

export default function TasksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthProvider>{children}</AuthProvider>;
}
