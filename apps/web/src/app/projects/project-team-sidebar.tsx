"use client";

import { useAuth } from "@/contexts/auth-context";
import {
  fetchJiraProjectTeam,
  jiraCredentialsFromProfile,
  resolveJiraClientAuth,
  type JiraProjectTeam,
  type JiraProjectTeammate,
} from "@/lib/jira-client";
import type { ProjectMemberDoc } from "@/lib/project-member-model";
import {
  addProjectMemberByEmail,
  removeProjectMember,
  subscribeProjectMembers,
} from "@/lib/project-members";
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

function RosterMemberCard({
  displayName,
  email,
  linked,
  onRemove,
  canRemove,
}: {
  displayName: string;
  email: string;
  linked: boolean;
  onRemove?: () => void;
  canRemove: boolean;
}) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-violet-500/20 bg-violet-950/15 px-3 py-2.5 ring-1 ring-violet-500/10">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500/25 to-app-accent/20 text-xs font-semibold text-app-text ring-1 ring-white/10">
        {initials(displayName)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-app-text">{displayName}</p>
        <p className="truncate text-xs text-app-muted">{email}</p>
        <span
          className={`mt-1.5 inline-block rounded-md px-2 py-0.5 text-[10px] font-medium ${
            linked
              ? "bg-emerald-500/15 text-emerald-300"
              : "bg-amber-500/15 text-amber-200"
          }`}
        >
          {linked ? "letAIcook account linked" : "Invited — pending signup"}
        </span>
      </div>
      {canRemove && onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 rounded-lg border border-app-border px-2 py-1 text-[10px] text-app-muted transition-colors hover:border-red-500/40 hover:text-red-300"
          title="Remove from project"
        >
          Remove
        </button>
      ) : null}
    </li>
  );
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
  const isAdmin = profile?.role === "admin";

  const [team, setTeam] = useState<JiraProjectTeam | null>(null);
  const [roster, setRoster] = useState<{ id: string; data: ProjectMemberDoc }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rosterError, setRosterError] = useState<string | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addName, setAddName] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addMessage, setAddMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const jiraAuth = useMemo(
    () => resolveJiraClientAuth(user, profile),
    [user, profile],
  );
  const manualCreds = useMemo(
    () => jiraCredentialsFromProfile(profile),
    [profile],
  );

  const rosterEmails = useMemo(
    () => new Set(roster.map((r) => r.data.emailLower)),
    [roster],
  );

  const jiraOnlyTeammates = useMemo(() => {
    if (!team) return [];
    return team.teammates.filter(
      (t) => !t.email || !rosterEmails.has(t.email.toLowerCase()),
    );
  }, [team, rosterEmails]);

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

  useEffect(() => {
    if (!user) {
      setRoster([]);
      return;
    }
    const unsub = subscribeProjectMembers(
      projectKey,
      (items) => {
        setRoster(items);
        setRosterError(null);
      },
      (msg) => setRosterError(msg),
    );
    return unsub;
  }, [projectKey, user]);

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !isAdmin) return;
    setAddBusy(true);
    setAddMessage(null);
    try {
      const result = await addProjectMemberByEmail(
        projectKey,
        addEmail,
        user.uid,
        addName,
      );
      setAddMessage({
        type: "success",
        text: result.linked
          ? `${addEmail.trim()} added and linked to their letAIcook account.`
          : `${addEmail.trim()} added. They will link automatically when they sign up with this email.`,
      });
      setAddEmail("");
      setAddName("");
      setShowAddForm(false);
    } catch (err) {
      setAddMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Could not add member.",
      });
    } finally {
      setAddBusy(false);
    }
  }

  return (
    <aside className="flex flex-col rounded-xl border border-app-border bg-app-elevated/80 ring-1 ring-white/[0.04] lg:sticky lg:top-4 lg:max-h-[calc(100vh-6rem)]">
      <div className="shrink-0 border-b border-app-border/70 px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-app-text">Project team</h2>
            <p className="mt-0.5 text-xs text-app-muted">
              Roster + live Jira workload
            </p>
          </div>
          {jiraAuth ? (
            <button
              type="button"
              onClick={() => void loadTeam()}
              disabled={loading}
              className="rounded-lg border border-app-border px-2 py-1 text-[10px] font-medium text-app-muted transition-colors hover:border-app-accent hover:text-app-accent disabled:opacity-50"
            >
              Refresh
            </button>
          ) : null}
        </div>
        {team?.project_name ? (
          <p className="mt-2 text-xs text-app-text">
            <span className="font-mono text-app-accent">{team.project_key}</span>
            <span className="text-app-muted"> · {team.project_name}</span>
          </p>
        ) : (
          <p className="mt-2 text-xs text-app-text">
            <span className="font-mono text-app-accent">{projectKey}</span>
          </p>
        )}
        {team?.project_lead ? (
          <p className="mt-1 text-xs text-app-muted">
            Jira lead: <span className="text-app-text">{team.project_lead}</span>
          </p>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {/* Project roster (Firestore) */}
        <div className="mb-5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-app-muted">
              Project roster
            </h3>
            {isAdmin ? (
              <button
                type="button"
                onClick={() => {
                  setShowAddForm((v) => !v);
                  setAddMessage(null);
                }}
                className="rounded-lg bg-app-accent px-2.5 py-1 text-[10px] font-semibold text-white transition-colors hover:bg-app-accent/90"
              >
                {showAddForm ? "Cancel" : "+ Add"}
              </button>
            ) : null}
          </div>
          <p className="mb-3 text-[11px] leading-relaxed text-app-muted">
            Add teammates by email so you can assign work in letAIcook without opening
            Jira.
          </p>

          {showAddForm && isAdmin ? (
            <form
              onSubmit={(e) => void handleAddMember(e)}
              className="mb-3 space-y-2 rounded-xl border border-app-accent/30 bg-app-bg/80 p-3 ring-1 ring-app-accent/15"
            >
              <label className="block text-xs text-app-muted">
                Email
                <input
                  type="email"
                  required
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  placeholder="teammate@company.com"
                  className="mt-1 w-full rounded-lg border border-app-border bg-app-elevated px-2.5 py-2 text-sm text-app-text placeholder:text-app-muted focus:border-app-accent focus:outline-none focus:ring-1 focus:ring-app-accent"
                />
              </label>
              <label className="block text-xs text-app-muted">
                Display name (optional)
                <input
                  type="text"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder="Alex Cohen"
                  className="mt-1 w-full rounded-lg border border-app-border bg-app-elevated px-2.5 py-2 text-sm text-app-text placeholder:text-app-muted focus:border-app-accent focus:outline-none focus:ring-1 focus:ring-app-accent"
                />
              </label>
              <button
                type="submit"
                disabled={addBusy}
                className="w-full rounded-lg bg-app-accent py-2 text-xs font-semibold text-white hover:bg-app-accent/90 disabled:opacity-50"
              >
                {addBusy ? "Adding…" : "Add to project"}
              </button>
            </form>
          ) : null}

          {addMessage ? (
            <p
              className={`mb-3 rounded-lg px-3 py-2 text-xs ${
                addMessage.type === "success"
                  ? "border border-emerald-500/30 bg-emerald-950/25 text-emerald-200"
                  : "border border-red-500/30 bg-red-950/30 text-red-200"
              }`}
            >
              {addMessage.text}
            </p>
          ) : null}

          {rosterError ? (
            <p className="mb-3 rounded-lg border border-red-500/30 bg-red-950/30 px-3 py-2 text-xs text-red-200">
              {rosterError}
            </p>
          ) : null}

          {roster.length === 0 ? (
            <p className="text-xs text-app-muted">
              {isAdmin
                ? "No one added yet. Use Add to invite by email."
                : "No project members added yet."}
            </p>
          ) : (
            <ul className="space-y-2">
              {roster.map(({ id, data }) => (
                <RosterMemberCard
                  key={id}
                  displayName={data.displayName}
                  email={data.emailLower}
                  linked={Boolean(data.uid)}
                  canRemove={isAdmin}
                  onRemove={
                    isAdmin
                      ? () => void removeProjectMember(projectKey, id)
                      : undefined
                  }
                />
              ))}
            </ul>
          )}
        </div>

        {/* Jira workload */}
        <div className="border-t border-app-border/60 pt-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-app-muted">
            Jira workload
          </h3>
          {!jiraAuth ? (
            <p className="text-xs text-app-muted">
              Connect Jira in{" "}
              <a href="/settings" className="text-app-accent underline">
                Settings
              </a>{" "}
              to see live issue counts from your board.
            </p>
          ) : loading ? (
            <div className="flex justify-center py-8">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-app-border border-t-app-accent" />
            </div>
          ) : error ? (
            <p className="rounded-lg border border-red-500/30 bg-red-950/30 px-3 py-2 text-xs text-red-200">
              {error}
            </p>
          ) : jiraOnlyTeammates.length === 0 && !team?.unassigned_count ? (
            <p className="text-xs text-app-muted">
              All Jira assignees are on the roster above, or the project has no issues
              yet.
            </p>
          ) : team ? (
            <>
              <ul className="space-y-3">
                {jiraOnlyTeammates.map((member) => (
                  <TeammateCard
                    key={member.account_id ?? member.email ?? member.display_name}
                    member={member}
                    onSelectIssueKey={onSelectIssueKey}
                  />
                ))}
              </ul>
              {team.unassigned_count > 0 ? (
                <p className="mt-4 rounded-lg border border-amber-500/25 bg-amber-950/20 px-3 py-2 text-xs text-amber-100">
                  {team.unassigned_count} issue{team.unassigned_count === 1 ? "" : "s"}{" "}
                  in Jira have no assignee.
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
