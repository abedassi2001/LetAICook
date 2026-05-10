"use client";

import dynamic from "next/dynamic";

const MermaidChartInner = dynamic(
  () => import("./mermaid-chart-inner").then((m) => ({ default: m.MermaidChartInner })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-32 items-center justify-center rounded-xl border border-white/10 bg-black/20 text-sm text-app-muted">
        Loading diagram…
      </div>
    ),
  },
);

type Props = { chart: string; className?: string };

export function MermaidChart(props: Props) {
  return <MermaidChartInner {...props} />;
}
