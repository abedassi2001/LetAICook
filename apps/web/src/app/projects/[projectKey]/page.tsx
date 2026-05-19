import { PageHeader } from "@/components/ui/page-header";
import Link from "next/link";
import { TasksBoard } from "../tasks-board";

type Props = {
  params: Promise<{ projectKey: string }>;
};

export default async function ProjectTasksPage({ params }: Props) {
  const { projectKey } = await params;
  const decodedKey = decodeURIComponent(projectKey);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/projects"
          className="mb-4 inline-block text-sm text-app-muted transition-colors hover:text-app-accent"
        >
          ← All projects
        </Link>
        <PageHeader
          eyebrow="Project"
          title={decodedKey}
          description="Create, update, and complete tasks for this project. Changes sync to Jira when linked."
        />
        <TasksBoard projectKey={decodedKey} />
      </div>
    </div>
  );
}
