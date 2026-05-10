"use client";

import { useAuth } from "@/contexts/auth-context";
import { getFirestoreDb } from "@/lib/firebase";
import {
  DEMO_PROJECT_ID,
  type TaskDoc,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/task-model";
import { USERS_COLLECTION, type UserProfileDoc } from "@/lib/user-model";
import { useEffect, useState } from "react";
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
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [dueLocal, setDueLocal] = useState("");
  const [assigneeUid, setAssigneeUid] = useState<string>("");

  const isAdmin = profile?.role === "admin";
  const uid = user?.uid ?? "";

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
  }, [isAdmin]);

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

  async function handleAddTask(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !isAdmin || !title.trim()) return;
    const now = serverTimestamp();
    const dueAt =
      dueLocal.trim() !== ""
        ? Timestamp.fromDate(new Date(dueLocal))
        : null;
    const assignee = assigneeUid === "" ? null : assigneeUid;
    const teamId = profile?.teamId || DEMO_PROJECT_ID;
    await addDoc(tasksCollection(teamId), {
      title: title.trim(),
      description: "",
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
    setTitle("");
    setDueLocal("");
    setAssigneeUid("");
  }

  async function patchTask(id: string, patch: Record<string, unknown>) {
    const teamId = profile?.teamId || DEMO_PROJECT_ID;
    const ref = doc(
      getFirestoreDb(),
      "projects",
      teamId,
      "tasks",
      id,
    );
    await updateDoc(ref, {
      ...patch,
      updatedAt: serverTimestamp(),
    });
  }

  async function removeTask(id: string) {
    const teamId = profile?.teamId || DEMO_PROJECT_ID;
    const ref = doc(
      getFirestoreDb(),
      "projects",
      teamId,
      "tasks",
      id,
    );
    await deleteDoc(ref);
  }

  async function markDone(id: string) {
    if (!user) return;
    await patchTask(id, {
      status: "done",
      completedAt: serverTimestamp(),
      completedByUid: user.uid,
    });
  }

  async function reopenTask(id: string) {
    await patchTask(id, {
      status: "todo",
      completedAt: null,
      completedByUid: null,
    });
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

      {isAdmin ? (
        <form
          onSubmit={handleAddTask}
          className="flex flex-col gap-3 rounded-xl border border-app-border bg-app-elevated/80 p-4 ring-1 ring-white/[0.04]"
        >
          <p className="text-sm font-medium text-app-text">Publish task (admin)</p>
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
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              <span className="text-app-muted">Assign to</span>
              <select
                className="rounded-lg border border-app-border bg-app-bg px-3 py-2 text-app-text focus:border-app-accent focus:outline-none focus:ring-1 focus:ring-app-accent"
                value={assigneeUid}
                onChange={(e) => setAssigneeUid(e.target.value)}
              >
                <option value="">Unassigned (admin only)</option>
                {workers.map((w) => (
                  <option key={w.uid} value={w.uid}>
                    {w.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="submit"
            className="w-fit rounded-lg bg-app-accent px-4 py-2 text-sm font-semibold text-app-on-accent hover:bg-app-accent-bright"
          >
            Publish task
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
                <div>
                  <p className="font-medium text-app-text">
                    {data.title}
                  </p>
                  <p className="mt-1 text-xs text-app-muted">
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
                      Jira: {data.jiraIssueKey}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {!isAdmin && data.status !== "done" ? (
                    <button
                      type="button"
                      onClick={() => markDone(id)}
                      className="rounded-lg bg-app-accent px-3 py-1.5 text-sm font-medium text-app-on-accent hover:bg-app-accent-bright"
                    >
                      Mark done
                    </button>
                  ) : null}
                  {isAdmin && data.status === "done" ? (
                    <button
                      type="button"
                      onClick={() => reopenTask(id)}
                      className="text-sm text-app-muted underline hover:text-app-accent"
                    >
                      Reopen
                    </button>
                  ) : null}
                  {isAdmin ? (
                    <button
                      type="button"
                      onClick={() => removeTask(id)}
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
                      patchTask(id, { status: e.target.value as TaskStatus })
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
                      patchTask(id, {
                        priority: e.target.value as TaskPriority,
                      })
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
