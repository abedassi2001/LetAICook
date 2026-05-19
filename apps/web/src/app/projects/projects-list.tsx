"use client";

import { useAuth } from "@/contexts/auth-context";
import {
  jiraCredentialsFromProfile,
  listJiraProjects,
  type JiraProject,
} from "@/lib/jira-client";
import { DEMO_PROJECT_ID } from "@/lib/task-model";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

export function ProjectsList() {
  const { user, profile, loading: authLoading, signOutUser } = useAuth();
  const [projects, setProjects] = useState<JiraProject[]>([]);
  const [jiraLoading, setJiraLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const jiraDomain = profile?.jiraDomain?.trim() ?? "";
  const jiraEmail = profile?.jiraEmail?.trim() ?? "";
  const jiraApiToken = profile?.jiraApiToken?.trim() ?? "";
  const jiraDefaultProject = profile?.jiraDefaultProject?.trim() ?? "";

  const jiraCreds = useMemo(
    () => jiraCredentialsFromProfile(profile),
    [jiraDomain, jiraEmail, jiraApiToken, jiraDefaultProject],
  );

  const loading = authLoading || (Boolean(jiraCreds) && jiraLoading);

  // One fetch per visit / refresh, or when Jira credentials change — not on every Firestore profile tick.
  useEffect(() => {
    if (authLoading || !user?.uid || !jiraCreds) return;

    let cancelled = false;
    void (async () => {
      setJiraLoading(true);
      setError(null);
      try {
        const list = await listJiraProjects(jiraCreds);
        if (!cancelled) setProjects(list);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load Jira projects.");
        }
      } finally {
        if (!cancelled) setJiraLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, user?.uid, jiraDomain, jiraEmail, jiraApiToken, jiraDefaultProject, jiraCreds]);

  if (authLoading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-app-border border-t-app-accent" />
      </div>
    );
  }

  if (!user) return null;

  if (!profile) {
    return (
      <div className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-4 text-amber-100">
        <p className="font-medium">No Firestore profile</p>
        <p className="mt-1 text-sm">
          Create <code className="text-amber-200">users/{user.uid}</code> in Firebase Console.
        </p>
        <button
          type="button"
          onClick={() => void signOutUser()}
          className="mt-3 text-sm text-app-accent underline"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!jiraCreds ? (
        <div className="rounded-xl border border-app-border bg-app-elevated/80 p-5 ring-1 ring-white/[0.04]">
          <p className="text-sm font-medium text-app-text">Connect Jira to see your projects</p>
          <p className="mt-2 text-sm text-app-muted">
            Add your Jira Cloud credentials in Settings, then return here to open a project and
            manage tasks.
          </p>
          <Link
            href="/settings"
            className="mt-4 inline-block rounded-lg bg-app-accent px-4 py-2 text-sm font-semibold text-app-on-accent hover:bg-app-accent-bright"
          >
            Open Settings
          </Link>
          <p className="mt-6 text-xs text-app-muted">
            Or continue with the local demo project (no Jira):
          </p>
          <Link
            href={`/projects/${DEMO_PROJECT_ID}`}
            className="mt-2 inline-block text-sm text-app-accent underline hover:text-app-accent-bright"
          >
            {DEMO_PROJECT_ID}
          </Link>
        </div>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-100">
          {error}
        </p>
      ) : null}

      {jiraCreds ? (
        <>
          <p className="text-sm text-app-muted">
            Projects from <span className="text-app-text">{profile.jiraDomain}</span>. Select one to
            view and manage tasks.
          </p>

          {loading ? (
            <p className="text-sm text-app-muted">Loading Jira projects…</p>
          ) : projects.length === 0 ? (
            <p className="text-sm text-app-muted">No projects found for this Jira account.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {projects.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/projects/${encodeURIComponent(p.key)}`}
                    className="group block rounded-xl border border-app-border bg-app-elevated/80 p-4 ring-1 ring-white/[0.04] transition-all hover:border-app-accent/50 hover:shadow-lg hover:shadow-app-accent/5"
                  >
                    <span className="font-mono text-sm font-semibold text-app-accent group-hover:text-app-accent-bright">
                      {p.key}
                    </span>
                    <p className="mt-1 text-sm text-app-text">{p.name}</p>
                    <p className="mt-2 text-xs text-app-muted">Open task board →</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </div>
  );
}
