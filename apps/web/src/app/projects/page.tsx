import { PageHeader } from "@/components/ui/page-header";
import { ProjectsList } from "./projects-list";

export default function ProjectsPage() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <PageHeader
          eyebrow="Projects"
          title="Your Jira projects"
          description="Pick a project to open its task board. Tasks are stored per project and sync with Jira when connected."
        />
        <ProjectsList />
      </div>
    </div>
  );
}
