"use client";

import type { SystemDesignBlueprint } from "@/lib/system-design/types";

export function DatabaseViewer({ blueprint }: { blueprint: SystemDesignBlueprint }) {
  if (!blueprint.database_schema.length) {
    return (
      <p className="text-sm text-app-muted">No database_schema in the current design JSON.</p>
    );
  }
  return (
    <div className="space-y-3">
      {blueprint.database_schema.map((e) => (
        <div
          key={e.table}
          className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-md transition-transform hover:scale-[1.01]"
        >
          <h4 className="font-medium text-app-text">{e.table}</h4>
          <ul className="mt-2 text-sm text-app-muted">
            {e.fields.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
