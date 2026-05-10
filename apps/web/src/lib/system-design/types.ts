/**
 * Canonical, UI-facing model for the System Designer.
 * Populated only from validated/normalized AI or imported JSON — never hardcoded diagrams.
 */

export type SystemDesignDiagrams = {
  architecture: string;
  sequence: string;
  erd: string;
  class: string;
  user_flow: string;
};

export type SystemDesignBlueprint = {
  project_name: string;
  description: string;
  pages: Array<{
    name: string;
    path?: string;
    purpose?: string;
    components: string[];
  }>;
  backend_services: Array<{
    name: string;
    technology: string;
    description?: string;
  }>;
  database_schema: Array<{ table: string; fields: string[] }>;
  api_routes: Array<{
    method: string;
    route: string;
    description?: string;
  }>;
  use_cases: Array<{
    id: string;
    actor: string;
    goal: string;
    steps: string[];
  }>;
  relationships: Array<{ from: string; to: string; label?: string | null }>;
  diagrams: SystemDesignDiagrams;
  tasks: Array<{
    title: string;
    description: string;
    estimate_points: number | null;
  }>;
  wireframe_suggestions: string[];
  react_flow_nodes: Array<{
    id: string;
    position: { x: number; y: number };
    data: { label: string };
  }>;
  react_flow_edges: Array<{
    id: string;
    source: string;
    target: string;
    label: string | null;
  }>;
};

export const EMPTY_DIAGRAMS: SystemDesignDiagrams = {
  architecture: "",
  sequence: "",
  erd: "",
  class: "",
  user_flow: "",
};

export function emptyBlueprint(): SystemDesignBlueprint {
  return {
    project_name: "",
    description: "",
    pages: [],
    backend_services: [],
    database_schema: [],
    api_routes: [],
    use_cases: [],
    relationships: [],
    diagrams: { ...EMPTY_DIAGRAMS },
    tasks: [],
    wireframe_suggestions: [],
    react_flow_nodes: [],
    react_flow_edges: [],
  };
}
