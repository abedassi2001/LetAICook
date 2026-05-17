"use client";

import { useAuth } from "@/contexts/auth-context";
import { getPublicApiBaseUrl } from "@/lib/api-base";
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
import { motion, AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const FIRESTORE_DEBOUNCE_MS = 800;

export function PlanningChat() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<PlanningChatMessage[] | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      <header className="shrink-0 border-b border-app-border/80 bg-app-sidebar/40 px-4 py-4 backdrop-blur-xl lg:px-6">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-app-accent">
              Planning
            </p>
            <h1 className="text-base font-semibold text-app-text">AI assistant</h1>
            <p className="text-xs text-app-muted">Project kickoff · Powered by Gemini</p>
          </div>
          <button type="button" onClick={newConversation} className="btn-secondary px-3 py-1.5 text-xs">
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
            <AnimatePresence initial={false}>
              {messages.map((m, i) => (
                <motion.div
                  key={`${i}-${m.role}-${m.content.slice(0, 20)}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className={`flex gap-4 ${m.role === "user" ? "flex-row-reverse" : "flex-row"}`}
                >
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${
                    m.role === "user"
                      ? "bg-gradient-to-br from-app-accent/30 to-app-accent-dim/20 text-app-accent-bright ring-1 ring-app-accent/30"
                      : "glass-panel text-app-violet"
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
                        ? "glass-panel text-app-text ring-1 ring-app-accent/20"
                        : "text-app-text"
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{m.content}</div>
                  </div>
                </div>
              </motion.div>
              ))}
            </AnimatePresence>
            <div ref={bottomRef} />
          </div>
        </div>
      </div>

      {error ? (
        <div className="shrink-0 border-t border-red-500/30 bg-red-950/40 px-4 py-2 text-center text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {/* Composer */}
      <div className="shrink-0 border-t border-app-border bg-gradient-to-t from-app-bg via-app-bg to-transparent px-4 pb-6 pt-3 lg:px-6">
        <form
          className="glass-panel-strong mx-auto flex max-w-3xl gap-2 rounded-2xl p-2 focus-within:ring-app-accent/30"
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
            className="btn-primary mt-auto flex h-11 w-11 shrink-0 items-center justify-center self-end rounded-xl !p-0 disabled:opacity-40"
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
