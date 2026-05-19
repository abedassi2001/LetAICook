"use client";

import { useAuth } from "@/contexts/auth-context";
import { getFirestoreDb } from "@/lib/firebase";
import {
  DEMO_PROJECT_ID,
  type TaskDoc,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/task-model";
import {
  createJiraIssue,
  deleteJiraIssue,
  fetchJiraConnection,
  jiraCredentialsFromProfile,
  jiraDisplayLabel,
  listJiraProjectIssues,
  listJiraProjects,
  resolveJiraClientAuth,
  syncJiraIssueStatus,
  updateJiraIssue,
  type JiraConnectionInfo,
  type JiraIssueListItem,
  type JiraProject,
} from "@/lib/jira-client";
import {
  jiraPriorityToTaskPriority,
  jiraStatusToTaskStatus,
} from "@/lib/jira-status-map";
import { USERS_COLLECTION, type UserProfileDoc } from "@/lib/user-model";
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";

function tasksCollection(teamId: string) {
  return collection(
    getFirestoreDb(),
    "projects",
    teamId || DEMO_PROJECT_ID,
    "tasks",
  );
}

const STATUSES: TaskStatus[] = [
  "todo",
  "in_progress",
  "review",
  "done",
  "blocked",
];

const PRIORITIES: TaskPriority[] = ["low", "medium", "high", "critical"];

function formatTs(value: TaskDoc["createdAt"] | null | undefined) {
  if (!value || typeof value.toDate !== "function") return "—";
  return value.toDate().toLocaleString();
}

type WorkerOption = { uid: string; label: string };

export function TasksBoard() {
  const { user, profile, loading: authLoading, error: authCtxError, signOutUser } =
    useAuth();

  const [items, setItems] = useState<{ id: string; data: TaskDoc }[]>([]);
  const [workers, setWorkers] = useState<WorkerOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [dueLocal, setDueLocal] = useState("");
  const [assigneeUid, setAssigneeUid] = useState<string>("");
  const [jiraNotice, setJiraNotice] = useState<string | null>(null);
  const [jiraBusy, setJiraBusy] = useState(false);
  const [jiraProjects, setJiraProjects] = useState<JiraProject[]>([]);
  const [selectedJiraProject, setSelectedJiraProject] = useState("");
  const [jiraLiveIssues, setJiraLiveIssues] = useState<JiraIssueListItem[]>([]);
  const [jiraConnection, setJiraConnection] = useState<JiraConnectionInfo | null>(null);
  const [hasJira, setHasJira] = useState(false);
  const [tasksReady, setTasksReady] = useState(false);
  const jiraImportKeyRef = useRef<string | null>(null);
  const jiraIssuesLoadKeyRef = useRef<string | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const isAdmin = profile?.role === "admin";
  const uid = user?.uid ?? "";
  const jiraAuth = useMemo(
    () => resolveJiraClientAuth(user, profile),
    [user, profile],
  );
  const manualCreds = useMemo(
    () => jiraCredentialsFromProfile(profile),
    [
      profile?.jiraDomain,
      profile?.jiraEmail,
      profile?.jiraApiToken,
      profile?.jiraDefaultProject,
    ],
  );

  const activeJiraProject =
    selectedJiraProject ||
    jiraConnection?.project_key ||
    manualCreds?.defaultProject ||
    "";

  const jiraBrowseBase =
    jiraConnection?.site_url?.replace(/\/$/, "") ||
    (manualCreds?.domain ? `https://${manualCreds.domain.replace(/^https?:\/\//, "")}` : "");

  useEffect(() => {
    if (!jiraAuth) {
      setHasJira(false);
      setJiraConnection(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        if (jiraAuth.mode === "oauth") {
          const conn = await fetchJiraConnection(jiraAuth.getIdToken);
          if (cancelled) return;
          setJiraConnection(conn);
          setHasJira(conn.connected || Boolean(manualCreds));
          if (conn.project_key && !selectedJiraProject) {
            setSelectedJiraProject(conn.project_key);
          }
        } else {
          setHasJira(true);
        }
      } catch {
        if (!cancelled) setHasJira(Boolean(manualCreds));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jiraAuth, manualCreds, selectedJiraProject]);

  const importFromJira = useCallback(
    async (force = false) => {
      if (!jiraAuth || !hasJira || !activeJiraProject || !user) return;
      const syncKey = `${activeJiraProject}`;
      if (!force && jiraImportKeyRef.current === syncKey) return;
      jiraImportKeyRef.current = syncKey;

      setJiraBusy(true);
      setJiraNotice(null);
      try {
        const issues = await listJiraProjectIssues(
          jiraAuth,
          activeJiraProject,
          50,
          manualCreds,
        );
        const existingKeys = new Set(
          itemsRef.current
            .map((i) => i.data.jiraIssueKey)
            .filter((k): k is string => Boolean(k)),
        );
        const teamId = profile?.teamId || DEMO_PROJECT_ID;
        const now = serverTimestamp();
        let imported = 0;

        for (const issue of issues) {
          if (existingKeys.has(issue.issue_key)) continue;
          const status = jiraStatusToTaskStatus(
            issue.status,
            issue.status_category,
          );
          const priority = jiraPriorityToTaskPriority(issue.priority);
          await addDoc(tasksCollection(teamId), {
            title: issue.summary,
            description: `Imported from Jira (${issue.issue_key})`,
            status,
            priority,
            publishedByUid: user.uid,
            assigneeUid: isAdmin ? null : user.uid,
            assigneeLabel: "",
            createdAt: now,
            updatedAt: now,
            dueAt: null,
            completedAt: status === "done" ? now : null,
            completedByUid: null,
            timeEstimateMinutes: null,
            timeSpentMinutes: null,
            jiraIssueKey: issue.issue_key,
          });
          existingKeys.add(issue.issue_key);
          imported += 1;
        }

        setJiraNotice(
          imported > 0
            ? `Imported ${imported} issue(s) from Jira project ${activeJiraProject}.`
            : `Jira project ${activeJiraProject} is in sync (${issues.length} issue(s) checked).`,
        );
      } catch (e) {
        setJiraNotice(
          e instanceof Error ? e.message : "Failed to import from Jira.",
        );
      } finally {
        setJiraBusy(false);
      }
    },
    [jiraAuth, hasJira, activeJiraProject, user, isAdmin, profile?.teamId, manualCreds],
  );

  useEffect(() => {
    if (!profile?.jiraDefaultProject) return;
    startTransition(() => {
      setSelectedJiraProject(profile.jiraDefaultProject || "");
    });
  }, [profile?.jiraDefaultProject]);

  useEffect(() => {
    if (!jiraAuth || !hasJira) {
      setJiraProjects([]);
      setJiraLiveIssues([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const projects = await listJiraProjects(jiraAuth, manualCreds);
        if (cancelled) return;
        setJiraProjects(projects);
        setSelectedJiraProject((current) => {
          if (current) return current;
          return (
            projects.find((p) => p.key === profile?.jiraDefaultProject)?.key
            ?? projects[0]?.key
            ?? ""
          );
        });
      } catch (e) {
        if (!cancelled) {
          setJiraNotice(
            e instanceof Error ? e.message : "Could not load Jira projects.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jiraAuth, hasJira, profile?.jiraDefaultProject, manualCreds]);

  const loadJiraLiveIssues = useCallback(
    async (force = false) => {
      if (!jiraAuth || !hasJira || !activeJiraProject) {
        setJiraLiveIssues([]);
        return;
      }
      const loadKey = `${activeJiraProject}`;
      if (!force && jiraIssuesLoadKeyRef.current === loadKey) return;
      jiraIssuesLoadKeyRef.current = loadKey;

      try {
        const issues = await listJiraProjectIssues(
          jiraAuth,
          activeJiraProject,
          50,
          manualCreds,
        );
        setJiraLiveIssues(issues);
      } catch (e) {
        setJiraLiveIssues([]);
        setJiraNotice(
          e instanceof Error ? e.message : "Could not load Jira issues.",
        );
      }
    },
    [jiraAuth, hasJira, activeJiraProject, manualCreds],
  );

  useEffect(() => {
    void loadJiraLiveIssues(false);
  }, [loadJiraLiveIssues]);

  async function handleJiraProjectSelect(projectKey: string) {
    setSelectedJiraProject(projectKey);
    jiraImportKeyRef.current = null;
    jiraIssuesLoadKeyRef.current = null;
    if (!user) return;
    try {
      await updateDoc(doc(getFirestoreDb(), USERS_COLLECTION, user.uid), {
        jiraDefaultProject: projectKey,
        updatedAt: serverTimestamp(),
      });
    } catch {
      /* profile listener will still use local selection */
    }
  }

  useEffect(() => {
    if (!isAdmin || !profile?.teamId) return;
    const q = query(
      collection(getFirestoreDb(), USERS_COLLECTION),
      where("role", "==", "worker"),
      where("teamId", "==", profile.teamId)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setWorkers(
          snap.docs.map((d) => {
            const u = d.data() as UserProfileDoc;
            return {
              uid: d.id,
              label: `${u.displayName} (${u.emailLower})`,
            };
          }),
        );
      },
      (e) => setError(e.message),
    );
    return () => unsub();
  }, [isAdmin, profile?.teamId]);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    const cancel = { current: false };

    if (!user || !profile) {
      queueMicrotask(() => {
        if (cancel.current) return;
        setItems([]);
        setLoading(false);
      });
      return () => {
        cancel.current = true;
      };
    }

    queueMicrotask(() => {
      if (cancel.current) return;
      try {
        const teamId = profile?.teamId || DEMO_PROJECT_ID;
        const base = tasksCollection(teamId);
        const q = isAdmin
          ? query(base, orderBy("updatedAt", "desc"))
          : query(base, where("assigneeUid", "==", uid));

        unsub = onSnapshot(
          q,
          (snap) => {
            if (cancel.current) return;
            const next = snap.docs.map((d) => ({
              id: d.id,
              data: d.data() as TaskDoc,
            }));
            if (!isAdmin) {
              next.sort((a, b) => {
                const ta = a.data.updatedAt?.toMillis?.() ?? 0;
                const tb = b.data.updatedAt?.toMillis?.() ?? 0;
                return tb - ta;
              });
            }
            setItems(next);
            setLoading(false);
            setTasksReady(true);
            setError(null);
          },
          (e) => {
            if (cancel.current) return;
            setError(e.message);
            setLoading(false);
          },
        );
      } catch (e) {
        if (cancel.current) return;
        setError(
          e instanceof Error ? e.message : "Failed to open Firestore",
        );
        setLoading(false);
      }
    });

    return () => {
      cancel.current = true;
      unsub?.();
    };
  }, [user, profile, isAdmin, uid]);

  useEffect(() => {
    if (!tasksReady || !activeJiraProject || !hasJira) return;
    void importFromJira(false);
  }, [tasksReady, activeJiraProject, hasJira, importFromJira]);

  function taskRef(taskId: string) {
    const teamId = profile?.teamId || DEMO_PROJECT_ID;
    return doc(getFirestoreDb(), "projects", teamId, "tasks", taskId);
  }

  function canEditTaskDetails(data: TaskDoc) {
    return isAdmin || data.assigneeUid === uid;
  }

  async function syncTaskToJira(
    task: TaskDoc,
    patch: Record<string, unknown>,
  ): Promise<void> {
    if (!jiraAuth || !hasJira || !task.jiraIssueKey) return;
    const issueKey = task.jiraIssueKey;
    try {
      const fields: {
        summary?: string;
        description?: string;
        priority?: TaskPriority;
      } = {};
      if (typeof patch.title === "string") fields.summary = patch.title;
      if (typeof patch.description === "string") {
        fields.description = patch.description;
      }
      if (typeof patch.priority === "string") {
        fields.priority = patch.priority as TaskPriority;
      }
      if (Object.keys(fields).length > 0) {
        await updateJiraIssue(jiraAuth, issueKey, fields, manualCreds);
      }
      if (typeof patch.status === "string") {
        await syncJiraIssueStatus(
          jiraAuth,
          issueKey,
          patch.status as TaskStatus,
          manualCreds,
        );
      }
    } catch (e) {
      setJiraNotice(
        e instanceof Error ? e.message : "Jira sync failed for this task.",
      );
    }
  }

  async function handleAddTask(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !title.trim()) return;
    if (!isAdmin && !hasJira) {
      setJiraNotice("Connect Jira in Settings to create tasks.");
      return;
    }
    if (!activeJiraProject && hasJira) {
      setJiraNotice("Select a Jira project below before creating a task.");
      return;
    }
    const now = serverTimestamp();
    const dueAt =
      dueLocal.trim() !== ""
        ? Timestamp.fromDate(new Date(dueLocal))
        : null;
    const assignee = isAdmin
      ? assigneeUid === ""
        ? null
        : assigneeUid
      : user.uid;
    const teamId = profile?.teamId || DEMO_PROJECT_ID;
    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();
    const ref = await addDoc(tasksCollection(teamId), {
      title: trimmedTitle,
      description: trimmedDescription,
      status: "todo" satisfies TaskStatus,
      priority,
      publishedByUid: user.uid,
      assigneeUid: assignee,
      assigneeLabel: "",
      createdAt: now,
      updatedAt: now,
      dueAt,
      completedAt: null,
      completedByUid: null,
      timeEstimateMinutes: null,
      timeSpentMinutes: null,
      jiraIssueKey: null,
    });

    if (hasJira && activeJiraProject && jiraAuth) {
      setJiraBusy(true);
      try {
        const created = await createJiraIssue(
          jiraAuth,
          {
            summary: trimmedTitle,
            description: trimmedDescription,
            priority,
            project_key: activeJiraProject,
          },
          manualCreds,
          activeJiraProject,
        );
        await updateDoc(ref, { jiraIssueKey: created.issue_key });
        setJiraNotice(`Created Jira issue ${created.issue_key}.`);
      } catch (err) {
        setJiraNotice(
          err instanceof Error
            ? err.message
            : "Task saved locally; Jira create failed.",
        );
      } finally {
        setJiraBusy(false);
      }
    }

    setTitle("");
    setDescription("");
    setDueLocal("");
    setAssigneeUid("");
  }

  async function patchTask(
    id: string,
    patch: Record<string, unknown>,
    current?: TaskDoc,
  ) {
    await updateDoc(taskRef(id), {
      ...patch,
      updatedAt: serverTimestamp(),
    });
    if (current) {
      await syncTaskToJira({ ...current, ...patch } as TaskDoc, patch);
    }
  }

  async function removeTask(id: string, data: TaskDoc) {
    if (hasJira && jiraAuth && data.jiraIssueKey) {
      setJiraBusy(true);
      try {
        await deleteJiraIssue(jiraAuth, data.jiraIssueKey, manualCreds);
      } catch (e) {
        setJiraNotice(
          e instanceof Error
            ? e.message
            : "Could not delete Jira issue; removing local task anyway.",
        );
      } finally {
        setJiraBusy(false);
      }
    }
    await deleteDoc(taskRef(id));
  }

  async function linkTaskToJira(id: string, data: TaskDoc) {
    if (!jiraAuth || !hasJira || data.jiraIssueKey) return;
    setJiraBusy(true);
    setJiraNotice(null);
    try {
      const created = await createJiraIssue(
        jiraAuth,
        {
          summary: data.title,
          description: data.description || "",
          priority: data.priority,
        },
        manualCreds,
        activeJiraProject,
      );
      await updateDoc(taskRef(id), { jiraIssueKey: created.issue_key });
      setJiraNotice(`Linked to Jira issue ${created.issue_key}.`);
    } catch (e) {
      setJiraNotice(
        e instanceof Error ? e.message : "Failed to create Jira issue.",
      );
    } finally {
      setJiraBusy(false);
    }
  }

  async function markDone(id: string, data: TaskDoc) {
    if (!user) return;
    await patchTask(
      id,
      {
        status: "done",
        completedAt: serverTimestamp(),
        completedByUid: user.uid,
      },
      data,
    );
  }

  async function reopenTask(id: string, data: TaskDoc) {
    await patchTask(
      id,
      {
        status: "todo",
        completedAt: null,
        completedByUid: null,
      },
      data,
    );
  }

  if (authLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-app-border border-t-app-accent" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (!profile) {
    return (
      <div className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-4 text-amber-100">
        <p className="font-medium">No Firestore profile</p>
        <p className="mt-1 text-sm">
          Your account exists in Auth but not in <code>users/{uid}</code>. If you
          should be admin, create that document in the Firebase Console with{" "}
          <code>role: &quot;admin&quot;</code>.
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

  const displayError = error ?? authCtxError;

  if (displayError) {
    return (
      <div className="rounded-xl border border-red-500/40 bg-red-950/40 p-4 text-red-100">
        <p className="font-medium">Error</p>
        <p className="mt-1 text-sm opacity-90">{displayError}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {jiraNotice ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
          {jiraNotice}
        </p>
      ) : null}
      {!hasJira ? (
        <p className="text-xs text-app-muted">
          Connect Jira in{" "}
          <a href="/settings" className="text-app-accent underline">
            Settings
          </a>{" "}
          to sync tasks with your board.
        </p>
      ) : (
        <div className="rounded-xl border border-app-border bg-app-elevated/80 p-4 ring-1 ring-white/[0.04]">
          <p className="text-sm font-medium text-app-text">Jira</p>
          <p className="mt-1 text-xs text-app-muted">
            Connected to {jiraDisplayLabel(jiraConnection, profile) ?? "Jira"}
            {jiraBusy ? " · syncing…" : ""}
          </p>
          {jiraProjects.length > 0 ? (
            <div className="mt-3">
              <label className="mb-1 block text-xs font-medium text-app-muted">
                Your Jira projects
              </label>
              <select
                value={activeJiraProject}
                onChange={(e) => void handleJiraProjectSelect(e.target.value)}
                className="w-full max-w-md rounded-lg border border-app-border bg-app-bg px-3 py-2 text-sm text-app-text"
              >
                {jiraProjects.map((p) => (
                  <option key={p.id} value={p.key}>
                    {p.key} — {p.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <p className="mt-2 text-xs text-app-muted">Loading projects…</p>
          )}
          {activeJiraProject ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={jiraBusy}
                onClick={() => {
                  jiraIssuesLoadKeyRef.current = null;
                  void loadJiraLiveIssues(true);
                }}
                className="rounded-lg border border-app-border px-3 py-1.5 text-xs font-medium text-app-text hover:border-app-accent disabled:opacity-50"
              >
                Refresh Jira list
              </button>
              <button
                type="button"
                disabled={jiraBusy}
                onClick={() => {
                  jiraImportKeyRef.current = null;
                  void importFromJira(true);
                }}
                className="rounded-lg border border-app-accent/40 px-3 py-1.5 text-xs font-medium text-app-accent hover:bg-app-accent/10 disabled:opacity-50"
              >
                Import into task board
              </button>
            </div>
          ) : null}
          {jiraLiveIssues.length > 0 ? (
            <div className="mt-4">
              <h3 className="text-xs font-medium uppercase tracking-wide text-app-muted">
                Issues in {activeJiraProject} ({jiraLiveIssues.length})
              </h3>
              <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-sm">
                {jiraLiveIssues.map((issue) => (
                  <li
                    key={issue.issue_key}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-app-border/60 bg-app-bg/80 px-2 py-1.5"
                  >
                    <span className="text-app-text">{issue.summary}</span>
                    <span className="text-xs text-app-muted">
                      <a
                        href={issue.url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-app-accent underline"
                      >
                        {issue.issue_key}
                      </a>
                      {" · "}
                      {issue.status}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : activeJiraProject && !jiraBusy ? (
            <p className="mt-3 text-xs text-app-muted">
              No issues in project {activeJiraProject} (or still loading).
            </p>
          ) : null}
        </div>
      )}

      <p className="text-sm text-app-muted">
        Signed in as <span className="font-medium text-app-text">{profile.displayName}</span> ·{" "}
        <span className="capitalize text-app-accent">{profile.role}</span>
        {profile.teamId ? (
          <>
            {" "}· Team: <span className="font-medium text-app-text">{profile.teamId}</span>
          </>
        ) : (
          <>
            {" "}· <span className="text-amber-500">No Team ID</span>
          </>
        )}
      </p>

      {isAdmin || hasJira ? (
        <form
          onSubmit={handleAddTask}
          className="flex flex-col gap-3 rounded-xl border border-app-border bg-app-elevated/80 p-4 ring-1 ring-white/[0.04]"
        >
          <p className="text-sm font-medium text-app-text">
            {isAdmin ? "Publish task (admin)" : "Create task in Jira"}
          </p>
          {!isAdmin && activeJiraProject ? (
            <p className="text-xs text-app-muted">
              New tasks are assigned to you and created in project{" "}
              <span className="font-mono text-app-accent">{activeJiraProject}</span>.
            </p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              <span className="text-app-muted">Title</span>
              <input
                className="rounded-lg border border-app-border bg-app-bg px-3 py-2 text-app-text placeholder:text-app-muted focus:border-app-accent focus:outline-none focus:ring-1 focus:ring-app-accent"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What should be done?"
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              <span className="text-app-muted">Description / app scope</span>
              <textarea
                className="min-h-[100px] rounded-lg border border-app-border bg-app-bg px-3 py-2 text-sm text-app-text placeholder:text-app-muted focus:border-app-accent focus:outline-none focus:ring-1 focus:ring-app-accent"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the work, acceptance criteria, or app requirements…"
                rows={4}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-app-muted">Due (local)</span>
              <input
                type="datetime-local"
                className="rounded-lg border border-app-border bg-app-bg px-3 py-2 text-app-text focus:border-app-accent focus:outline-none focus:ring-1 focus:ring-app-accent"
                value={dueLocal}
                onChange={(e) => setDueLocal(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-app-muted">Priority</span>
              <select
                className="rounded-lg border border-app-border bg-app-bg px-3 py-2 text-app-text focus:border-app-accent focus:outline-none focus:ring-1 focus:ring-app-accent"
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            {isAdmin ? (
              <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                <span className="text-app-muted">Assign to</span>
                <select
                  className="rounded-lg border border-app-border bg-app-bg px-3 py-2 text-app-text focus:border-app-accent focus:outline-none focus:ring-1 focus:ring-app-accent"
                  value={assigneeUid}
                  onChange={(e) => setAssigneeUid(e.target.value)}
                >
                  <option value="">Unassigned</option>
                  {workers.map((w) => (
                    <option key={w.uid} value={w.uid}>
                      {w.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
          <button
            type="submit"
            disabled={jiraBusy || (hasJira && !activeJiraProject)}
            className="w-fit rounded-lg bg-app-accent px-4 py-2 text-sm font-semibold text-app-on-accent hover:bg-app-accent-bright disabled:opacity-50"
          >
            {hasJira ? "Create task & send to Jira" : "Publish task"}
          </button>
        </form>
      ) : null}

      <div>
        <h2 className="text-sm font-medium text-app-muted">
          {loading
            ? "Loading tasks…"
            : `${items.length} task(s)${isAdmin ? "" : " assigned to you"}`}
        </h2>
        <ul className="mt-3 space-y-3">
          {items.map(({ id, data }) => (
            <li
              key={id}
              className="rounded-xl border border-app-border bg-app-elevated/60 p-4 ring-1 ring-white/[0.04]"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1 space-y-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-app-muted">Title</span>
                    {canEditTaskDetails(data) ? (
                      <input
                        className="rounded-lg border border-app-border bg-app-bg px-2 py-1.5 text-sm font-medium text-app-text focus:border-app-accent focus:outline-none focus:ring-1 focus:ring-app-accent"
                        defaultValue={data.title}
                        onBlur={(e) => {
                          const next = e.target.value.trim();
                          if (next && next !== data.title) {
                            void patchTask(id, { title: next }, data);
                          }
                        }}
                      />
                    ) : (
                      <p className="font-medium text-app-text">{data.title}</p>
                    )}
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-app-muted">
                      Description / app scope
                    </span>
                    {canEditTaskDetails(data) ? (
                      <textarea
                        className="min-h-[80px] rounded-lg border border-app-border bg-app-bg px-2 py-1.5 text-sm text-app-text focus:border-app-accent focus:outline-none focus:ring-1 focus:ring-app-accent"
                        defaultValue={data.description}
                        placeholder="Add or update the task or app description…"
                        rows={3}
                        onBlur={(e) => {
                          const next = e.target.value.trim();
                          if (next !== (data.description || "").trim()) {
                            void patchTask(id, { description: next }, data);
                          }
                        }}
                      />
                    ) : data.description ? (
                      <p className="whitespace-pre-wrap text-sm text-app-muted">
                        {data.description}
                      </p>
                    ) : (
                      <p className="text-sm italic text-app-muted">No description</p>
                    )}
                  </label>
                  <p className="text-xs text-app-muted">
                    Updated: {formatTs(data.updatedAt)}
                    {data.dueAt ? (
                      <>
                        {" "}
                        · Due: {formatTs(data.dueAt)}
                      </>
                    ) : null}
                  </p>
                  {data.completedAt ? (
                    <p className="mt-1 text-xs text-app-accent">
                      Completed: {formatTs(data.completedAt)}
                      {data.completedByUid
                        ? ` · by ${data.completedByUid.slice(0, 8)}…`
                        : null}
                    </p>
                  ) : null}
                  {data.jiraIssueKey ? (
                    <p className="mt-1 text-xs text-amber-400/90">
                      Jira:{" "}
                      <a
                        href={`${jiraBrowseBase}/browse/${data.jiraIssueKey}`}
                        target="_blank"
                        rel="noreferrer"
                        className="underline hover:text-amber-300"
                      >
                        {data.jiraIssueKey}
                      </a>
                    </p>
                  ) : isAdmin && hasJira ? (
                    <button
                      type="button"
                      disabled={jiraBusy}
                      onClick={() => void linkTaskToJira(id, data)}
                      className="mt-1 text-xs text-app-accent underline hover:text-app-accent-bright disabled:opacity-50"
                    >
                      Create in Jira
                    </button>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {!isAdmin && data.status !== "done" ? (
                    <button
                      type="button"
                      onClick={() => void markDone(id, data)}
                      className="rounded-lg bg-app-accent px-3 py-1.5 text-sm font-medium text-app-on-accent hover:bg-app-accent-bright"
                    >
                      Mark done
                    </button>
                  ) : null}
                  {isAdmin && data.status === "done" ? (
                    <button
                      type="button"
                      onClick={() => void reopenTask(id, data)}
                      className="text-sm text-app-muted underline hover:text-app-accent"
                    >
                      Reopen
                    </button>
                  ) : null}
                  {isAdmin ? (
                    <button
                      type="button"
                      onClick={() => void removeTask(id, data)}
                      className="text-sm text-red-400 hover:underline"
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-app-muted">Status</span>
                  <select
                    disabled={!isAdmin}
                    className="rounded-lg border border-app-border bg-app-bg px-2 py-1.5 text-sm text-app-text disabled:opacity-60"
                    value={data.status}
                    onChange={(e) =>
                      void patchTask(
                        id,
                        { status: e.target.value as TaskStatus },
                        data,
                      )
                    }
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s.replace("_", " ")}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-app-muted">Priority</span>
                  <select
                    disabled={!isAdmin}
                    className="rounded-lg border border-app-border bg-app-bg px-2 py-1.5 text-sm text-app-text disabled:opacity-60"
                    value={data.priority}
                    onChange={(e) =>
                      void patchTask(
                        id,
                        { priority: e.target.value as TaskPriority },
                        data,
                      )
                    }
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-app-muted">Est. minutes</span>
                  <input
                    type="number"
                    min={0}
                    disabled={!isAdmin}
                    className="rounded-lg border border-app-border bg-app-bg px-2 py-1.5 text-sm text-app-text disabled:opacity-60"
                    value={data.timeEstimateMinutes ?? ""}
                    onChange={(e) =>
                      patchTask(id, {
                        timeEstimateMinutes: e.target.value
                          ? Number(e.target.value)
                          : null,
                      })
                    }
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-app-muted">Spent minutes</span>
                  <input
                    type="number"
                    min={0}
                    className="rounded-lg border border-app-border bg-app-bg px-2 py-1.5 text-sm text-app-text"
                    value={data.timeSpentMinutes ?? ""}
                    onChange={(e) =>
                      patchTask(id, {
                        timeSpentMinutes: e.target.value
                          ? Number(e.target.value)
                          : null,
                      })
                    }
                  />
                </label>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
