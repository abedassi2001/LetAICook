import { AppProviders } from "@/components/app-providers";
import type { ReactNode } from "react";

export default function LoginLayout({ children }: { children: ReactNode }) {
  return <AppProviders>{children}</AppProviders>;
}
