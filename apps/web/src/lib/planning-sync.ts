/** Session keys and helpers so Planning chat hands off to System Designer. */

import { getPublicApiBaseUrl } from "@/lib/api-base";
import type { PlanningChatMessage } from "@/lib/planning-chat-model";

export const PLANNING_CONTEXT_KEY = "letaicook_planning_context";
export const PLANNING_PROJECT_DESCRIPTION_KEY = "letaicook_planning_project_description";
export const PLANNING_SESSION_SAVED_AT_KEY = "letaicook_planning_saved_at";
/** Firebase Auth uid last associated with session keys; avoids showing another user’s chat after sign-out/sign-in. */
export const PLANNING_SESSION_OWNER_UID_KEY = "letaicook_planning_owner_uid";
export const PLANNING_SYNC_EVENT = "letaicook-planning-sync";

const FALLBACK_ASSISTANT_SNIPPET_MAX = 600;

/** Legacy: raw user message join — used only as part of the client fallback. */
export function buildProjectDescriptionFromMessages(
  messages: { role: string; content: string }[],
): string {
  return messages
    .filter((m) => m.role === "user")
    .map((m) => m.content.trim())
    .filter(Boolean)
    .join("\n\n");
}

export function hasPlanningUserInput(messages: { role: string; content: string }[]): boolean {
  return messages.some((m) => m.role === "user" && m.content.trim().length > 0);
}

/** Client-side fallback when no stored summary and the summary API is unavailable. */
export function buildPlanningDescriptionFallback(
  messages: { role: string; content: string }[],
): string {
  const userOnly = buildProjectDescriptionFromMessages(messages);
  if (!userOnly) return "";

  const assistantParts = messages
    .filter((m) => m.role === "assistant")
    .map((m) => m.content.trim())
    .filter(Boolean);
  const lastAssistant = assistantParts[assistantParts.length - 1];
  if (!lastAssistant || assistantParts.length <= 1) {
    return userOnly;
  }

  const snippet =
    lastAssistant.length > FALLBACK_ASSISTANT_SNIPPET_MAX
      ? `${lastAssistant.slice(0, FALLBACK_ASSISTANT_SNIPPET_MAX).trimEnd()}…`
      : lastAssistant;

  return `${userOnly}\n\n---\nPlanning notes:\n${snippet}`;
}

/** Prefer a stored Gemini summary; otherwise fall back to derived text. */
export function selectPlanningDescriptionForHandoff(params: {
  storedSummary?: string;
  messages: { role: string; content: string }[];
}): string {
  const summary = params.storedSummary?.trim();
  if (summary) return summary;
  return buildPlanningDescriptionFallback(params.messages);
}

export async function fetchPlanningProjectSummary(
  messages: PlanningChatMessage[],
): Promise<string> {
  const res = await fetch(`${getPublicApiBaseUrl()}/chat/plan/summary`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: messages.map(({ role, content }) => ({ role, content })),
    }),
  });

  const raw = await res.text();
  let detail: string | undefined;
  try {
    const parsed = JSON.parse(raw) as { detail?: unknown; summary?: string };
    if (typeof parsed.detail === "string") detail = parsed.detail;
    else if (Array.isArray(parsed.detail)) detail = parsed.detail.map(String).join(" ");
    if (res.ok && typeof parsed.summary === "string" && parsed.summary.trim()) {
      return parsed.summary.trim();
    }
  } catch {
    /* not JSON */
  }

  if (!res.ok) {
    throw new Error(detail || raw || `Summary request failed (${res.status})`);
  }
  throw new Error("Invalid summary response from API.");
}

export function writePlanningHandoffSession(params: {
  messages: PlanningChatMessage[];
  projectSummary?: string;
  ownerUid?: string;
}): void {
  if (typeof window === "undefined") return;
  try {
    const description = selectPlanningDescriptionForHandoff({
      storedSummary: params.projectSummary,
      messages: params.messages,
    });
    sessionStorage.setItem(PLANNING_CONTEXT_KEY, JSON.stringify(params.messages));
    sessionStorage.setItem(PLANNING_PROJECT_DESCRIPTION_KEY, description);
    writePlanningSessionSavedAt(Date.now());
    if (params.ownerUid) {
      writePlanningSessionOwnerUid(params.ownerUid);
    }
    window.dispatchEvent(new Event(PLANNING_SYNC_EVENT));
  } catch {
    /* private mode / quota */
  }
}

export function readPlanningProjectDescription(): string {
  if (typeof window === "undefined") return "";
  try {
    return sessionStorage.getItem(PLANNING_PROJECT_DESCRIPTION_KEY) ?? "";
  } catch {
    return "";
  }
}

export function resolveSystemDesignerDescription(params: {
  planningDescription: string;
  planningSavedAtMs: number;
  firestoreDescriptionDraft?: string;
  firestoreDescriptionDraftManual?: boolean;
  firestoreUpdatedAtMs?: number;
}): {
  description: string;
  manualOverride: boolean;
} {
  const planningDescription = params.planningDescription.trim();
  const firestoreDescriptionDraft =
    params.firestoreDescriptionDraft?.trim() ?? "";
  const firestoreUpdatedAtMs = params.firestoreUpdatedAtMs ?? 0;

  if (!planningDescription) {
    return {
      description: firestoreDescriptionDraft,
      manualOverride: params.firestoreDescriptionDraftManual === true,
    };
  }

  if (!firestoreDescriptionDraft) {
    return {
      description: planningDescription,
      manualOverride: false,
    };
  }

  if (params.firestoreDescriptionDraftManual === true) {
    return {
      description: firestoreDescriptionDraft,
      manualOverride: true,
    };
  }

  if (params.firestoreDescriptionDraftManual === false) {
    return {
      description: planningDescription,
      manualOverride: false,
    };
  }

  if (params.planningSavedAtMs >= firestoreUpdatedAtMs) {
    return {
      description: planningDescription,
      manualOverride: false,
    };
  }

  return {
    description: firestoreDescriptionDraft,
    manualOverride: true,
  };
}

export function readPlanningSessionSavedAt(): number {
  if (typeof window === "undefined") return 0;
  try {
    const v = sessionStorage.getItem(PLANNING_SESSION_SAVED_AT_KEY);
    if (!v) return 0;
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export function writePlanningSessionSavedAt(ms: number): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(PLANNING_SESSION_SAVED_AT_KEY, String(ms));
  } catch {
    /* private mode / quota */
  }
}

/** Clears planning chat keys (call on “New chat”). */
export function readPlanningSessionOwnerUid(): string {
  if (typeof window === "undefined") return "";
  try {
    return sessionStorage.getItem(PLANNING_SESSION_OWNER_UID_KEY) ?? "";
  } catch {
    return "";
  }
}

export function writePlanningSessionOwnerUid(uid: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(PLANNING_SESSION_OWNER_UID_KEY, uid);
  } catch {
    /* private mode / quota */
  }
}

export function clearPlanningSessionStorage(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(PLANNING_CONTEXT_KEY);
    sessionStorage.removeItem(PLANNING_PROJECT_DESCRIPTION_KEY);
    sessionStorage.removeItem(PLANNING_SESSION_SAVED_AT_KEY);
    sessionStorage.removeItem(PLANNING_SESSION_OWNER_UID_KEY);
  } catch {
    /* private mode / quota */
  }
}
