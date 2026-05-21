"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { ProjectTeamSidebar } from "./project-team-sidebar";
import { TasksBoard } from "./tasks-board";

type ProjectWorkspaceProps = {
  projectKey: string;
};

export function ProjectWorkspace({ projectKey }: ProjectWorkspaceProps) {
  const [highlightIssueKey, setHighlightIssueKey] = useState<string | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  const handleSelectIssueKey = useCallback((issueKey: string) => {
    setHighlightIssueKey(issueKey);
    boardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl">
        <Link
          href="/projects"
          className="mb-4 inline-block text-sm text-app-muted transition-colors hover:text-app-accent"
        >
          ← All projects
        </Link>
        <PageHeader
          eyebrow="Project"
          title={projectKey}
          description="Manage tasks and your Jira board in one place. Teammates and workload update from Jira automatically."
        />

        <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-start">
          <div ref={boardRef} className="min-w-0 flex-1">
            <TasksBoard
              projectKey={projectKey}
              highlightJiraIssueKey={highlightIssueKey}
            />
          </div>
          <div className="w-full shrink-0 lg:w-80 xl:w-[22rem]">
            <ProjectTeamSidebar
              projectKey={projectKey}
              onSelectIssueKey={handleSelectIssueKey}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
