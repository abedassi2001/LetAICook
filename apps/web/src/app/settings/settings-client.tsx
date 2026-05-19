"use client";

import { useAuth } from "@/contexts/auth-context";
import { getFirestoreDb } from "@/lib/firebase";
import {
  clearJiraConnectionCache,
  disconnectJira,
  fetchJiraConnection,
  jiraCredentialsFromProfile,
  listJiraProjects,
  listJiraSites,
  resolveJiraClientAuth,
  setJiraDefaultProject,
  startJiraOAuth,
  testJiraConnection,
  type JiraConnectionInfo,
  type JiraProject,
  type JiraSite,
} from "@/lib/jira-client";
import { jiraCallbackErrorMessage } from "@/lib/jira-errors";
import { USERS_COLLECTION } from "@/lib/user-model";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { useSearchParams } from "next/navigation";
import { startTransition, useCallback, useEffect, useState } from "react";

export function SettingsClient() {
  const { user, profile, refreshProfile } = useAuth();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<"profile" | "jira">("profile");

  const [connection, setConnection] = useState<JiraConnectionInfo | null>(null);
  const [sites, setSites] = useState<JiraSite[]>([]);
  const [projects, setProjects] = useState<JiraProject[]>([]);
  const [selectedCloudId, setSelectedCloudId] = useState("");
  const [selectedProject, setSelectedProject] = useState("");
  const [loadingConn, setLoadingConn] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showLegacy, setShowLegacy] = useState(false);

  const [domain, setDomain] = useState("");
  const [email, setEmail] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [legacyProject, setLegacyProject] = useState("");

  const jiraAuth = user ? resolveJiraClientAuth(user, profile) : null;
  const manualCreds = jiraCredentialsFromProfile(profile);

  const loadConnection = useCallback(async () => {
    if (!user) {
      setConnection(null);
      setLoadingConn(false);
      return;
    }
    setLoadingConn(true);
    try {
      const conn = await fetchJiraConnection(() => user.getIdToken());
      setConnection(conn);
      setSelectedCloudId(conn.cloud_id ?? "");
      setSelectedProject(conn.project_key ?? profile?.jiraDefaultProject ?? "");
      if (conn.connected) {
        const [siteList, projectList] = await Promise.all([
          listJiraSites(() => user.getIdToken()),
          listJiraProjects(
            { mode: "oauth", getIdToken: () => user.getIdToken() },
            manualCreds,
          ),
        ]);
        setSites(siteList);
        setProjects(projectList);
      } else {
        setSites([]);
        setProjects([]);
      }
    } catch (e) {
      setConnection({ connected: false, oauth_available: false });
      setMessage({
        type: "error",
        text:
          e instanceof Error
            ? e.message
            : "Could not load Jira connection status.",
      });
    } finally {
      setLoadingConn(false);
    }
  }, [user, profile?.jiraDefaultProject, manualCreds]);

  useEffect(() => {
    const jiraParam = searchParams.get("jira");
    if (jiraParam === "connected") {
      setActiveTab("jira");
      setMessage({ type: "success", text: "Jira connected successfully." });
      clearJiraConnectionCache();
    } else if (jiraParam === "error") {
      setActiveTab("jira");
      setMessage({
        type: "error",
        text: jiraCallbackErrorMessage(searchParams.get("reason")),
      });
    }
  }, [searchParams]);

  useEffect(() => {
    if (!profile) return;
    startTransition(() => {
      setDomain(profile.jiraDomain || "");
      setEmail(profile.jiraEmail || "");
      setApiToken(profile.jiraApiToken || "");
      setLegacyProject(profile.jiraDefaultProject || "");
    });
  }, [profile]);

  useEffect(() => {
    void loadConnection();
  }, [loadConnection]);

  async function handleConnectJira() {
    if (!user) return;
    setBusy(true);
    setMessage(null);
    try {
      const url = await startJiraOAuth(() => user.getIdToken());
      window.location.href = url;
    } catch (e) {
      setMessage({
        type: "error",
        text: e instanceof Error ? e.message : "Could not start Jira connection.",
      });
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    if (!user) return;
    setBusy(true);
    setMessage(null);
    try {
      await disconnectJira(() => user.getIdToken());
      clearJiraConnectionCache();
      await loadConnection();
      setMessage({ type: "success", text: "Jira disconnected." });
    } catch (e) {
      setMessage({
        type: "error",
        text: e instanceof Error ? e.message : "Failed to disconnect Jira.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveDefaultProject() {
    if (!user || !selectedProject) return;
    setBusy(true);
    setMessage(null);
    try {
      const picked = projects.find((p) => p.key === selectedProject);
      if (connection?.connected) {
        const updated = await setJiraDefaultProject(() => user.getIdToken(), {
          project_key: selectedProject,
          cloud_id: selectedCloudId || connection.cloud_id || undefined,
          project_id: picked?.id,
          project_name: picked?.name,
        });
        setConnection(updated);
      }
      await updateDoc(doc(getFirestoreDb(), USERS_COLLECTION, user.uid), {
        jiraDefaultProject: selectedProject,
        updatedAt: serverTimestamp(),
      });
      await refreshProfile();
      setMessage({ type: "success", text: `Default project set to ${selectedProject}.` });
    } catch (e) {
      setMessage({
        type: "error",
        text: e instanceof Error ? e.message : "Failed to save default project.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleSiteChange(cloudId: string) {
    setSelectedCloudId(cloudId);
    if (!user || !connection?.connected) return;
    setBusy(true);
    try {
      await setJiraDefaultProject(() => user.getIdToken(), {
        project_key: selectedProject || connection.project_key || "PROJ",
        cloud_id: cloudId,
      });
      clearJiraConnectionCache();
      const projectList = await listJiraProjects(
        { mode: "oauth", getIdToken: () => user.getIdToken() },
        manualCreds,
      );
      setProjects(projectList);
    } catch (e) {
      setMessage({
        type: "error",
        text: e instanceof Error ? e.message : "Failed to switch Jira site.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveLegacy(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    setMessage(null);
    try {
      await updateDoc(doc(getFirestoreDb(), USERS_COLLECTION, user.uid), {
        jiraDomain: domain.trim(),
        jiraEmail: email.trim(),
        jiraApiToken: apiToken.trim(),
        jiraDefaultProject: legacyProject.trim(),
        updatedAt: serverTimestamp(),
      });
      await refreshProfile();
      setMessage({ type: "success", text: "Manual Jira settings saved." });
    } catch (e) {
      setMessage({
        type: "error",
        text: e instanceof Error ? e.message : "Failed to save settings.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleTestLegacy() {
    if (!jiraAuth) return;
    const creds =
      domain && email && apiToken
        ? {
            domain: domain.trim(),
            email: email.trim(),
            apiToken: apiToken.trim(),
            defaultProject: legacyProject.trim(),
          }
        : manualCreds;
    if (!creds) {
      setMessage({ type: "error", text: "Enter domain, email, and API token." });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const result = await testJiraConnection(
        jiraAuth.mode === "oauth"
          ? { mode: "manual", creds }
          : jiraAuth,
        creds,
      );
      if (!result.ok) {
        setMessage({ type: "error", text: result.message });
        return;
      }
      const listed = await listJiraProjects({ mode: "manual", creds }, creds);
      setProjects(listed);
      setMessage({
        type: "success",
        text: result.user
          ? `Connected as ${result.user}. ${listed.length} project(s) found.`
          : result.message,
      });
    } catch (e) {
      setMessage({
        type: "error",
        text: e instanceof Error ? e.message : "Connection test failed.",
      });
    } finally {
      setBusy(false);
    }
  }

  const oauthConnected = Boolean(connection?.connected);
  const oauthAvailable = connection?.oauth_available !== false;
  const setupMessage = connection?.user_message ?? null;

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex gap-4 border-b border-app-border">
        <button
          className={`pb-2 text-sm font-medium ${
            activeTab === "profile"
              ? "border-b-2 border-app-accent text-app-accent"
              : "text-app-muted hover:text-app-text"
          }`}
          onClick={() => {
            setActiveTab("profile");
            setMessage(null);
          }}
        >
          Profile
        </button>
        <button
          className={`pb-2 text-sm font-medium ${
            activeTab === "jira"
              ? "border-b-2 border-app-accent text-app-accent"
              : "text-app-muted hover:text-app-text"
          }`}
          onClick={() => {
            setActiveTab("jira");
            setMessage(null);
          }}
        >
          Jira Integration
        </button>
      </div>

      {activeTab === "profile" && (
        <div className="rounded-xl border border-app-border bg-app-elevated p-6">
          <h2 className="mb-4 text-lg font-semibold text-app-text">User Profile</h2>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-app-muted">Name</label>
              <div className="text-app-text">{profile?.displayName || "—"}</div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-app-muted">Email</label>
              <div className="text-app-text">{user?.email || "—"}</div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-app-muted">Team ID</label>
              <div className="font-mono text-app-accent text-app-text">
                {profile?.teamId || "No Team Assigned"}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-app-muted">Role</label>
              <div className="inline-block rounded-full bg-app-accent/20 px-3 py-1 text-sm font-medium capitalize text-app-accent">
                {profile?.role === "admin" ? "Team Lead (Admin)" : profile?.role || "Worker"}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "jira" && (
        <div className="rounded-xl border border-app-border bg-app-elevated p-6">
          <h2 className="mb-2 text-lg font-semibold text-app-text">Jira Cloud</h2>
          <p className="mb-6 text-sm text-app-muted">
            Click Connect Jira to sign in with Atlassian. You do not need an API token or developer
            setup — your deployment administrator configures that once for everyone.
          </p>

          {!loadingConn && !oauthAvailable && setupMessage ? (
            <p className="mb-4 rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-sm text-amber-100">
              {setupMessage}
            </p>
          ) : null}

          {loadingConn ? (
            <p className="text-sm text-app-muted">Loading connection status…</p>
          ) : oauthConnected ? (
            <div className="space-y-4">
              <p className="rounded-lg border border-green-500/30 bg-green-950/20 px-3 py-2 text-sm text-green-300">
                Connected to {connection?.site_name ?? "Jira Cloud"}
                {connection?.site_url ? (
                  <>
                    {" "}
                    (
                    <a
                      href={connection.site_url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline"
                    >
                      {connection.site_url}
                    </a>
                    )
                  </>
                ) : null}
              </p>

              {sites.length > 1 ? (
                <label className="block text-sm">
                  <span className="text-app-muted">Jira site</span>
                  <select
                    value={selectedCloudId}
                    onChange={(e) => void handleSiteChange(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-app-border bg-app-bg px-3 py-2 text-app-text"
                  >
                    {sites.map((s) => (
                      <option key={s.cloud_id} value={s.cloud_id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              {projects.length > 0 ? (
                <label className="block text-sm">
                  <span className="text-app-muted">Default project</span>
                  <select
                    value={selectedProject}
                    onChange={(e) => setSelectedProject(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-app-border bg-app-bg px-3 py-2 text-app-text"
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.key}>
                        {p.key} — {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p className="text-xs text-app-muted">Loading projects…</p>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy || !selectedProject}
                  onClick={() => void handleSaveDefaultProject()}
                  className="rounded-lg bg-app-accent px-4 py-2 text-sm font-medium text-white hover:bg-app-accent/90 disabled:opacity-50"
                >
                  Save default project
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleConnectJira()}
                  className="rounded-lg border border-app-border px-4 py-2 text-sm font-medium text-app-text hover:border-app-accent disabled:opacity-50"
                >
                  Reconnect
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleDisconnect()}
                  className="rounded-lg border border-red-500/40 px-4 py-2 text-sm font-medium text-red-300 hover:bg-red-950/30 disabled:opacity-50"
                >
                  Disconnect
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-app-muted">Not connected to Jira.</p>
              <button
                type="button"
                disabled={busy || !user || !oauthAvailable}
                onClick={() => void handleConnectJira()}
                className="rounded-lg bg-app-accent px-4 py-2 text-sm font-medium text-white hover:bg-app-accent/90 disabled:opacity-50"
              >
                {busy ? "Redirecting…" : "Connect Jira"}
              </button>
              {manualCreds ? (
                <p className="text-xs text-app-muted">
                  Manual API token credentials are saved and used until you connect with OAuth.
                </p>
              ) : null}
            </div>
          )}

          <button
            type="button"
            className="mt-6 text-xs text-app-muted underline hover:text-app-accent"
            onClick={() => setShowLegacy((v) => !v)}
          >
            {showLegacy ? "Hide" : "Show"} manual API token setup (legacy)
          </button>

          {showLegacy ? (
            <form
              onSubmit={(e) => void handleSaveLegacy(e)}
              className="mt-4 space-y-3 border-t border-app-border pt-4"
            >
              <p className="text-xs text-app-muted">
                Legacy mode: domain, email, and API token are stored in your Firestore profile.
              </p>
              <input
                type="text"
                placeholder="your-company.atlassian.net"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                className="w-full rounded-lg border border-app-border bg-app-bg px-3 py-2 text-sm text-app-text"
              />
              <input
                type="email"
                placeholder="email@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-app-border bg-app-bg px-3 py-2 text-sm text-app-text"
              />
              <input
                type="password"
                placeholder="API token"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                className="w-full rounded-lg border border-app-border bg-app-bg px-3 py-2 text-sm text-app-text"
              />
              <input
                type="text"
                placeholder="Default project key"
                value={legacyProject}
                onChange={(e) => setLegacyProject(e.target.value)}
                className="w-full rounded-lg border border-app-border bg-app-bg px-3 py-2 text-sm text-app-text"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-lg border border-app-border px-4 py-2 text-sm text-app-text"
                >
                  Save manual settings
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleTestLegacy()}
                  className="rounded-lg border border-app-border px-4 py-2 text-sm text-app-text"
                >
                  Test manual connection
                </button>
              </div>
            </form>
          ) : null}

          {message ? (
            <p
              className={`mt-4 text-sm ${
                message.type === "success" ? "text-green-500" : "text-red-500"
              }`}
            >
              {message.text}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
