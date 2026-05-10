"use client";

import type { SystemDesignBlueprint } from "@/lib/system-design/types";

export function ServiceMap({ blueprint }: { blueprint: SystemDesignBlueprint }) {
  if (!blueprint.backend_services.length) {
    return (
      <p className="text-sm text-app-muted">No backend_services in the current design JSON.</p>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {blueprint.backend_services.map((s) => (
        <div
          key={s.name}
          className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-md"
        >
          <h4 className="font-medium text-app-accent">{s.name}</h4>
          <p className="mt-1 text-xs uppercase tracking-wide text-app-muted">{s.technology}</p>
          {s.description ? <p className="mt-2 text-sm text-app-muted">{s.description}</p> : null}
        </div>
      ))}
    </div>
  );
}
