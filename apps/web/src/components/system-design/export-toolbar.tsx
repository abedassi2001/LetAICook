"use client";

import type { SystemDesignBlueprint } from "@/lib/system-design/types";
import {
  exportBlueprintJson,
  exportBlueprintMarkdown,
  exportElementPng,
} from "@/lib/system-design/export-client";
import type { RefObject } from "react";

type Props = {
  blueprint: SystemDesignBlueprint | null;
  exportRegionRef: RefObject<HTMLDivElement | null>;
};

export function ExportToolbar({ blueprint, exportRegionRef }: Props) {
  const disabled = !blueprint;

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-app-muted transition-colors hover:text-app-accent disabled:opacity-40"
        disabled={disabled}
        onClick={() => blueprint && exportBlueprintJson(blueprint)}
      >
        Export JSON
      </button>
      <button
        type="button"
        className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-app-muted transition-colors hover:text-app-accent disabled:opacity-40"
        disabled={disabled}
        onClick={() => blueprint && exportBlueprintMarkdown(blueprint)}
      >
        Export Markdown
      </button>
      <button
        type="button"
        className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-app-muted transition-colors hover:text-app-accent disabled:opacity-40"
        disabled={disabled}
        onClick={() => {
          const el = exportRegionRef.current;
          if (!el || !blueprint) return;
          void exportElementPng(el, blueprint.project_name || "design");
        }}
      >
        Export PNG
      </button>
    </div>
  );
}
