"use client";

import { useAuth } from "@/contexts/auth-context";
import {
  fetchJiraProjectTeam,
  jiraCredentialsFromProfile,
  resolveJiraClientAuth,
  type JiraProjectTeam,
  type JiraProjectTeammate,
} from "@/lib/jira-client";
import { useCallback, useEffect, useMemo, useState } from "react";

type ProjectTeamSidebarProps = {
  projectKey: string;
  onSelectIssueKey?: (issueKey: string) => void;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function statusTone(status: string, category: string): string {
  const c = category.toLowerCase();
  if (c === "done") return "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30";
  if (c === "in progress" || status.toLowerCase().includes("progress")) {
    return "bg-sky-500/15 text-sky-300 ring-sky-500/30";
  }
  return "bg-app-accent/10 text-app-accent ring-app-accent/25";
}

function TeammateCard({
  member,
  onSelectIssueKey,
}: {
  member: JiraProjectTeammate;
  onSelectIssueKey?: (issueKey: string) => void;
}) {
  return (
    <li className="rounded-xl border border-app-border/80 bg-app-bg/60 p-3 ring-1 ring-white/[0.03]">
      <div className="flex items-start gap-3">
        {member.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={member.avatar_url}
            alt=""
            className="h-10 w-10 shrink-0 rounded-full ring-1 ring-white/10"
          />
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-app-accent/30 to-app-violet/25 text-xs font-semibold text-app-text ring-1 ring-white/10">
            {initials(member.display_name)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-app-text">{member.display_name}</p>
          {member.email ? (
            <p className="truncate text-xs text-app-muted">{member.email}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="rounded-md bg-app-elevated px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-app-muted">
              {member.active_count} open
            </span>
            {member.in_progress_count > 0 ? (
              <span className="rounded-md bg-sky-500/15 px-2 py-0.5 text-[10px] font-medium text-sky-300">
                {member.in_progress_count} active
              </span>
            ) : null}
            <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300/90">
              {member.done_count} done
            </span>
          </div>
        </div>
      </div>
      {member.recent_issues.length > 0 ? (
        <ul className="mt-3 space-y-1.5 border-t border-app-border/60 pt-3">
          {member.recent_issues.map((issue) => (
            <li key={issue.issue_key}>
              <button
                type="button"
                onClick={() => onSelectIssueKey?.(issue.issue_key)}
                className="group w-full rounded-lg border border-transparent px-2 py-1.5 text-left transition-colors hover:border-app-border hover:bg-app-elevated/80"
              >
                <p className="line-clamp-2 text-xs text-app-text group-hover:text-app-accent">
                  {issue.summary}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-[10px] text-app-muted">{issue.issue_key}</span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ${statusTone(issue.status, issue.status_category)}`}
                  >
                    {issue.status}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      ) : member.active_count === 0 ? (
        <p className="mt-2 text-xs text-app-muted">No open issues assigned.</p>
      ) : null}
    </li>
  );
}

export function ProjectTeamSidebar({
  projectKey,
  onSelectIssueKey,
}: ProjectTeamSidebarProps) {
  const { user, profile } = useAuth();
  const [team, setTeam] = useState<JiraProjectTeam | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const jiraAuth = useMemo(
    () => resolveJiraClientAuth(user, profile),
    [user, profile],
  );
  const manualCreds = useMemo(
    () => jiraCredentialsFromProfile(profile),
    [profile],
  );

  const loadTeam = useCallback(async () => {
    if (!jiraAuth) {
      setTeam(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJiraProjectTeam(jiraAuth, projectKey, 100, manualCreds);
      setTeam(data);
    } catch (e) {
      setTeam(null);
      setError(e instanceof Error ? e.message : "Could not load team from Jira.");
    } finally {
      setLoading(false);
    }
  }, [jiraAuth, projectKey, manualCreds]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadTeam();
    });
  }, [loadTeam]);

  if (!jiraAuth) {
    return (
      <aside className="rounded-xl border border-app-border bg-app-elevated/80 p-4 ring-1 ring-white/[0.04]">
        <h2 className="text-sm font-semibold text-app-text">Project team</h2>
        <p className="mt-2 text-xs text-app-muted">
          Connect Jira in{" "}
          <a href="/settings" className="text-app-accent underline">
            Settings
          </a>{" "}
          to see teammates and workload here.
        </p>
      </aside>
    );
  }

  return (
    <aside className="flex flex-col rounded-xl border border-app-border bg-app-elevated/80 ring-1 ring-white/[0.04] lg:sticky lg:top-4 lg:max-h-[calc(100vh-6rem)]">
      <div className="shrink-0 border-b border-app-border/70 px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-app-text">Project team</h2>
            <p className="mt-0.5 text-xs text-app-muted">
              Live from Jira · no extra login
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadTeam()}
            disabled={loading}
            className="rounded-lg border border-app-border px-2 py-1 text-[10px] font-medium text-app-muted transition-colors hover:border-app-accent hover:text-app-accent disabled:opacity-50"
          >
            Refresh
          </button>
        </div>
        {team?.project_name ? (
          <p className="mt-2 text-xs text-app-text">
            <span className="font-mono text-app-accent">{team.project_key}</span>
            <span className="text-app-muted"> · {team.project_name}</span>
          </p>
        ) : null}
        {team?.project_lead ? (
          <p className="mt-1 text-xs text-app-muted">
            Lead: <span className="text-app-text">{team.project_lead}</span>
          </p>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {loading ? (
          <div className="flex justify-center py-10">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-app-border border-t-app-accent" />
          </div>
        ) : error ? (
          <p className="rounded-lg border border-red-500/30 bg-red-950/30 px-3 py-2 text-xs text-red-200">
            {error}
          </p>
        ) : team && team.teammates.length === 0 ? (
          <p className="text-xs text-app-muted">
            No assignable users found for this project. Import issues or assign work in
            letAIcook to populate the board.
          </p>
        ) : team ? (
          <>
            <ul className="space-y-3">
              {team.teammates.map((member) => (
                <TeammateCard
                  key={member.account_id ?? member.email ?? member.display_name}
                  member={member}
                  onSelectIssueKey={onSelectIssueKey}
                />
              ))}
            </ul>
            {team.unassigned_count > 0 ? (
              <p className="mt-4 rounded-lg border border-amber-500/25 bg-amber-950/20 px-3 py-2 text-xs text-amber-100">
                {team.unassigned_count} issue{team.unassigned_count === 1 ? "" : "s"} in
                Jira have no assignee.
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </aside>
  );
}
