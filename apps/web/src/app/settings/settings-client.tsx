"use client";

import { useAuth } from "@/contexts/auth-context";
import { getFirestoreDb } from "@/lib/firebase";
import {
  jiraCredentialsFromProfile,
  listJiraProjects,
  testJiraConnection,
  type JiraProject,
} from "@/lib/jira-client";
import { USERS_COLLECTION } from "@/lib/user-model";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { startTransition, useEffect, useState } from "react";

export function SettingsClient() {
  const { user, profile, refreshProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<"profile" | "jira">("profile");

  const [domain, setDomain] = useState("");
  const [email, setEmail] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [defaultProject, setDefaultProject] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [projects, setProjects] = useState<JiraProject[]>([]);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  function credentialsFromForm() {
    const d = domain.trim();
    const e = email.trim();
    const t = apiToken.trim();
    if (!d || !e || !t) return null;
    return {
      domain: d,
      email: e,
      apiToken: t,
      defaultProject: defaultProject.trim(),
    };
  }

  useEffect(() => {
    if (!profile) return;
    startTransition(() => {
      setDomain(profile.jiraDomain || "");
      setEmail(profile.jiraEmail || "");
      setApiToken(profile.jiraApiToken || "");
      setDefaultProject(profile.jiraDefaultProject || "");
    });
  }, [profile]);

  async function handleSaveJira(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setMessage(null);

    try {
      const userRef = doc(getFirestoreDb(), USERS_COLLECTION, user.uid);
      await updateDoc(userRef, {
        jiraDomain: domain.trim(),
        jiraEmail: email.trim(),
        jiraApiToken: apiToken.trim(),
        jiraDefaultProject: defaultProject.trim(),
        updatedAt: serverTimestamp(),
      });
      await refreshProfile();
      setMessage({
        type: "success",
        text: "Jira settings saved. Open Tasks to import issues from your project.",
      });
    } catch (error) {
      console.error("Failed to save settings:", error);
      setMessage({ type: "error", text: "Failed to save settings. See console for details." });
    } finally {
      setSaving(false);
    }
  }

  async function handleTestConnection() {
    const creds = credentialsFromForm() ?? jiraCredentialsFromProfile(profile);
    if (!creds) {
      setMessage({
        type: "error",
        text: "Enter domain, email, and API token before testing.",
      });
      return;
    }
    setTesting(true);
    setMessage(null);
    setProjects([]);
    try {
      const result = await testJiraConnection(creds);
      if (!result.ok) {
        setMessage({ type: "error", text: result.message });
        return;
      }
      const listed = await listJiraProjects(creds);
      setProjects(listed);
      setMessage({
        type: "success",
        text: result.user
          ? `Connected as ${result.user}. ${listed.length} project(s) found.`
          : result.message,
      });
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error ? error.message : "Connection test failed.",
      });
    } finally {
      setTesting(false);
    }
  }

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
              <div className="text-app-text font-mono text-app-accent">
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
          <h2 className="mb-4 text-lg font-semibold text-app-text">Jira Integration</h2>
          <p className="mb-6 text-sm text-app-muted">
            Connect your Jira Cloud account. Tasks, status changes, and deletes on
            the board sync to Jira when credentials are saved. API tokens are sent
            to the FastAPI proxy only (not exposed in client bundles beyond your session).
          </p>

          <form onSubmit={handleSaveJira} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-app-text">Jira Domain</label>
              <input
                type="text"
                placeholder="e.g. your-company.atlassian.net"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                className="w-full rounded-lg border border-app-border bg-app-bg px-3 py-2 text-sm text-app-text outline-none focus:border-app-accent"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-app-text">Jira Email</label>
              <input
                type="email"
                placeholder="your-email@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-app-border bg-app-bg px-3 py-2 text-sm text-app-text outline-none focus:border-app-accent"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-app-text">Jira API Token</label>
              <input
                type="password"
                placeholder="ATATT3xFfGF0..."
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                className="w-full rounded-lg border border-app-border bg-app-bg px-3 py-2 text-sm text-app-text outline-none focus:border-app-accent"
              />
              <p className="mt-1 text-xs text-app-muted">
                Generate an API token from your Atlassian account security settings.
              </p>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-app-text">Default Project Key</label>
              <input
                type="text"
                placeholder="e.g. PROJ"
                value={defaultProject}
                onChange={(e) => setDefaultProject(e.target.value)}
                className="w-full rounded-lg border border-app-border bg-app-bg px-3 py-2 text-sm text-app-text outline-none focus:border-app-accent"
              />
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-app-accent px-4 py-2 text-sm font-medium text-white hover:bg-app-accent/90 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save settings"}
              </button>
              <button
                type="button"
                disabled={testing || saving}
                onClick={() => void handleTestConnection()}
                className="rounded-lg border border-app-border px-4 py-2 text-sm font-medium text-app-text hover:border-app-accent disabled:opacity-50"
              >
                {testing ? "Testing…" : "Test connection"}
              </button>
            </div>

            {projects.length > 0 ? (
              <div>
                <label className="mb-1 block text-sm font-medium text-app-text">
                  Your projects (pick a default key above)
                </label>
                <ul className="max-h-40 overflow-y-auto rounded-lg border border-app-border bg-app-bg p-2 text-sm text-app-muted">
                  {projects.map((p) => (
                    <li key={p.id} className="py-0.5">
                      <button
                        type="button"
                        className="w-full rounded px-1 py-0.5 text-left hover:bg-app-elevated hover:text-app-text"
                        onClick={() => setDefaultProject(p.key)}
                      >
                        <span className="font-mono text-app-accent">{p.key}</span> — {p.name}
                        {defaultProject === p.key ? (
                          <span className="ml-2 text-xs text-app-accent">(selected)</span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {message && (
              <p
                className={`text-sm ${
                  message.type === "success" ? "text-green-500" : "text-red-500"
                }`}
              >
                {message.text}
              </p>
            )}
          </form>
        </div>
      )}
    </div>
  );
}
