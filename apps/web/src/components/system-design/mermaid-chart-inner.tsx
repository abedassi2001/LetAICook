"use client";

import { useEffect, useId, useRef, useState } from "react";

type Props = {
  chart: string;
  className?: string;
};

export function MermaidChartInner({ chart, className }: Props) {
  const reactId = useId().replace(/:/g, "");
  const containerRef = useRef<HTMLDivElement>(null);
  const renderSeq = useRef(0);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!chart.trim()) return;
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "dark",
          securityLevel: "loose",
          fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
        });
        renderSeq.current += 1;
        const { svg } = await mermaid.render(
          `mmd-${reactId}-${renderSeq.current}`,
          chart,
        );
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
          setErr(null);
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Diagram error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chart, reactId]);

  if (!chart.trim()) {
    return <p className="text-sm text-app-muted">No diagram in JSON for this view.</p>;
  }
  if (err) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-950/30 p-3 text-sm text-red-200">
        <p className="font-medium">Mermaid</p>
        <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-xs opacity-90">{err}</pre>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`mermaid-svg overflow-x-auto rounded-xl border border-white/10 bg-black/40 p-4 ${className ?? ""}`}
    />
  );
}
