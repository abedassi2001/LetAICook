import type { Timestamp } from "firebase/firestore";
import { PLANNING_CONTEXT_KEY } from "@/lib/planning-sync";

export type PlanningChatRole = "user" | "assistant";

export type PlanningChatMessage = {
  role: PlanningChatRole;
  content: string;
};

export const PLANNING_INTRO_MESSAGE: PlanningChatMessage = {
  role: "assistant",
  content:
    "I can help you start a project and shape how work flows in letAIcook: milestones, first tasks for admins vs workers, cadence, and definition of done.\n\nDescribe what you’re building (or paste a rough idea). Your messages are summarized into the **System Designer** project description automatically—open **System Designer** and press **Generate system design** to produce architecture JSON, diagrams, and graphs (same Gemini API key as this chat).",
};

/** Subcollection under `users/{uid}` — single doc id `current`. */
export const PLANNING_CHAT_COLLECTION = "planningChat";
export const PLANNING_CHAT_DOC_ID = "current";

export type PlanningChatFirestoreDoc = {
  ownerUid: string;
  messages: PlanningChatMessage[];
  updatedAt: Timestamp;
};

export function parsePlanningMessages(raw: unknown): PlanningChatMessage[] | null {
  if (!Array.isArray(raw)) return null;
  const out: PlanningChatMessage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const m = item as Record<string, unknown>;
    if (m.role !== "user" && m.role !== "assistant") continue;
    if (typeof m.content !== "string") continue;
    out.push({ role: m.role, content: m.content });
  }
  return out.length > 0 ? out : null;
}

export function readPlanningMessagesFromSession(): PlanningChatMessage[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(PLANNING_CONTEXT_KEY);
    if (!raw) return null;
    return parsePlanningMessages(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}
