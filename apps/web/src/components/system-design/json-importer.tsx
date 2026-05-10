"use client";

import { parseDesignJson } from "@/lib/system-design/normalize";
import type { SystemDesignBlueprint } from "@/lib/system-design/types";
import { useState } from "react";

type Props = {
  onApply: (blueprint: SystemDesignBlueprint, raw: Record<string, unknown>) => void;
};

export function JsonImporter({ onApply }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  function apply() {
    setError(null);
    try {
      const raw = JSON.parse(text) as unknown;
      if (!isRecord(raw)) {
        setError("JSON root must be an object.");
        return;
      }
      const { blueprint, warnings } = parseDesignJson(raw);
      if (warnings.length) {
        console.warn("Design import warnings:", warnings);
      }
      onApply(blueprint, raw);
      setOpen(false);
      setText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid JSON");
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-app-muted hover:border-app-accent/40 hover:text-app-accent"
      >
        {open ? "Cancel import" : "Import JSON"}
      </button>
      {open ? (
        <div className="mt-3 space-y-2 rounded-xl border border-white/10 bg-black/30 p-3">
          <p className="text-xs text-app-muted">
            Paste AI design JSON (nested <code className="text-app-accent/80">diagrams</code> or legacy flat
            keys). Data is validated and normalized.
          </p>
          <textarea
            className="min-h-[160px] w-full rounded-lg border border-app-border bg-app-bg px-3 py-2 font-mono text-xs text-app-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder='{ "project_name": "...", "diagrams": { ... } }'
          />
          {error ? <p className="text-xs text-red-300">{error}</p> : null}
          <button
            type="button"
            onClick={() => apply()}
            className="rounded-lg bg-app-accent px-3 py-1.5 text-xs font-semibold text-app-on-accent"
          >
            Parse & load
          </button>
        </div>
      ) : null}
    </div>
  );
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
