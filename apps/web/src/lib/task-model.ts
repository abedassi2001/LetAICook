import type { Timestamp } from "firebase/firestore";

/** Lifecycle for builder tasks (admin assigns → worker completes). */
export type TaskStatus =
  | "todo"
  | "in_progress"
  | "review"
  | "done"
  | "blocked";

export type TaskPriority = "low" | "medium" | "high" | "critical";

export type TaskDoc = {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  /** Admin / system user who created the task. */
  publishedByUid: string;
  /** Worker responsible for the task (Firestore Auth uid). */
  assigneeUid: string | null;
  /** @deprecated Use assigneeUid + users collection; kept for older docs. */
  assigneeLabel: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  /** When the admin expects work finished (“publish for a specific time”). */
  dueAt: Timestamp | null;
  /** When a worker marked the task done (status should be `done`). */
  completedAt: Timestamp | null;
  /** Auth uid of the user who completed the task. */
  completedByUid: string | null;
  timeEstimateMinutes: number | null;
  timeSpentMinutes: number | null;
  jiraIssueKey: string | null;
};

export const DEMO_PROJECT_ID = "demo-project";
