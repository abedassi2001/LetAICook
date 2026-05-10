import type { SystemDesignBlueprint } from "@/lib/system-design/types";

export function blueprintToMarkdown(b: SystemDesignBlueprint): string {
  const lines: string[] = [`# ${b.project_name}`, ""];
  if (b.description) {
    lines.push(b.description, "");
  }

  lines.push("## Backend services");
  for (const s of b.backend_services) {
    lines.push(`- **${s.name}** (${s.technology})${s.description ? ` — ${s.description}` : ""}`);
  }
  lines.push("");

  lines.push("## Pages");
  for (const p of b.pages) {
    lines.push(`- **${p.name}**${p.path ? ` \`${p.path}\`` : ""}${p.purpose ? ` — ${p.purpose}` : ""}`);
    if (p.components.length) lines.push(`  - Components: ${p.components.join(", ")}`);
  }
  lines.push("");

  lines.push("## Database");
  for (const e of b.database_schema) {
    lines.push(`### ${e.table}`, e.fields.map((f) => `- ${f}`).join("\n"), "");
  }

  lines.push("## API routes");
  for (const r of b.api_routes) {
    lines.push(`- \`${r.method} ${r.route}\`${r.description ? ` — ${r.description}` : ""}`);
  }
  lines.push("");

  lines.push("## Relationships");
  for (const r of b.relationships) {
    lines.push(`- ${r.from} → ${r.to}${r.label ? ` (${r.label})` : ""}`);
  }
  lines.push("");

  lines.push("## Use cases");
  for (const u of b.use_cases) {
    lines.push(`### ${u.id} (${u.actor})`, u.goal, "", ...u.steps.map((s) => `1. ${s}`), "");
  }

  lines.push("## Sprint tasks");
  for (const t of b.tasks) {
    lines.push(
      `- **${t.title}**${t.estimate_points != null ? ` (${t.estimate_points} pts)` : ""}`,
      `  ${t.description}`,
      "",
    );
  }

  lines.push("## Wireframe suggestions");
  for (const w of b.wireframe_suggestions) lines.push(`- ${w}`);
  lines.push("");

  const d = b.diagrams;
  if (d.architecture) lines.push("## Mermaid — Architecture", "```mermaid", d.architecture, "```", "");
  if (d.sequence) lines.push("## Mermaid — Sequence", "```mermaid", d.sequence, "```", "");
  if (d.erd) lines.push("## Mermaid — ERD", "```mermaid", d.erd, "```", "");
  if (d.class) lines.push("## Mermaid — Class", "```mermaid", d.class, "```", "");
  if (d.user_flow) lines.push("## Mermaid — User flow", "```mermaid", d.user_flow, "```", "");

  return lines.join("\n");
}
