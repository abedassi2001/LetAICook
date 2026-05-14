"use client";

import { useAuth } from "@/contexts/auth-context";
import { getPublicApiBaseUrl } from "@/lib/api-base";
import { buildJiraAuthHeaders } from "@/lib/jira-client";
import { getFirestoreDb } from "@/lib/firebase";
import {
  PLANNING_CONTEXT_KEY,
  PLANNING_PROJECT_DESCRIPTION_KEY,
  PLANNING_SYNC_EVENT,
  buildProjectDescriptionFromMessages,
  clearPlanningSessionStorage,
  readPlanningSessionOwnerUid,
  readPlanningSessionSavedAt,
  writePlanningSessionOwnerUid,
  writePlanningSessionSavedAt,
} from "@/lib/planning-sync";
import {
  PLANNING_CHAT_COLLECTION,
  PLANNING_CHAT_DOC_ID,
  PLANNING_INTRO_MESSAGE,
  parsePlanningMessages,
  readPlanningMessagesFromSession,
  type PlanningChatMessage,
} from "@/lib/planning-chat-model";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const FIRESTORE_DEBOUNCE_MS = 800;

export function PlanningChat() {
  const { user, profile } = useAuth();
  const [messages, setMessages] = useState<PlanningChatMessage[] | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jiraInstruction, setJiraInstruction] = useState("");
  const [jiraJql, setJiraJql] = useState("");
  const [jiraBusy, setJiraBusy] = useState(false);
  const [jiraNotice, setJiraNotice] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const planningRef = useMemo(() => {
    if (!user) return null;
    return doc(
      getFirestoreDb(),
      "users",
      user.uid,
      PLANNING_CHAT_COLLECTION,
      PLANNING_CHAT_DOC_ID,
    );
  }, [user]);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      let sessionMsgs = readPlanningMessagesFromSession();
      const sessionAt = readPlanningSessionSavedAt();
      const ownerUid = readPlanningSessionOwnerUid();
      if (user) {
        const sessionOk =
          !ownerUid ||
          ownerUid === user.uid ||
          ownerUid === "__anon__";
        if (!sessionOk) {
          sessionMsgs = null;
        }
      }

      let chosen: PlanningChatMessage[] = sessionMsgs ?? [PLANNING_INTRO_MESSAGE];

      if (user) {
        const ref = doc(
          getFirestoreDb(),
          "users",
          user.uid,
          PLANNING_CHAT_COLLECTION,
          PLANNING_CHAT_DOC_ID,
        );
        try {
          const snap = await getDoc(ref);
          if (cancelled) return;

          if (snap.exists()) {
            const data = snap.data();
            const fsMsgs = parsePlanningMessages(data.messages);
            const rawTs = data.updatedAt as { toMillis?: () => number } | undefined;
            const fsMs = typeof rawTs?.toMillis === "function" ? rawTs.toMillis() : 0;

            if (fsMsgs && fsMsgs.length > 0) {
              if (sessionMsgs && sessionMsgs.length > 0 && sessionAt > fsMs) {
                chosen = sessionMsgs;
              } else {
                chosen = fsMsgs;
              }
            } else if (sessionMsgs && sessionMsgs.length > 0) {
              chosen = sessionMsgs;
            }
          } else if (sessionMsgs && sessionMsgs.length > 0) {
            chosen = sessionMsgs;
          }
        } catch {
          if (!cancelled) {
            chosen = sessionMsgs ?? [PLANNING_INTRO_MESSAGE];
          }
        }
      }

      if (!cancelled) {
        setMessages(chosen);
      }
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (messages === null) return;
    try {
      sessionStorage.setItem(PLANNING_CONTEXT_KEY, JSON.stringify(messages));
      writePlanningSessionSavedAt(Date.now());
      if (user) {
        writePlanningSessionOwnerUid(user.uid);
      } else {
        writePlanningSessionOwnerUid("__anon__");
      }
      const desc = buildProjectDescriptionFromMessages(messages);
      sessionStorage.setItem(PLANNING_PROJECT_DESCRIPTION_KEY, desc);
      window.dispatchEvent(new Event(PLANNING_SYNC_EVENT));
    } catch {
      /* private mode / quota */
    }
  }, [messages, user]);

  useEffect(() => {
    if (messages === null || !user || !planningRef) return;
    const id = window.setTimeout(() => {
      void setDoc(
        planningRef,
        {
          ownerUid: user.uid,
          messages,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    }, FIRESTORE_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [messages, user, planningRef]);

  function newConversation() {
    clearPlanningSessionStorage();
    setMessages([PLANNING_INTRO_MESSAGE]);
    setInput("");
    setError(null);
    if (user && planningRef) {
      void setDoc(planningRef, {
        ownerUid: user.uid,
        messages: [PLANNING_INTRO_MESSAGE],
        updatedAt: serverTimestamp(),
      });
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || sending || messages === null) return;

    const nextHistory: PlanningChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(nextHistory);
    setInput("");
    setError(null);
    setSending(true);

    try {
      const res = await fetch(`${getPublicApiBaseUrl()}/chat/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextHistory.map(({ role, content }) => ({ role, content })),
        }),
      });

      const raw = await res.text();
      let detail: string | undefined;
      try {
        const parsed = JSON.parse(raw) as { detail?: unknown; message?: string };
        if (typeof parsed.detail === "string") detail = parsed.detail;
        else if (Array.isArray(parsed.detail)) detail = parsed.detail.map(String).join(" ");
      } catch {
        /* not JSON */
      }

      if (!res.ok) {
        throw new Error(detail || raw || `Request failed (${res.status})`);
      }

      const data = JSON.parse(raw) as { message: string };
      if (!data.message) throw new Error("Invalid response from API.");

      setMessages((prev) =>
        prev === null ? prev : [...prev, { role: "assistant", content: data.message }],
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setMessages((prev) => (prev === null ? prev : prev.slice(0, -1)));
      setInput(text);
    } finally {
      setSending(false);
    }
  }

  const jiraReady = Boolean(user && buildJiraAuthHeaders(profile ?? null));

  async function runJiraAiSync() {
    const h = buildJiraAuthHeaders(profile ?? null);
    if (!h) {
      setJiraNotice("Add your Jira site, email, and API token under Settings → Jira Integration.");
      return;
    }
    const ins = jiraInstruction.trim();
    if (!ins) {
      setJiraNotice("Describe what the AI should change in your Jira issues.");
      return;
    }
    setJiraBusy(true);
    setJiraNotice(null);
    try {
      const res = await fetch(`${getPublicApiBaseUrl()}/jira/ai-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...h },
        body: JSON.stringify({
          instruction: ins,
          ...(jiraJql.trim() ? { jql: jiraJql.trim() } : {}),
        }),
      });
      const raw = await res.text();
      let detail: string | undefined;
      try {
        const parsed = JSON.parse(raw) as { detail?: unknown };
        if (typeof parsed.detail === "string") detail = parsed.detail;
      } catch {
        /* */
      }
      if (!res.ok) throw new Error(detail || raw || `Request failed (${res.status})`);
      const data = JSON.parse(raw) as {
        results: Array<{
          issue_key: string;
          updated_fields: string[];
          transitioned_to?: string | null;
          error?: string | null;
        }>;
        issues_considered: string[];
      };
      const parts = data.results.map((r) => {
        const bits = [r.issue_key];
        if (r.error) bits.push(`error: ${r.error}`);
        else {
          if (r.updated_fields?.length) bits.push(`updated: ${r.updated_fields.join(", ")}`);
          if (r.transitioned_to) bits.push(`→ ${r.transitioned_to}`);
        }
        return bits.join(" — ");
      });
      setJiraNotice(
        data.results.length
          ? `Done. ${parts.join(" | ")}`
          : `No changes proposed for ${data.issues_considered.length} issue(s). Try a clearer instruction.`,
      );
    } catch (e) {
      setJiraNotice(e instanceof Error ? e.message : "Jira AI sync failed.");
    } finally {
      setJiraBusy(false);
    }
  }

  if (messages === null) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center bg-app-bg px-4">
        <p className="text-sm text-app-muted">Loading planning chat…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-app-bg">
      {/* Top bar — ChatGPT-style */}
      <header className="shrink-0 border-b border-app-border bg-app-bg/90 px-4 py-3 backdrop-blur-md lg:px-6">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <div>
            <h1 className="text-sm font-semibold text-app-text">Planning assistant</h1>
            <p className="text-xs text-app-muted">Project kickoff & task flow · Uses Gemini on the server</p>
          </div>
          <button
            type="button"
            onClick={newConversation}
            className="rounded-lg border border-app-border bg-app-elevated px-3 py-1.5 text-xs font-medium text-app-text hover:border-app-accent/50 hover:text-app-accent"
          >
            New chat
          </button>
        </div>
      </header>

      {/* Message stream */}
      <div
        className="min-h-0 flex-1 overflow-y-auto"
        role="log"
        aria-live="polite"
      >
        <div className="mx-auto max-w-3xl px-4 py-6 lg:px-6">
          <div className="space-y-6">
            {messages.map((m, i) => (
              <div
                key={`${i}-${m.role}-${m.content.slice(0, 20)}`}
                className={`flex gap-4 ${m.role === "user" ? "flex-row-reverse" : "flex-row"}`}
              >
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-xs font-bold ${
                    m.role === "user"
                      ? "bg-app-accent/25 text-app-accent"
                      : "bg-app-elevated text-app-accent ring-1 ring-app-border"
                  }`}
                  aria-hidden
                >
                  {m.role === "user" ? "You" : "AI"}
                </div>
                <div
                  className={`min-w-0 flex-1 pt-0.5 ${
                    m.role === "user" ? "text-right" : "text-left"
                  }`}
                >
                  <div
                    className={`inline-block max-w-[min(100%,42rem)] rounded-2xl px-4 py-3 text-[15px] leading-relaxed ${
                      m.role === "user"
                        ? "bg-app-elevated text-app-text ring-1 ring-app-accent/25"
                        : "bg-transparent text-app-text"
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{m.content}</div>
                  </div>
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        </div>
      </div>

      {error ? (
        <div className="shrink-0 border-t border-red-500/30 bg-red-950/40 px-4 py-2 text-center text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {user ? (
        <div className="shrink-0 border-t border-app-border bg-app-bg/80 px-4 py-3 lg:px-6">
          <div className="mx-auto max-w-3xl rounded-xl border border-app-border/80 bg-app-elevated/60 p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-app-muted">Jira · AI apply changes</h2>
            <p className="mt-1 text-[11px] text-app-muted">
              Uses your saved API token from Settings. The model reads matching issues, proposes edits, and updates Jira
              on your behalf.
            </p>
            {!jiraReady ? (
              <p className="mt-2 text-sm text-amber-200/90">Complete Jira Integration in Settings (domain, email, token).</p>
            ) : (
              <div className="mt-3 space-y-2">
                <textarea
                  className="w-full rounded-lg border border-app-border bg-app-bg px-3 py-2 text-sm text-app-text outline-none focus:border-app-accent"
                  rows={2}
                  placeholder="Instruction, e.g. prepend [Discovery] to summaries of all listed issues"
                  value={jiraInstruction}
                  onChange={(e) => setJiraInstruction(e.target.value)}
                  disabled={jiraBusy}
                />
                <input
                  className="w-full rounded-lg border border-app-border bg-app-bg px-3 py-2 font-mono text-xs text-app-text outline-none focus:border-app-accent"
                  placeholder="Optional JQL (default: open issues in your default project)"
                  value={jiraJql}
                  onChange={(e) => setJiraJql(e.target.value)}
                  disabled={jiraBusy}
                />
                <button
                  type="button"
                  disabled={jiraBusy}
                  onClick={() => void runJiraAiSync()}
                  className="rounded-lg bg-app-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-app-accent/90 disabled:opacity-50"
                >
                  {jiraBusy ? "Running…" : "Pull issues & apply with AI"}
                </button>
                {jiraNotice ? (
                  <p className="whitespace-pre-wrap text-xs text-app-text/90">{jiraNotice}</p>
                ) : null}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* Composer */}
      <div className="shrink-0 border-t border-app-border bg-gradient-to-t from-app-bg via-app-bg to-transparent px-4 pb-6 pt-3 lg:px-6">
        <form
          className="mx-auto flex max-w-3xl gap-2 rounded-2xl border border-app-border bg-app-elevated p-2 shadow-lg shadow-black/40 ring-1 ring-white/[0.04] focus-within:border-app-accent/40 focus-within:ring-app-accent/20"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <label className="sr-only" htmlFor="plan-chat-input">
            Message
          </label>
          <textarea
            id="plan-chat-input"
            rows={1}
            className="max-h-40 min-h-[48px] flex-1 resize-none bg-transparent px-3 py-3 text-[15px] text-app-text placeholder:text-app-muted focus:outline-none"
            placeholder="Message your planning assistant…"
            value={input}
            disabled={sending}
            onChange={(e) => setInput(e.target.value)}
            onInput={(e) => {
              const t = e.target as HTMLTextAreaElement;
              t.style.height = "0px";
              t.style.height = `${Math.min(t.scrollHeight, 160)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="mt-auto flex h-11 w-11 shrink-0 items-center justify-center self-end rounded-xl bg-app-accent text-app-on-accent hover:bg-app-accent-bright disabled:opacity-40"
            aria-label="Send"
          >
            {sending ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-app-on-accent/30 border-t-app-on-accent" />
            ) : (
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            )}
          </button>
        </form>
        <p className="mx-auto mt-2 max-w-3xl text-center text-[11px] text-app-muted">
          API: <span className="text-app-accent/80">{getPublicApiBaseUrl()}</span> · Requires{" "}
          <code className="rounded bg-app-elevated px-1 text-app-muted">GOOGLE_API_KEY</code> on the server
          {user ? (
            <>
              {" "}
              · Chat syncs to your account
            </>
          ) : null}
        </p>
      </div>
    </div>
  );
}
