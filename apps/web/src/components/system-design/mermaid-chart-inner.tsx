"use client";

import {
  isRenderableMermaid,
  sanitizeMermaidSource,
} from "@/lib/system-design/sanitize-mermaid";
import { useEffect, useId, useRef, useState } from "react";

type Props = {
  chart: string;
  className?: string;
};

let mermaidInitPromise: Promise<typeof import("mermaid")["default"]> | null = null;

async function getMermaid() {
  if (!mermaidInitPromise) {
    mermaidInitPromise = import("mermaid").then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        theme: "dark",
        securityLevel: "loose",
        fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
      });
      return mermaid;
    });
  }
  return mermaidInitPromise;
}

export function MermaidChartInner({ chart, className }: Props) {
  const reactId = useId().replace(/:/g, "");
  const containerRef = useRef<HTMLDivElement>(null);
  const renderSeq = useRef(0);
  const [err, setErr] = useState<string | null>(null);

  const sanitized = sanitizeMermaidSource(chart);
  const canRender = isRenderableMermaid(chart);

  useEffect(() => {
    if (!canRender || !sanitized) {
      setErr(null);
      if (containerRef.current) containerRef.current.innerHTML = "";
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const mermaid = await getMermaid();
        await mermaid.parse(sanitized);
        renderSeq.current += 1;
        const { svg } = await mermaid.render(
          `mmd-${reactId}-${renderSeq.current}`,
          sanitized,
        );
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
          setErr(null);
        }
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : "Diagram error");
          if (containerRef.current) containerRef.current.innerHTML = "";
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sanitized, canRender, reactId]);

  if (!chart.trim()) {
    return <p className="text-sm text-app-muted">No diagram in JSON for this view.</p>;
  }

  if (!canRender) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-950/25 p-3 text-sm text-amber-100">
        <p className="font-medium">Not valid Mermaid yet</p>
        <p className="mt-1 text-xs opacity-90">
          This field looks like plain text, not a Mermaid diagram. Open the{" "}
          <strong>Architecture</strong> tab and use <strong>Regenerate architecture</strong>, or
          edit the JSON so the field starts with e.g.{" "}
          <code className="text-amber-200">flowchart LR</code> or{" "}
          <code className="text-amber-200">sequenceDiagram</code>.
        </p>
      </div>
    );
  }

  if (err) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-950/30 p-3 text-sm text-red-200">
        <p className="font-medium">Could not render diagram</p>
        <pre className="app-scrollbar mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-xs opacity-90">
          {err}
        </pre>
        <details className="mt-2 text-xs opacity-80">
          <summary className="cursor-pointer">Source</summary>
          <pre className="app-scrollbar mt-1 max-h-32 overflow-auto whitespace-pre-wrap">{sanitized}</pre>
        </details>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`app-scrollbar mermaid-svg overflow-x-auto overflow-y-auto max-h-[min(70vh,640px)] rounded-xl border border-white/10 bg-black/40 p-4 ${className ?? ""}`}
    />
  );
}
