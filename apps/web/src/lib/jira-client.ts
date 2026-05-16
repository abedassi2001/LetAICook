import { getPublicApiBaseUrl } from "@/lib/api-base";
import type { TaskPriority, TaskStatus } from "@/lib/task-model";
import type { UserProfileDoc } from "@/lib/user-model";

export type JiraCredentials = {
  domain: string;
  email: string;
  apiToken: string;
  defaultProject: string;
};

export type CreateJiraIssueInput = {
  summary: string;
  description?: string;
  issue_type?: string;
  priority?: TaskPriority | string;
  project_key?: string;
};

export type JiraIssueCreated = {
  issue_key: string;
  issue_url: string;
  issue_id: string;
};

export type JiraTestResult = {
  ok: boolean;
  message: string;
  user?: string | null;
};

export type JiraProject = {
  key: string;
  name: string;
  id: string;
};

export type JiraIssueListItem = {
  issue_key: string;
  summary: string;
  status: string;
  status_category: string;
  priority: string | null;
  url: string;
};

export function jiraCredentialsFromProfile(
  profile: UserProfileDoc | null | undefined,
): JiraCredentials | null {
  const domain = profile?.jiraDomain?.trim();
  const email = profile?.jiraEmail?.trim();
  const apiToken = profile?.jiraApiToken?.trim();
  if (!domain || !email || !apiToken) return null;
  return {
    domain,
    email,
    apiToken,
    defaultProject: profile?.jiraDefaultProject?.trim() ?? "",
  };
}

export function jiraHeaders(creds: JiraCredentials): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-Jira-Domain": creds.domain,
    "X-Jira-Email": creds.email,
    "X-Jira-Token": creds.apiToken,
    "X-Jira-Project": creds.defaultProject,
  };
}

async function jiraRequest<T>(
  creds: JiraCredentials,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${getPublicApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      ...jiraHeaders(creds),
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
  const raw = await res.text();
  if (!res.ok) {
    let detail = raw;
    try {
      const j = JSON.parse(raw) as { detail?: string };
      if (j.detail) detail = j.detail;
    } catch {
      /* use raw */
    }
    throw new Error(detail);
  }
  if (!raw) return {} as T;
  return JSON.parse(raw) as T;
}

export async function testJiraConnection(
  creds: JiraCredentials,
): Promise<JiraTestResult> {
  return jiraRequest<JiraTestResult>(creds, "/jira/config/test", {
    method: "POST",
  });
}

export async function listJiraProjects(
  creds: JiraCredentials,
): Promise<JiraProject[]> {
  return jiraRequest<JiraProject[]>(creds, "/jira/projects");
}

export async function listJiraProjectIssues(
  creds: JiraCredentials,
  projectKey: string,
  maxResults = 50,
): Promise<JiraIssueListItem[]> {
  const params = new URLSearchParams({
    max_results: String(maxResults),
  });
  return jiraRequest<JiraIssueListItem[]>(
    creds,
    `/jira/projects/${encodeURIComponent(projectKey)}/issues?${params}`,
  );
}

export async function createJiraIssue(
  creds: JiraCredentials,
  input: CreateJiraIssueInput,
): Promise<JiraIssueCreated> {
  return jiraRequest<JiraIssueCreated>(creds, "/jira/issues", {
    method: "POST",
    body: JSON.stringify({
      summary: input.summary,
      description: input.description ?? "",
      issue_type: input.issue_type ?? "Task",
      priority: input.priority,
      project_key: input.project_key || creds.defaultProject || undefined,
    }),
  });
}

export async function updateJiraIssue(
  creds: JiraCredentials,
  issueKey: string,
  patch: {
    summary?: string;
    description?: string;
    priority?: TaskPriority;
  },
): Promise<void> {
  await jiraRequest(creds, `/jira/issues/${encodeURIComponent(issueKey)}`, {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}

export async function deleteJiraIssue(
  creds: JiraCredentials,
  issueKey: string,
): Promise<void> {
  await jiraRequest(creds, `/jira/issues/${encodeURIComponent(issueKey)}`, {
    method: "DELETE",
  });
}

export async function syncJiraIssueStatus(
  creds: JiraCredentials,
  issueKey: string,
  status: TaskStatus,
): Promise<void> {
  await jiraRequest(
    creds,
    `/jira/issues/${encodeURIComponent(issueKey)}/sync-status`,
    {
      method: "POST",
      body: JSON.stringify({ status }),
    },
  );
}

export async function batchCreateJiraIssues(
  creds: JiraCredentials,
  issues: CreateJiraIssueInput[],
  projectKey?: string,
): Promise<{ created: JiraIssueCreated[]; errors: { index: number; summary: string; error: string }[] }> {
  return jiraRequest(creds, "/jira/issues/batch", {
    method: "POST",
    body: JSON.stringify({
      project_key: projectKey || creds.defaultProject || undefined,
      issues: issues.map((i) => ({
        summary: i.summary,
        description: i.description ?? "",
        issue_type: i.issue_type ?? "Task",
        priority: i.priority,
      })),
    }),
  });
}
