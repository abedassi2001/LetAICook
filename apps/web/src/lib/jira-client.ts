import { getPublicApiBaseUrl } from "@/lib/api-base";
import type { TaskPriority, TaskStatus } from "@/lib/task-model";
import type { UserProfileDoc } from "@/lib/user-model";
import type { User } from "firebase/auth";

export type JiraCredentials = {
  domain: string;
  email: string;
  apiToken: string;
  defaultProject: string;
};

/** Auth for Jira API: OAuth via Firebase Bearer, or legacy manual headers. */
export type JiraClientAuth =
  | { mode: "oauth"; getIdToken: () => Promise<string> }
  | { mode: "manual"; creds: JiraCredentials };

export type JiraConnectionInfo = {
  connected: boolean;
  atlassian_account_id?: string | null;
  cloud_id?: string | null;
  site_name?: string | null;
  site_url?: string | null;
  project_id?: string | null;
  project_key?: string | null;
  project_name?: string | null;
  auth_mode?: string | null;
};

export type JiraSite = {
  cloud_id: string;
  name: string;
  url: string;
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

export function resolveJiraClientAuth(
  user: User | null | undefined,
  profile: UserProfileDoc | null | undefined,
): JiraClientAuth | null {
  if (user) {
    return { mode: "oauth", getIdToken: () => user.getIdToken() };
  }
  const creds = jiraCredentialsFromProfile(profile);
  if (creds) return { mode: "manual", creds };
  return null;
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

let cachedConnection: {
  at: number;
  key: string;
  value: JiraConnectionInfo | null;
} | null = null;

const CONNECTION_CACHE_MS = 15_000;

export async function fetchJiraConnection(
  getIdToken: () => Promise<string>,
): Promise<JiraConnectionInfo> {
  const cacheKey = "oauth";
  const now = Date.now();
  if (
    cachedConnection &&
    cachedConnection.key === cacheKey &&
    now - cachedConnection.at < CONNECTION_CACHE_MS &&
    cachedConnection.value
  ) {
    return cachedConnection.value;
  }
  const res = await fetch(`${getPublicApiBaseUrl()}/jira/connection`, {
    headers: {
      Authorization: `Bearer ${await getIdToken()}`,
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
  const data = JSON.parse(raw) as JiraConnectionInfo;
  cachedConnection = { at: now, key: cacheKey, value: data };
  return data;
}

export function clearJiraConnectionCache(): void {
  cachedConnection = null;
}

async function buildRequestHeaders(
  auth: JiraClientAuth,
  manualCreds?: JiraCredentials | null,
): Promise<Record<string, string>> {
  if (auth.mode === "oauth") {
    const token = await auth.getIdToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
    try {
      const conn = await fetchJiraConnection(auth.getIdToken);
      if (conn.connected) return headers;
    } catch {
      /* fall through to manual */
    }
    const creds = manualCreds ?? null;
    if (creds) {
      return { ...headers, ...jiraHeaders(creds) };
    }
    throw new Error("Connect Jira in Settings to continue.");
  }
  return {
    "Content-Type": "application/json",
    ...jiraHeaders(auth.creds),
  };
}

async function jiraRequest<T>(
  auth: JiraClientAuth,
  path: string,
  init?: RequestInit,
  manualCreds?: JiraCredentials | null,
): Promise<T> {
  const headers = await buildRequestHeaders(auth, manualCreds);
  const res = await fetch(`${getPublicApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      ...headers,
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

export async function startJiraOAuth(getIdToken: () => Promise<string>): Promise<string> {
  const res = await fetch(`${getPublicApiBaseUrl()}/jira/oauth/start`, {
    headers: { Authorization: `Bearer ${await getIdToken()}` },
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
  const data = JSON.parse(raw) as { authorize_url: string };
  return data.authorize_url;
}

export async function disconnectJira(getIdToken: () => Promise<string>): Promise<void> {
  const res = await fetch(`${getPublicApiBaseUrl()}/jira/connection`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${await getIdToken()}` },
  });
  clearJiraConnectionCache();
  if (!res.ok) {
    const raw = await res.text();
    throw new Error(raw || "Failed to disconnect Jira.");
  }
}

export async function listJiraSites(getIdToken: () => Promise<string>): Promise<JiraSite[]> {
  const res = await fetch(`${getPublicApiBaseUrl()}/jira/sites`, {
    headers: { Authorization: `Bearer ${await getIdToken()}` },
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(raw || "Failed to load Jira sites.");
  return JSON.parse(raw) as JiraSite[];
}

export async function setJiraDefaultProject(
  getIdToken: () => Promise<string>,
  body: {
    project_key: string;
    cloud_id?: string;
    project_id?: string;
    project_name?: string;
  },
): Promise<JiraConnectionInfo> {
  const res = await fetch(`${getPublicApiBaseUrl()}/jira/default-project`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await getIdToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  clearJiraConnectionCache();
  const raw = await res.text();
  if (!res.ok) throw new Error(raw || "Failed to save default project.");
  return JSON.parse(raw) as JiraConnectionInfo;
}

export async function testJiraConnection(
  auth: JiraClientAuth,
  manualCreds?: JiraCredentials | null,
): Promise<JiraTestResult> {
  return jiraRequest<JiraTestResult>(auth, "/jira/config/test", { method: "POST" }, manualCreds);
}

export async function listJiraProjects(
  auth: JiraClientAuth,
  manualCreds?: JiraCredentials | null,
): Promise<JiraProject[]> {
  return jiraRequest<JiraProject[]>(auth, "/jira/projects", undefined, manualCreds);
}

export async function listJiraProjectIssues(
  auth: JiraClientAuth,
  projectKey: string,
  maxResults = 50,
  manualCreds?: JiraCredentials | null,
): Promise<JiraIssueListItem[]> {
  const params = new URLSearchParams({
    max_results: String(maxResults),
  });
  return jiraRequest<JiraIssueListItem[]>(
    auth,
    `/jira/projects/${encodeURIComponent(projectKey)}/issues?${params}`,
    undefined,
    manualCreds,
  );
}

export async function createJiraIssue(
  auth: JiraClientAuth,
  input: CreateJiraIssueInput,
  manualCreds?: JiraCredentials | null,
  defaultProject?: string,
): Promise<JiraIssueCreated> {
  const project =
    input.project_key ||
    (auth.mode === "manual" ? auth.creds.defaultProject : defaultProject) ||
    "";
  return jiraRequest<JiraIssueCreated>(
    auth,
    "/jira/issues",
    {
      method: "POST",
      body: JSON.stringify({
        summary: input.summary,
        description: input.description ?? "",
        issue_type: input.issue_type ?? "Task",
        priority: input.priority,
        project_key: project || undefined,
      }),
    },
    manualCreds,
  );
}

export async function updateJiraIssue(
  auth: JiraClientAuth,
  issueKey: string,
  patch: {
    summary?: string;
    description?: string;
    priority?: TaskPriority;
  },
  manualCreds?: JiraCredentials | null,
): Promise<void> {
  await jiraRequest(
    auth,
    `/jira/issues/${encodeURIComponent(issueKey)}`,
    {
      method: "PUT",
      body: JSON.stringify(patch),
    },
    manualCreds,
  );
}

export async function deleteJiraIssue(
  auth: JiraClientAuth,
  issueKey: string,
  manualCreds?: JiraCredentials | null,
): Promise<void> {
  await jiraRequest(
    auth,
    `/jira/issues/${encodeURIComponent(issueKey)}`,
    { method: "DELETE" },
    manualCreds,
  );
}

export async function syncJiraIssueStatus(
  auth: JiraClientAuth,
  issueKey: string,
  status: TaskStatus,
  manualCreds?: JiraCredentials | null,
): Promise<void> {
  await jiraRequest(
    auth,
    `/jira/issues/${encodeURIComponent(issueKey)}/sync-status`,
    {
      method: "POST",
      body: JSON.stringify({ status }),
    },
    manualCreds,
  );
}

export async function batchCreateJiraIssues(
  auth: JiraClientAuth,
  issues: CreateJiraIssueInput[],
  projectKey?: string,
  manualCreds?: JiraCredentials | null,
): Promise<{
  created: JiraIssueCreated[];
  errors: { index: number; summary: string; error: string }[];
}> {
  return jiraRequest(
    auth,
    "/jira/issues/batch",
    {
      method: "POST",
      body: JSON.stringify({
        project_key: projectKey,
        issues: issues.map((i) => ({
          summary: i.summary,
          description: i.description ?? "",
          issue_type: i.issue_type ?? "Task",
          priority: i.priority,
        })),
      }),
    },
    manualCreds,
  );
}

/** Whether the user can use Jira (OAuth connected or manual credentials). */
export async function hasJiraAccess(
  auth: JiraClientAuth | null,
  profile: UserProfileDoc | null | undefined,
): Promise<boolean> {
  if (!auth) return false;
  if (auth.mode === "oauth") {
    try {
      const conn = await fetchJiraConnection(auth.getIdToken);
      if (conn.connected) return true;
    } catch {
      /* fall through */
    }
    return Boolean(jiraCredentialsFromProfile(profile));
  }
  return true;
}

export function jiraDisplayLabel(
  connection: JiraConnectionInfo | null,
  profile: UserProfileDoc | null | undefined,
): string | null {
  if (connection?.connected && connection.site_name) {
    return connection.site_name;
  }
  if (profile?.jiraDomain) return profile.jiraDomain;
  return null;
}
