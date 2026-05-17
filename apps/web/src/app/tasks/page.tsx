import { PageHeader } from "@/components/ui/page-header";
import { TasksBoard } from "./tasks-board";

export default function TasksPage() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <PageHeader
          eyebrow="Tasks"
          title="Task board"
          description="Track and sync work with Firestore and Jira. Assignees can update their tasks; admins manage the full board."
        />
        <TasksBoard />
      </div>
    </div>
  );
}
