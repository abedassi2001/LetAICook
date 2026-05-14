"use client";

import { DatabaseViewer } from "@/components/system-design/database-viewer";
import { DiagramCanvas } from "@/components/system-design/diagram-canvas";
import { ExportToolbar } from "@/components/system-design/export-toolbar";
import { JsonImporter } from "@/components/system-design/json-importer";
import { MermaidChart } from "@/components/system-design/mermaid-chart";
import { ServiceMap } from "@/components/system-design/service-map";
import { useAuth } from "@/contexts/auth-context";
import { getPublicApiBaseUrl } from "@/lib/api-base";
import { buildJiraAuthHeaders } from "@/lib/jira-client";
import { getFirestoreDb } from "@/lib/firebase";
import {
  PLANNING_CONTEXT_KEY,
  PLANNING_SYNC_EVENT,
  readPlanningProjectDescription,
} from "@/lib/planning-sync";
import { parseDesignJson } from "@/lib/system-design/normalize";
import { emptyBlueprint } from "@/lib/system-design/types";
import {
  SYSTEM_DESIGN_WORKSPACE_ID,
  SYSTEM_DESIGNS_COLLECTION,
  type SystemDesignRawSnapshot,
  type SystemDesignWorkspaceDoc,
} from "@/lib/system-design-model";
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const TABS = [
  "overview",
  "architecture",
  "services",
  "database",
  "apis",
  "pages",
  "tasks",
  "diagrams",
] as const;
type TabId = (typeof TABS)[number];

function readPlanningContext():
  | { role: "user" | "assistant"; content: string }[]
  | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = sessionStorage.getItem(PLANNING_CONTEXT_KEY);
    if (!raw) return undefined;
    const arr = JSON.parse(raw) as { role: string; content: string }[];
    return arr
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))
      .slice(-12);
  } catch {
    return undefined;
  }
}

