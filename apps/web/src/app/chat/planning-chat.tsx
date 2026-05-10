"use client";

import { getPublicApiBaseUrl } from "@/lib/api-base";
import { useCallback, useEffect, useRef, useState } from "react";

type ChatRole = "user" | "assistant";

type ChatMessage = { role: ChatRole; content: string };

const INTRO: ChatMessage = {
  role: "assistant",
  content:
    "I can help you start a project and shape how work flows in letAIcook: milestones, first tasks for admins vs workers, cadence, and definition of done.\n\nDescribe what you’re building (or paste a rough idea). Later, dedicated APIs will serve architecture and flow diagrams—for now I can outline structures in text or suggest Mermaid you can render elsewhere.",
};

export function PlanningChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([INTRO]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  function newConversation() {
    setMessages([INTRO]);
    setInput("");
    setError(null);
  }

  async function send() {
    const text = input.trim();
    if (!text || sending) return;

    const nextHistory: ChatMessage[] = [...messages, { role: "user", content: text }];
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

      setMessages((prev) => [...prev, { role: "assistant", content: data.message }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setMessages((prev) => prev.slice(0, -1));
      setInput(text);
    } finally {
      setSending(false);
    }
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
        </p>
      </div>
    </div>
  );
}
