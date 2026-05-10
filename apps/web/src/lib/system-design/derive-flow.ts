import type { SystemDesignBlueprint } from "@/lib/system-design/types";
import type { Edge, Node } from "reactflow";

function stableId(label: string, index: number): string {
  const base = label.replace(/[^\w-]+/g, "_").slice(0, 40) || "node";
  return `${base}_${index}`;
}

/**
 * Data-driven graph: use AI-provided react_flow_* if present; otherwise derive nodes/edges from `relationships`.
 */
export function resolveReactFlow(blueprint: SystemDesignBlueprint): { nodes: Node[]; edges: Edge[] } {
  if (blueprint.react_flow_nodes.length > 0) {
    const nodes: Node[] = blueprint.react_flow_nodes.map((n) => ({
      id: n.id,
      type: "default",
      position: n.position,
      data: { label: n.data.label },
    }));
    const edges: Edge[] = blueprint.react_flow_edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label ?? undefined,
      animated: true,
    }));
    return { nodes, edges };
  }

  const rels = blueprint.relationships.filter((r) => r.from && r.to);
  if (rels.length === 0) {
    return { nodes: [], edges: [] };
  }

  const labels: string[] = [];
  const seen = new Set<string>();
  for (const r of rels) {
    if (!seen.has(r.from)) {
      seen.add(r.from);
      labels.push(r.from);
    }
    if (!seen.has(r.to)) {
      seen.add(r.to);
      labels.push(r.to);
    }
  }

  const labelToId = new Map<string, string>();
  labels.forEach((label, i) => {
    labelToId.set(label, stableId(label, i));
  });

  const nodes: Node[] = labels.map((label, i) => ({
    id: labelToId.get(label)!,
    type: "default",
    position: { x: (i % 4) * 220, y: Math.floor(i / 4) * 140 },
    data: { label },
  }));

  const edges: Edge[] = rels.map((r, i) => ({
    id: `rel-${i}`,
    source: labelToId.get(r.from)!,
    target: labelToId.get(r.to)!,
    label: r.label ?? undefined,
    animated: true,
  }));

  return { nodes, edges };
}
