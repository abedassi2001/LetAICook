"use client";

import type { SystemDesignBlueprint } from "@/lib/system-design/types";
import dynamic from "next/dynamic";

const DiagramCanvasInner = dynamic(
  () => import("./diagram-canvas-inner").then((m) => ({ default: m.DiagramCanvasInner })),
  {
    ssr: false,
    loading: () => (
      <div className="h-[min(520px,55vh)] animate-pulse rounded-2xl border border-white/10 bg-white/5" />
    ),
  },
);

type Props = { blueprint: SystemDesignBlueprint; className?: string };

export function DiagramCanvas(props: Props) {
  return <DiagramCanvasInner {...props} />;
}
