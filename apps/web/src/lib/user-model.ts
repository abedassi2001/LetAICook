import type { Timestamp } from "firebase/firestore";

/** Stored at `users/{uid}` — synced with Firebase Auth for that uid. */
export type UserRole = "admin" | "worker";

export type UserProfileDoc = {
  displayName: string;
  role: UserRole;
  /** Lowercase email for display / lookup (optional but set on signup). */
  emailLower: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  // User-specific Jira credentials
  jiraDomain?: string;
  jiraEmail?: string;
  jiraApiToken?: string;
  jiraDefaultProject?: string;
  // Team sharing
  teamId?: string;
};

export const USERS_COLLECTION = "users";
