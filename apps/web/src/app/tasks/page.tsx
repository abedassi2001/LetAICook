import { TasksBoard } from "./tasks-board";

export default function TasksPage() {
  return (
    <div className="min-h-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 border-b border-app-border pb-6">
          <p className="text-xs font-medium uppercase tracking-wider text-app-accent">Tasks</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-app-text">Task board</h1>
          <p className="mt-2 max-w-xl text-sm text-app-muted">
            Firestore:{" "}
            <code className="rounded bg-app-elevated px-1.5 py-0.5 text-xs text-app-accent/90">
              projects/demo-project/tasks
            </code>
            . Use the sidebar to return to planning chat.
          </p>
        </header>
        <TasksBoard />
      </div>
    </div>
  );
}
