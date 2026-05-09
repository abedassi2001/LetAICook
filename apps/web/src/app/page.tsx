import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="max-w-lg text-center">
        <p className="text-sm font-medium text-zinc-500">letAIcook</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Engineering coordination platform
        </h1>
        <p className="mt-3 text-zinc-600 dark:text-zinc-400">
          Scaffold aligned with{" "}
          <code className="rounded bg-zinc-100 px-1 text-sm dark:bg-zinc-900">
            Plan/
          </code>{" "}
          (roadmaps, tasks, Jira). Open the Firestore task demo to see status,
          timestamps, and time fields you will sync with Jira later.
        </p>
        <Link
          href="/tasks"
          className="mt-8 inline-flex rounded-full bg-zinc-900 px-6 py-3 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          Open task board (Firebase)
        </Link>
      </div>
    </div>
  );
}
