/** Session keys and helpers so Planning chat hands off to System Designer without extra API keys. */

export const PLANNING_CONTEXT_KEY = "letaicook_planning_context";
export const PLANNING_PROJECT_DESCRIPTION_KEY = "letaicook_planning_project_description";
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
