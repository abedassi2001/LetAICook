import type { UserProfileDoc } from "@/lib/user-model";

/** Headers for Jira proxy routes — credentials come from the signed-in user's Firestore profile. */
export function buildJiraAuthHeaders(profile: UserProfileDoc | null): Record<string, string> | null {
  const domain = profile?.jiraDomain?.trim();
  const email = profile?.jiraEmail?.trim();
  const token = profile?.jiraApiToken?.trim();
  if (!domain || !email || !token) return null;
  const h: Record<string, string> = {
    "X-Jira-Domain": domain,
    "X-Jira-Email": email,
    "X-Jira-Token": token,
  };
  const proj = profile?.jiraDefaultProject?.trim();
  if (proj) h["X-Jira-Project"] = proj;
  return h;
}
