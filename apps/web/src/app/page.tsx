import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-app-bg px-6 py-16">
      <div className="max-w-lg text-center">
        <p className="text-sm font-medium text-app-accent">letAIcook</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-app-text md:text-4xl">
          Engineering coordination
        </h1>
        <p className="mt-4 text-app-muted">
          Plan with AI, then run work on a shared Firebase task board — admins assign, workers deliver.
        </p>
        <div className="mt-10 flex flex-col items-stretch gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/login"
            className="inline-flex justify-center rounded-xl bg-app-accent px-8 py-3 text-sm font-semibold text-app-on-accent hover:bg-app-accent-bright"
          >
            Sign in to start
          </Link>
          <Link
            href="/login?returnUrl=%2Ftasks"
            className="inline-flex justify-center rounded-xl border border-app-border bg-app-elevated px-8 py-3 text-sm font-medium text-app-text hover:border-app-accent/40 hover:text-app-accent"
          >
            Go to tasks after login
          </Link>
        </div>
        <p className="mt-8 text-xs text-app-muted">
          New here? Sign up on the login page — you&apos;ll land in planning chat, then use the sidebar for tasks.
        </p>
      </div>
    </div>
  );
}
