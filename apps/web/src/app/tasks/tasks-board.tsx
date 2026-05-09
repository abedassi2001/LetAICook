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

function tasksCollection() {
  return collection(
    getFirestoreDb(),
    "projects",
    DEMO_PROJECT_ID,
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
  const {
    user,
    profile,
    loading: authLoading,
    error: authCtxError,
    signInEmail,
    signUpEmail,
    signOutUser,
  } = useAuth();

  const [items, setItems] = useState<{ id: string; data: TaskDoc }[]>([]);
  const [workers, setWorkers] = useState<WorkerOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [authBusy, setAuthBusy] = useState(false);

  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [dueLocal, setDueLocal] = useState("");
  const [assigneeUid, setAssigneeUid] = useState<string>("");

  const isAdmin = profile?.role === "admin";
  const uid = user?.uid ?? "";

  useEffect(() => {
    if (!isAdmin) return;
    const q = query(
      collection(getFirestoreDb(), USERS_COLLECTION),
      where("role", "==", "worker"),
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
        const base = tasksCollection();
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

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    setAuthBusy(true);
    setError(null);
    try {
      if (authMode === "signin") {
        await signInEmail(email, password);
      } else {
        await signUpEmail(email, password, displayName);
      }
      setPassword("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Authentication failed");
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleAddTask(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !isAdmin || !title.trim()) return;
    const now = serverTimestamp();
    const dueAt =
      dueLocal.trim() !== ""
        ? Timestamp.fromDate(new Date(dueLocal))
        : null;
    const assignee = assigneeUid === "" ? null : assigneeUid;
    await addDoc(tasksCollection(), {
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
    const ref = doc(
      getFirestoreDb(),
      "projects",
      DEMO_PROJECT_ID,
      "tasks",
      id,
    );
    await updateDoc(ref, {
      ...patch,
      updatedAt: serverTimestamp(),
    });
  }

  async function removeTask(id: string) {
    const ref = doc(
      getFirestoreDb(),
      "projects",
      DEMO_PROJECT_ID,
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
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Checking session…
      </p>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-md space-y-4 rounded-xl border border-zinc-200 bg-zinc-50/80 p-6 dark:border-zinc-800 dark:bg-zinc-900/40">
        <div className="flex gap-2 text-sm">
          <button
            type="button"
            className={`rounded-full px-3 py-1 ${authMode === "signin" ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-600"}`}
            onClick={() => setAuthMode("signin")}
          >
            Sign in
          </button>
          <button
            type="button"
            className={`rounded-full px-3 py-1 ${authMode === "signup" ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-600"}`}
            onClick={() => setAuthMode("signup")}
          >
            Sign up
          </button>
        </div>
        <form className="space-y-3" onSubmit={handleAuth}>
          {authMode === "signup" ? (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-zinc-600 dark:text-zinc-400">Name</span>
              <input
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
              />
            </label>
          ) : null}
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">Email</span>
            <input
              type="email"
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">Password</span>
            <input
              type="password"
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={
                authMode === "signin" ? "current-password" : "new-password"
              }
            />
          </label>
          <button
            type="submit"
            disabled={authBusy}
            className="w-full rounded-md bg-zinc-900 py-2 text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {authBusy ? "Please wait…" : authMode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>
        <p className="text-xs text-zinc-500">
          New accounts are <strong>workers</strong>. Promote an admin in
          Firestore <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">users/{"{uid}"}</code>{" "}
          → <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">role: &quot;admin&quot;</code>.
        </p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
        <p className="font-medium">No Firestore profile</p>
        <p className="mt-1 text-sm">
          Your account exists in Auth but not in <code>users/{uid}</code>. If you
          should be admin, create that document in the Firebase Console with{" "}
          <code>role: &quot;admin&quot;</code>.
        </p>
        <button
          type="button"
          onClick={() => signOutUser()}
          className="mt-3 text-sm underline"
        >
          Sign out
        </button>
      </div>
    );
  }

  const displayError = error ?? authCtxError;

  if (displayError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100">
        <p className="font-medium">Error</p>
        <p className="mt-1 text-sm opacity-90">{displayError}</p>
        <button
          type="button"
          onClick={() => signOutUser()}
          className="mt-3 text-sm underline"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <div>
          <p className="text-zinc-600 dark:text-zinc-400">
            Signed in as <strong>{profile.displayName}</strong> ·{" "}
            <span className="capitalize">{profile.role}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => signOutUser()}
          className="rounded-md border border-zinc-300 px-3 py-1.5 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Sign out
        </button>
      </div>

      {isAdmin ? (
        <form
          onSubmit={handleAddTask}
          className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/40"
        >
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Publish task (admin)
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              <span className="text-zinc-600 dark:text-zinc-400">Title</span>
              <input
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What should be done?"
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-zinc-600 dark:text-zinc-400">Due (local)</span>
              <input
                type="datetime-local"
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
                value={dueLocal}
                onChange={(e) => setDueLocal(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-zinc-600 dark:text-zinc-400">Priority</span>
              <select
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
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
              <span className="text-zinc-600 dark:text-zinc-400">Assign to</span>
              <select
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
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
            className="w-fit rounded-md bg-zinc-900 px-4 py-2 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            Publish task
          </button>
        </form>
      ) : null}

      <div>
        <h2 className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
          {loading
            ? "Loading tasks…"
            : `${items.length} task(s)${isAdmin ? "" : " assigned to you"}`}
        </h2>
        <ul className="mt-3 space-y-3">
          {items.map(({ id, data }) => (
            <li
              key={id}
              className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-medium text-zinc-900 dark:text-zinc-50">
                    {data.title}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Updated: {formatTs(data.updatedAt)}
                    {data.dueAt ? (
                      <>
                        {" "}
                        · Due: {formatTs(data.dueAt)}
                      </>
                    ) : null}
                  </p>
                  {data.completedAt ? (
                    <p className="mt-1 text-xs text-green-700 dark:text-green-400">
                      Completed: {formatTs(data.completedAt)}
                      {data.completedByUid
                        ? ` · by ${data.completedByUid.slice(0, 8)}…`
                        : null}
                    </p>
                  ) : null}
                  {data.jiraIssueKey ? (
                    <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                      Jira: {data.jiraIssueKey}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {!isAdmin && data.status !== "done" ? (
                    <button
                      type="button"
                      onClick={() => markDone(id)}
                      className="rounded-md bg-green-700 px-3 py-1.5 text-sm text-white hover:bg-green-800"
                    >
                      Mark done
                    </button>
                  ) : null}
                  {isAdmin && data.status === "done" ? (
                    <button
                      type="button"
                      onClick={() => reopenTask(id)}
                      className="text-sm text-zinc-600 underline dark:text-zinc-400"
                    >
                      Reopen
                    </button>
                  ) : null}
                  {isAdmin ? (
                    <button
                      type="button"
                      onClick={() => removeTask(id)}
                      className="text-sm text-red-600 hover:underline dark:text-red-400"
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-zinc-500">Status</span>
                  <select
                    disabled={!isAdmin}
                    className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900"
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
                  <span className="text-zinc-500">Priority</span>
                  <select
                    disabled={!isAdmin}
                    className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900"
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
                  <span className="text-zinc-500">Est. minutes</span>
                  <input
                    type="number"
                    min={0}
                    disabled={!isAdmin}
                    className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900"
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
                  <span className="text-zinc-500">Spent minutes</span>
                  <input
                    type="number"
                    min={0}
                    className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
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
