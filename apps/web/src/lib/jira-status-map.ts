import type { TaskPriority, TaskStatus } from "@/lib/task-model";

/** Map Jira status name + category to letAICook task status. */
export function jiraStatusToTaskStatus(
  statusName: string,
  statusCategory: string,
): TaskStatus {
  const s = statusName.toLowerCase();
  const cat = statusCategory.toLowerCase();
  if (cat === "done" || s.includes("done") || s.includes("closed") || s.includes("resolved")) {
    return "done";
  }
  if (s.includes("progress")) return "in_progress";
  if (s.includes("review")) return "review";
  if (s.includes("block")) return "blocked";
  return "todo";
}

/** Map Jira priority name to letAICook priority. */
export function jiraPriorityToTaskPriority(
  jiraPriority: string | null | undefined,
): TaskPriority {
  if (!jiraPriority) return "medium";
  const p = jiraPriority.toLowerCase();
  if (p === "lowest" || p === "low") return "low";
  if (p === "high") return "high";
  if (p === "highest" || p === "critical") return "critical";
  return "medium";
}
