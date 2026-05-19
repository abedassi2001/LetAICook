"use client";

export default function LoginError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 app-mesh">
      <p className="text-lg font-medium text-app-text">Could not load sign-in</p>
      <p className="max-w-md text-center text-sm text-app-muted">
        {error.message || "The login page failed to load. Try a full refresh."}
      </p>
      <div className="flex gap-3">
        <button type="button" onClick={() => reset()} className="btn-primary px-4 py-2">
          Try again
        </button>
        <a href="/login" className="btn-secondary px-4 py-2">
          Reload login
        </a>
      </div>
    </div>
  );
}
