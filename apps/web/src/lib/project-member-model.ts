import type { Timestamp } from "firebase/firestore";

/** `projects/{projectKey}/members/{memberId}` — roster added by email in letAIcook. */
export type ProjectMemberDoc = {
  emailLower: string;
  displayName: string;
  /** Linked Firebase Auth uid when a user profile exists with this email. */
  uid: string | null;
  addedByUid: string;
  addedAt: Timestamp;
  updatedAt: Timestamp;
};

export const PROJECT_MEMBERS_COLLECTION = "members";
