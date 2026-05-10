import { LoginInner } from "./login-inner";
import { Suspense } from "react";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-app-bg">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-app-border border-t-app-accent" />
        </div>
      }
    >
      <LoginInner />
    </Suspense>
  );
}
