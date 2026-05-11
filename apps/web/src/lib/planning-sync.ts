/** Session keys and helpers so Planning chat hands off to System Designer without extra API keys. */

export const PLANNING_CONTEXT_KEY = "letaicook_planning_context";
export const PLANNING_PROJECT_DESCRIPTION_KEY = "letaicook_planning_project_description";
export const PLANNING_SESSION_SAVED_AT_KEY = "letaicook_planning_saved_at";
/** Firebase Auth uid last associated with session keys; avoids showing another user’s chat after sign-out/sign-in. */
export const PLANNING_SESSION_OWNER_UID_KEY = "letaicook_planning_owner_uid";
export const PLANNING_SYNC_EVENT = "letaicook-planning-sync";

export function buildProjectDescriptionFromMessages(
  messages: { role: string; content: string }[],
): string {
  return messages
    .filter((m) => m.role === "user")
    .map((m) => m.content.trim())
    .filter(Boolean)
    .join("\n\n");
}

export function readPlanningProjectDescription(): string {
  if (typeof window === "undefined") return "";
  try {
    return sessionStorage.getItem(PLANNING_PROJECT_DESCRIPTION_KEY) ?? "";
  } catch {
    return "";
  }
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
