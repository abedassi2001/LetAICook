import { describe, expect, it } from "vitest";

import { parseDesignJson } from "./normalize";

describe("parseDesignJson", () => {
  it("uses empty blueprint and warning for non-object input", () => {
    const r = parseDesignJson(null);
    expect(r.ok).toBe(true);
    expect(r.warnings).toContain("Input was not an object — using empty blueprint.");
    expect(r.blueprint.project_name).toBe("");
    expect(r.blueprint.diagrams.architecture).toBe("");
  });

  it("merges legacy flat diagram keys when diagrams nested is absent", () => {
    const r = parseDesignJson({
      project_name: "P",
      architecture_diagram: "graph LR\nX-->Y",
      sequence_diagram: "sequenceDiagram\nAlice->>Bob: hi",
    });
    expect(r.warnings.length).toBe(0);
    expect(r.blueprint.diagrams.architecture).toBe("flowchart LR\nX-->Y");
    expect(r.blueprint.diagrams.sequence).toBe("sequenceDiagram\nAlice->>Bob: hi");
  });

  it("prefers nested diagrams over legacy flat keys", () => {
    const r = parseDesignJson({
      project_name: "P",
      diagrams: { architecture: "flowchart LR\nN-->M" },
      architecture_diagram: "legacy",
    });
    expect(r.blueprint.diagrams.architecture).toBe("flowchart LR\nN-->M");
  });

  it("maps page key_components to components", () => {
    const r = parseDesignJson({
      project_name: "App",
      pages: [{ name: "Home", key_components: ["Nav", "Hero"] }],
    });
    expect(r.blueprint.pages).toEqual([
      { name: "Home", path: undefined, purpose: undefined, components: ["Nav", "Hero"] },
    ]);
  });

  it("warns when project_name missing but pages exist", () => {
    const r = parseDesignJson({
      pages: [{ name: "A" }],
    });
    expect(r.warnings.some((w) => w.includes("project_name"))).toBe(true);
    expect(r.blueprint.project_name).toBe("Untitled project");
  });

  it("normalizes react flow nodes and edges", () => {
    const r = parseDesignJson({
      project_name: "RF",
      react_flow_nodes: [
        { id: "1", position: { x: 10, y: 20 }, data: { label: "A" } },
      ],
      react_flow_edges: [{ id: "e1", source: "1", target: "2", label: "to" }],
    });
    expect(r.blueprint.react_flow_nodes[0]).toMatchObject({
      id: "1",
      position: { x: 10, y: 20 },
      data: { label: "A" },
    });
    expect(r.blueprint.react_flow_edges[0]).toMatchObject({
      id: "e1",
      source: "1",
      target: "2",
      label: "to",
    });
  });
});
