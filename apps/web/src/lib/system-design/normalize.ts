import {
  emptyBlueprint,
  type SystemDesignBlueprint,
  type SystemDesignDiagrams,
} from "@/lib/system-design/types";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function strArr(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

/** Parse Firestore/API/import JSON into a canonical blueprint. Supports legacy flat diagram keys and new nested `diagrams`. */
export function parseDesignJson(raw: unknown): {
  ok: true;
  blueprint: SystemDesignBlueprint;
  warnings: string[];
} {
  const warnings: string[] = [];
  if (!isRecord(raw)) {
    return { ok: true, blueprint: emptyBlueprint(), warnings: ["Input was not an object — using empty blueprint."] };
  }

  const diagramsIn = isRecord(raw.diagrams) ? raw.diagrams : null;
  const diagrams: SystemDesignDiagrams = {
    architecture: str(diagramsIn?.architecture) || str(raw.architecture_diagram),
    sequence: str(diagramsIn?.sequence) || str(raw.sequence_diagram),
    erd: str(diagramsIn?.erd) || str(raw.erd_diagram),
    class: str(diagramsIn?.class) || str(diagramsIn?.class_diagram) || str(raw.class_diagram),
    user_flow:
      str(diagramsIn?.user_flow) ||
      str(diagramsIn?.user_flow_diagram) ||
      str(raw.user_flow_diagram),
  };

  const pagesRaw = Array.isArray(raw.pages) ? raw.pages : [];
  const pages: SystemDesignBlueprint["pages"] = [];
  for (const p of pagesRaw) {
    if (!isRecord(p)) continue;
    const name = str(p.name) || str(p.path) || "Page";
    const path = str(p.path) || undefined;
    const purpose = str(p.purpose) || undefined;
    const components = strArr(p.components).length ? strArr(p.components) : strArr(p.key_components);
    pages.push({ name, path, purpose, components });
  }

  const dbRaw = Array.isArray(raw.database_schema) ? raw.database_schema : [];
  const database_schema: SystemDesignBlueprint["database_schema"] = [];
  for (const row of dbRaw) {
    if (!isRecord(row)) continue;
    const table = str(row.table) || str(row.name) || "entity";
    const fields = strArr(row.fields);
    database_schema.push({ table, fields });
  }

  const apiRaw = Array.isArray(raw.api_routes) ? raw.api_routes : [];
  const api_routes: SystemDesignBlueprint["api_routes"] = [];
  for (const r of apiRaw) {
    if (!isRecord(r)) continue;
    const method = str(r.method, "GET").toUpperCase();
    const route = str(r.route) || str(r.path) || "/";
    const description = str(r.description) || undefined;
    api_routes.push({ method, route, description });
  }

  const svcRaw = Array.isArray(raw.backend_services) ? raw.backend_services : [];
  const backend_services: SystemDesignBlueprint["backend_services"] = [];
  for (const s of svcRaw) {
    if (!isRecord(s)) continue;
    backend_services.push({
      name: str(s.name) || "Service",
      technology: str(s.technology) || "—",
      description: str(s.description) || undefined,
    });
  }

  const relRaw = Array.isArray(raw.relationships) ? raw.relationships : [];
  const relationships: SystemDesignBlueprint["relationships"] = [];
  for (const r of relRaw) {
    if (!isRecord(r)) continue;
    relationships.push({
      from: str(r.from),
      to: str(r.to),
      label: r.label != null ? str(r.label) : null,
    });
  }

  const ucRaw = Array.isArray(raw.use_cases) ? raw.use_cases : [];
  const use_cases: SystemDesignBlueprint["use_cases"] = [];
  for (const u of ucRaw) {
    if (!isRecord(u)) continue;
    use_cases.push({
      id: str(u.id) || `UC-${use_cases.length + 1}`,
      actor: str(u.actor) || "User",
      goal: str(u.goal) || "",
      steps: strArr(u.steps),
    });
  }

  const tasksRaw = Array.isArray(raw.tasks) ? raw.tasks : [];
  const tasks: SystemDesignBlueprint["tasks"] = [];
  for (const t of tasksRaw) {
    if (!isRecord(t)) continue;
    const pts = t.estimate_points;
    tasks.push({
      title: str(t.title) || "Task",
      description: str(t.description) || "",
      estimate_points: typeof pts === "number" ? pts : null,
    });
  }

  const wireframe_suggestions = strArr(raw.wireframe_suggestions);

  const nodesRaw = Array.isArray(raw.react_flow_nodes) ? raw.react_flow_nodes : [];
  const react_flow_nodes: SystemDesignBlueprint["react_flow_nodes"] = [];
  for (const n of nodesRaw) {
    if (!isRecord(n)) continue;
    const pos = isRecord(n.position) ? n.position : {};
    const data = isRecord(n.data) ? n.data : {};
    react_flow_nodes.push({
      id: str(n.id) || `n-${react_flow_nodes.length}`,
      position: {
        x: typeof pos.x === "number" ? pos.x : 0,
        y: typeof pos.y === "number" ? pos.y : 0,
      },
      data: { label: str(data.label) || str(n.id) || "Node" },
    });
  }

  const edgesRaw = Array.isArray(raw.react_flow_edges) ? raw.react_flow_edges : [];
  const react_flow_edges: SystemDesignBlueprint["react_flow_edges"] = [];
  for (const e of edgesRaw) {
    if (!isRecord(e)) continue;
    react_flow_edges.push({
      id: str(e.id) || `e-${react_flow_edges.length}`,
      source: str(e.source),
      target: str(e.target),
      label: e.label != null ? str(e.label) : null,
    });
  }

  if (!str(raw.project_name) && (pages.length || api_routes.length)) {
    warnings.push("Missing project_name in JSON.");
  }

  return {
    ok: true,
    blueprint: {
      project_name: str(raw.project_name) || "Untitled project",
      description: str(raw.description),
      pages,
      backend_services,
      database_schema,
      api_routes,
      use_cases,
      relationships,
      diagrams,
      tasks,
      wireframe_suggestions,
      react_flow_nodes,
      react_flow_edges,
    },
    warnings,
  };
}

/** Serialize blueprint back to a storable JSON object (e.g. Firestore). */
export function blueprintToStorageJson(b: SystemDesignBlueprint): Record<string, unknown> {
  return JSON.parse(JSON.stringify(b)) as Record<string, unknown>;
}
