import Link from "next/link";
import { TasksBoard } from "./tasks-board";

export default function TasksPage() {
  return (
    <div className="mx-auto max-w-3xl flex-1 px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-zinc-500">letAIcook</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Tasks (Firebase Auth + Firestore)
          </h1>
          <p className="mt-1 max-w-xl text-sm text-zinc-600 dark:text-zinc-400">
            Admins publish tasks with optional due times and assign workers.
            Workers see only their tasks and can mark them done. Data:{" "}
            <code className="rounded bg-zinc-100 px-1 text-xs dark:bg-zinc-900">
              users/{"{uid}"}
            </code>{" "}
            and{" "}
            <code className="rounded bg-zinc-100 px-1 text-xs dark:bg-zinc-900">
              projects/demo-project/tasks
            </code>
            .
          </p>
        </div>
        <Link
          href="/"
          className="text-sm font-medium text-zinc-700 underline-offset-4 hover:underline dark:text-zinc-300"
        >
          ← Home
        </Link>
      </div>
      <TasksBoard />
    </div>
  );
}