export function SystemDesignerClient() {
  const { user, profile } = useAuth();
  const [tab, setTab] = useState<TabId>("overview");
  const [description, setDescription] = useState("");
  const [design, setDesign] = useState<SystemDesignRawSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [versions, setVersions] = useState<SystemDesignWorkspaceDoc["versions"]>([]);
  const [remoteNotice, setRemoteNotice] = useState(false);
  const [extraMarkdown, setExtraMarkdown] = useState<string | null>(null);
  const [extraTitle, setExtraTitle] = useState("");
  const lastLocalSaveMs = useRef(0);
  const snapshotHydrated = useRef(false);
  const exportRef = useRef<HTMLDivElement>(null);
  /** Once the user edits the description box, we stop auto-overwriting from planning (until "Pull from planning"). */
  const descriptionUserEdited = useRef(false);

  const blueprint = useMemo(
    () => (design ? parseDesignJson(design).blueprint : emptyBlueprint()),
    [design],
  );

  const workspaceRef = user
    ? doc(
        getFirestoreDb(),
        "users",
        user.uid,
        SYSTEM_DESIGNS_COLLECTION,
        SYSTEM_DESIGN_WORKSPACE_ID,
      )
    : null;

  const persistWorkspace = useCallback(
    async (snap: SystemDesignRawSnapshot, desc: string, note?: string) => {
      if (!user || !workspaceRef) return;
      const clean = JSON.parse(JSON.stringify(snap)) as SystemDesignRawSnapshot;
      const snapExisting = await getDoc(workspaceRef);
      const prev = snapExisting.data() as SystemDesignWorkspaceDoc | undefined;
      const nextVer = (prev?.versions?.length ?? 0) + 1;
      const versionsNext = [
        ...(prev?.versions ?? []).slice(-19),
        {
          version: nextVer,
          createdAt: Timestamp.now(),
          snapshot: clean,
          note,
        },
      ];
      lastLocalSaveMs.current = Date.now();
      await setDoc(
        workspaceRef,
        {
          ownerUid: user.uid,
          descriptionDraft: desc,
          latest: clean,
          versions: versionsNext,
          updatedAt: serverTimestamp(),
          updatedAtIso: new Date().toISOString(),
        },
        { merge: true },
      );
      setVersions(versionsNext);
    },
    [user, workspaceRef],
  );

  useEffect(() => {
    if (!workspaceRef || !user) return;
    snapshotHydrated.current = false;
    let unsub: Unsubscribe | undefined;
    (async () => {
      const cur = await getDoc(workspaceRef);
      const d = cur.data() as SystemDesignWorkspaceDoc | undefined;
      if (d?.descriptionDraft?.trim()) {
        setDescription(d.descriptionDraft);
        descriptionUserEdited.current = true;
      } else {
        const fromPlanning = readPlanningProjectDescription();
        if (fromPlanning.trim()) {
          setDescription(fromPlanning);
          descriptionUserEdited.current = false;
        }
      }
      if (d?.latest) setDesign(d.latest);
      if (d?.versions?.length) setVersions(d.versions);
      if (d?.updatedAt && typeof (d.updatedAt as Timestamp).toMillis === "function") {
        lastLocalSaveMs.current = (d.updatedAt as Timestamp).toMillis();
      }

      unsub = onSnapshot(workspaceRef, (snap) => {
        if (!snap.exists()) return;
        if (!snapshotHydrated.current) {
          snapshotHydrated.current = true;
          return;
        }
        const data = snap.data() as SystemDesignWorkspaceDoc;
        if (snap.metadata.hasPendingWrites) return;
        const ts = data.updatedAt as Timestamp | undefined;
        const ms = ts?.toMillis?.() ?? 0;
        if (ms > lastLocalSaveMs.current + 800) {
          setRemoteNotice(true);
        }
      });
    })();
    return () => unsub?.();
  }, [workspaceRef, user]);

  useEffect(() => {
    function onPlanningSync() {
      if (descriptionUserEdited.current) return;
      const next = readPlanningProjectDescription();
      if (next.trim()) setDescription(next);
    }
    window.addEventListener(PLANNING_SYNC_EVENT, onPlanningSync);
    return () => window.removeEventListener(PLANNING_SYNC_EVENT, onPlanningSync);
  }, []);

  async function runDesign(regenerateFocus?: string) {
    const base = getPublicApiBaseUrl();
    const ctx = readPlanningContext();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${base}/design-project`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: description.trim() || "Untitled product idea",
          context_messages: ctx?.length ? ctx : undefined,
          previous_design: regenerateFocus && design ? design : undefined,
          regenerate_focus: regenerateFocus,
        }),
      });
      const raw = await res.text();
      if (!res.ok) {
        let detail = raw;
        try {
          const j = JSON.parse(raw) as { detail?: string };
          if (j.detail) detail = j.detail;
        } catch {
          /* */
        }
        throw new Error(detail);
      }
      const next = JSON.parse(raw) as SystemDesignRawSnapshot;
      setDesign(next);
      await persistWorkspace(next, description, regenerateFocus ? `Regenerate: ${regenerateFocus}` : "generate");
      setRemoteNotice(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setLoading(false);
    }
  }

  async function runExtra(path: "jira-tasks" | "pitch") {
    if (!design) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${getPublicApiBaseUrl()}/design-project/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ design }),
      });
      const raw = await res.text();
      if (!res.ok) throw new Error(raw);
      const j = JSON.parse(raw) as { markdown: string };
      setExtraTitle(path === "jira-tasks" ? "Jira-style backlog" : "Startup pitch");
      setExtraMarkdown(j.markdown ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  async function pushToJira() {
    if (!design || blueprint.tasks.length === 0) {
      alert("No tasks generated to push.");
      return;
    }
    const jiraHeaders = buildJiraAuthHeaders(profile ?? null);
    if (!jiraHeaders) {
      alert("Add your Jira domain, email, and API token under Settings → Jira Integration.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload = {
        issues: blueprint.tasks.map((t) => ({
          summary: t.title,
          description: t.description,
          issue_type: "Task",
          priority: "Medium",
        })),
      };

      const res = await fetch(`${getPublicApiBaseUrl()}/jira/issues/batch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...jiraHeaders,
        },
        body: JSON.stringify(payload),
      });

      const raw = await res.text();
      if (!res.ok) {
        let detail = raw;
        try {
          const j = JSON.parse(raw) as { detail?: string };
          if (j.detail) detail = j.detail;
        } catch { /* */ }
        throw new Error(detail);
      }
      const data = JSON.parse(raw);
      alert(`Successfully created ${data.created?.length || 0} Jira issues! Check your Jira board.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to push to Jira");
    } finally {
      setLoading(false);
    }
  }

  const showSkeleton = loading && !design;
  const d = blueprint;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-app-bg">
      <div className="border-b border-app-border/80 bg-black/20 px-4 py-4 backdrop-blur-xl lg:px-8">
        <div className="mx-auto max-w-6xl">
          <p className="text-xs font-medium uppercase tracking-wider text-app-accent">AI System Designer</p>
          <h1 className="mt-1 text-xl font-semibold text-app-text">Shape your system as the idea evolves</h1>
          <p className="mt-1 max-w-3xl text-sm text-app-muted">
            Describe the product below—or chat on <span className="text-app-accent/90">Planning</span> first: your
            user messages stream into this box live (until you edit it). Generation uses the same{" "}
            <span className="text-app-accent/90">Gemini</span> API key as planning. Output is structured JSON only;
            designs save to Firestore with version history.
          </p>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-4 lg:px-8 lg:py-6">
        {remoteNotice ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-500/30 bg-amber-950/25 px-4 py-3 text-sm text-amber-100 backdrop-blur-md">
            <span>This workspace may have changed in another tab or device.</span>
            <button
              type="button"
              className="rounded-lg bg-app-accent px-3 py-1.5 text-xs font-semibold text-app-on-accent"
              onClick={async () => {
                if (!workspaceRef) return;
                const cur = await getDoc(workspaceRef);
                const data = cur.data() as SystemDesignWorkspaceDoc | undefined;
                if (data?.latest) setDesign(data.latest);
                if (data?.versions) setVersions(data.versions);
                setRemoteNotice(false);
              }}
            >
              Reload from cloud
            </button>
          </div>
        ) : null}

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-xl shadow-black/40 backdrop-blur-xl transition-all duration-300">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <label className="block text-sm font-medium text-app-muted">Project description</label>
            <button
              type="button"
              className="text-xs font-medium text-app-accent hover:underline disabled:opacity-40"
              disabled={loading}
              onClick={() => {
                descriptionUserEdited.current = false;
                const t = readPlanningProjectDescription();
                if (t.trim()) setDescription(t);
              }}
            >
              Pull latest from planning
            </button>
          </div>
          <textarea
            className="mt-2 min-h-[120px] w-full resize-y rounded-xl border border-app-border bg-black/30 px-4 py-3 text-[15px] text-app-text placeholder:text-app-muted/50 focus:border-app-accent/60 focus:outline-none focus:ring-1 focus:ring-app-accent/30"
            placeholder="e.g. AI cooking app with team collaboration, calendar sync, task manager, notifications, and recipe assistant…"
            value={description}
            onChange={(e) => {
              descriptionUserEdited.current = true;
              setDescription(e.target.value);
            }}
            disabled={loading}
          />
          <p className="mt-1 text-[11px] text-app-muted">
            Streams from planning while this field is untouched. Uses server{" "}
            <code className="rounded bg-app-elevated px-1">GOOGLE_API_KEY</code> /{" "}
            <code className="rounded bg-app-elevated px-1">GEMINI_API_KEY</code> (same as{" "}
            <code className="rounded bg-app-elevated px-1">/chat/plan</code>).
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => void runDesign()}
              className="rounded-xl bg-app-accent px-4 py-2.5 text-sm font-semibold text-app-on-accent hover:bg-app-accent-bright disabled:opacity-50"
            >
              {loading ? "Generating…" : "Generate system design"}
            </button>
            <button
              type="button"
              disabled={loading || !design}
              onClick={() => void runDesign("architecture")}
              className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-app-text hover:border-app-accent/40 disabled:opacity-40"
            >
              Regenerate architecture
            </button>
            <button
              type="button"
              disabled={loading || !design}
              onClick={() => void runExtra("jira-tasks")}
              className="rounded-xl border border-white/15 px-4 py-2.5 text-sm text-app-muted hover:text-app-accent disabled:opacity-40"
            >
              Generate Jira tasks
            </button>
            <button
              type="button"
              disabled={loading || !design || blueprint.tasks.length === 0}
              onClick={() => void pushToJira()}
              className="rounded-xl border border-white/15 px-4 py-2.5 text-sm text-app-muted hover:text-green-400 disabled:opacity-40"
            >
              Push tasks to Jira
            </button>
            <button
              type="button"
              disabled={loading || !design}
              onClick={() => void runExtra("pitch")}
              className="rounded-xl border border-white/15 px-4 py-2.5 text-sm text-app-muted hover:text-app-accent disabled:opacity-40"
            >
              Generate startup pitch
            </button>
            <JsonImporter
              onApply={(_blueprint, raw) => {
                setDesign(raw);
                void persistWorkspace(raw, description, "import JSON");
              }}
            />
          </div>
        </div>

        {versions.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-app-muted">
            <span>Version history:</span>
            <select
              className="rounded-lg border border-app-border bg-app-elevated px-2 py-1 text-app-text"
              value=""
              onChange={(e) => {
                const v = Number(e.target.value);
                const entry = versions.find((x) => x.version === v);
                if (entry?.snapshot) setDesign(entry.snapshot);
              }}
            >
              <option value="">Restore…</option>
              {[...versions].reverse().map((v) => (
                <option key={v.version} value={v.version}>
                  v{v.version}
                  {v.note ? ` — ${v.note}` : ""}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-red-500/40 bg-red-950/30 px-4 py-3 text-sm text-red-200">{error}</div>
        ) : null}

        <div className="flex flex-wrap gap-2 border-b border-white/10 pb-2">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-full px-4 py-1.5 text-sm capitalize transition-all duration-200 ${
                tab === t
                  ? "bg-app-accent/20 text-app-accent ring-1 ring-app-accent/50"
                  : "text-app-muted hover:bg-white/5 hover:text-app-text"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {showSkeleton ? (
          <div className="space-y-3 animate-pulse">
            <div className="h-32 rounded-2xl bg-white/5" />
            <div className="h-48 rounded-2xl bg-white/5" />
            <div className="h-64 rounded-2xl bg-white/5" />
          </div>
        ) : (
          <div ref={exportRef} className="space-y-6 pb-24 transition-opacity duration-300">
            <ExportToolbar blueprint={design ? blueprint : null} exportRegionRef={exportRef} />

            {tab === "overview" ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-md">
                  <h2 className="text-lg font-semibold text-app-text">{d.project_name || "Untitled"}</h2>
                  {d.description ? <p className="mt-2 text-sm text-app-muted">{d.description}</p> : null}
                  <p className="mt-2 text-sm text-app-muted">
                    {d.pages.length} pages · {d.backend_services.length} services · {d.api_routes.length} API routes ·{" "}
                    {d.database_schema.length} entities · {d.tasks.length} sprint tasks · {d.relationships.length}{" "}
                    relationships
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-md">
                  <h3 className="text-sm font-medium text-app-accent">Wireframe suggestions</h3>
                  <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-app-muted">
                    {d.wireframe_suggestions.length ? (
                      d.wireframe_suggestions.map((w, i) => <li key={i}>{w}</li>)
                    ) : (
                      <li>No suggestions yet—generate or import JSON.</li>
                    )}
                  </ul>
                </div>
                <div className="md:col-span-2">
                  <h3 className="mb-2 text-sm font-medium text-app-accent">Service map</h3>
                  <ServiceMap blueprint={d} />
                </div>
              </div>
            ) : null}

            {tab === "architecture" ? (
              <div className="space-y-6">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-md">
                  <h3 className="text-sm font-medium text-app-accent">Architecture (Mermaid)</h3>
                  <MermaidChart chart={d.diagrams.architecture} className="mt-3" />
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-md">
                  <h3 className="text-sm font-medium text-app-accent">Interactive graph (React Flow)</h3>
                  <p className="mb-2 text-xs text-app-muted">
                    Drag nodes, connect with edges, zoom — edits are local until you save a new JSON version.
                  </p>
                  <DiagramCanvas blueprint={d} />
                </div>
              </div>
            ) : null}

            {tab === "services" ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-md">
                <h3 className="text-sm font-medium text-app-accent">Backend services</h3>
                <div className="mt-4">
                  <ServiceMap blueprint={d} />
                </div>
              </div>
            ) : null}

            {tab === "database" ? (
              <div className="grid gap-6 lg:grid-cols-2">
                <DatabaseViewer blueprint={d} />
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-md">
                  <h3 className="text-sm font-medium text-app-accent">ERD (Mermaid)</h3>
                  <MermaidChart chart={d.diagrams.erd} className="mt-3" />
                </div>
              </div>
            ) : null}

            {tab === "apis" ? (
              <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-md">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-white/10 text-app-muted">
                    <tr>
                      <th className="p-3">Method</th>
                      <th className="p-3">Route</th>
                      <th className="p-3">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.api_routes.map((r, i) => (
                      <tr key={`${r.route}-${i}`} className="border-b border-white/5 text-app-text">
                        <td className="p-3 font-mono text-app-accent">{r.method}</td>
                        <td className="p-3 font-mono text-xs">{r.route}</td>
                        <td className="p-3 text-app-muted">{r.description ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!d.api_routes.length ? (
                  <p className="p-4 text-sm text-app-muted">No api_routes in the current design JSON.</p>
                ) : null}
              </div>
            ) : null}

            {tab === "pages" ? (
              <div className="grid gap-4 md:grid-cols-2">
                {d.pages.map((p) => (
                  <div
                    key={`${p.name}-${p.path ?? ""}`}
                    className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-md"
                  >
                    <h4 className="font-medium text-app-accent">{p.name}</h4>
                    {p.path ? <p className="mt-1 font-mono text-xs text-app-muted">{p.path}</p> : null}
                    {p.purpose ? <p className="mt-2 text-sm text-app-muted">{p.purpose}</p> : null}
                    <p className="mt-2 text-xs text-app-muted/80">
                      {p.components.length ? `Components: ${p.components.join(", ")}` : null}
                    </p>
                  </div>
                ))}
                {!d.pages.length ? (
                  <p className="text-sm text-app-muted">No pages in the current design JSON.</p>
                ) : null}
              </div>
            ) : null}

            {tab === "tasks" ? (
              <div className="space-y-3">
                {d.tasks.map((t, i) => (
                  <div
                    key={`${t.title}-${i}`}
                    className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-md"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="font-medium text-app-text">{t.title}</h4>
                      {t.estimate_points != null ? (
                        <span className="rounded-full bg-app-accent/15 px-2 py-0.5 text-xs text-app-accent">
                          {t.estimate_points} pts
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm text-app-muted">{t.description}</p>
                  </div>
                ))}
                {!d.tasks.length ? (
                  <p className="text-sm text-app-muted">No tasks in the current design JSON.</p>
                ) : null}
              </div>
            ) : null}

            {tab === "diagrams" ? (
              <div className="space-y-8">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-md">
                  <h3 className="text-sm font-medium text-app-accent">Sequence</h3>
                  <MermaidChart chart={d.diagrams.sequence} className="mt-3" />
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-md">
                  <h3 className="text-sm font-medium text-app-accent">Class</h3>
                  <MermaidChart chart={d.diagrams.class} className="mt-3" />
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-md">
                  <h3 className="text-sm font-medium text-app-accent">User flow</h3>
                  <MermaidChart chart={d.diagrams.user_flow} className="mt-3" />
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {extraMarkdown ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-2xl border border-white/15 bg-app-elevated shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <h2 className="font-semibold text-app-text">{extraTitle}</h2>
              <button
                type="button"
                className="text-app-muted hover:text-app-accent"
                onClick={() => setExtraMarkdown(null)}
              >
                Close
              </button>
            </div>
            <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap p-4 text-sm text-app-muted">
              {extraMarkdown}
            </pre>
            <div className="border-t border-white/10 p-3">
              <button
                type="button"
                className="rounded-lg bg-app-accent px-4 py-2 text-sm font-semibold text-app-on-accent"
                onClick={() => void navigator.clipboard.writeText(extraMarkdown)}
              >
                Copy markdown
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
