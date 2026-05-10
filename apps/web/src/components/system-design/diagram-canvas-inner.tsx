"use client";

import { resolveReactFlow } from "@/lib/system-design/derive-flow";
import type { SystemDesignBlueprint } from "@/lib/system-design/types";
import { useCallback, useEffect, useMemo } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
} from "reactflow";

type Props = {
  blueprint: SystemDesignBlueprint;
  className?: string;
};

function DiagramCanvasImpl({ blueprint, className }: Props) {
  const sig = useMemo(() => JSON.stringify(blueprint), [blueprint]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    const b = JSON.parse(sig) as SystemDesignBlueprint;
    const { nodes: n, edges: e } = resolveReactFlow(b);
    setNodes(n);
    setEdges(e);
  }, [sig, setNodes, setEdges]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true }, eds)),
    [setEdges],
  );

  if (nodes.length === 0) {
    return (
      <div
        className={`flex h-[min(400px,50vh)] items-center justify-center rounded-2xl border border-dashed border-white/20 bg-black/20 text-center text-sm text-app-muted ${className ?? ""}`}
      >
        No architecture graph yet. Add <code className="text-app-accent/80">relationships</code> or{" "}
        <code className="text-app-accent/80">react_flow_nodes</code> in your design JSON, or generate from the API.
      </div>
    );
  }

  return (
    <div className={`h-[min(520px,55vh)] w-full rounded-2xl border border-white/10 bg-black/30 ${className ?? ""}`}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
        className="!bg-transparent"
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} size={1} color="rgba(52,211,153,0.15)" />
        <Controls className="!bg-app-elevated/90 !border-app-border !shadow-lg" />
        <MiniMap
          className="!bg-app-elevated/90 !border-app-border"
          nodeColor={() => "rgba(52,211,153,0.5)"}
        />
      </ReactFlow>
    </div>
  );
}

export function DiagramCanvasInner(props: Props) {
  return (
    <ReactFlowProvider>
      <DiagramCanvasImpl {...props} />
    </ReactFlowProvider>
  );
}
