/**
 * Normalize AI/imported Mermaid before Mermaid 11 render.
 * Fixes fenced blocks, prose-only text, and legacy `graph` directives.
 */

const DIAGRAM_START =
  /^(flowchart|graph|sequenceDiagram|classDiagram|erDiagram|stateDiagram|stateDiagram-v2|C4Context|C4Container|C4Component|mindmap|timeline|sankey-beta|pie|gantt|gitGraph|journey|quadrantChart|requirementDiagram|zenuml|packetBeta|block-beta|xychart-beta|architecture-beta)\b/i;

const HAS_DIAGRAM_BODY = /(-->|---|->>|--x|==>|subgraph\b|participant\b|class\b|erDiagram)/i;

const FLOWCHART_KIND = /^flowchart\b/i;

/** Mermaid 11 requires quotes when labels contain parentheses, commas, etc. */
function quoteFlowchartLabel(inner: string): string {
  const t = inner.trim();
  if (!t || (t.startsWith('"') && t.endsWith('"'))) return `[${inner}]`;
  if (/[()#,;]/.test(t)) {
    return `["${t.replace(/"/g, "'")}"]`;
  }
  return `[${inner}]`;
}

function repairFlowchartLine(line: string): string {
  let out = line.replace(/\[([^\]"\n]+)\]/g, (_, inner: string) =>
    quoteFlowchartLabel(inner),
  );
  // Rounded nodes: Node(Text (nested)) → Node["Text (nested)"]
  out = out.replace(
    /\b([\w-]+)\(([^()\n]+(?:\([^)\n]*\)[^()\n]*)*)\)/g,
    (match, id: string, inner: string) => {
      const t = inner.trim();
      if (!/[()]/.test(t)) return match;
      return `${id}["${t.replace(/"/g, "'")}"]`;
    },
  );
  return out;
}

function repairFlowchartLabels(source: string): string {
  const lines = source.split("\n");
  const isFlowchart = lines.some((line) => FLOWCHART_KIND.test(line.trim()));
  if (!isFlowchart) return source;

  return lines
    .map((line, index) => {
      const trimmed = line.trim();
      if (index === 0 && DIAGRAM_START.test(trimmed)) return line;
      if (!trimmed || /^end\b/i.test(trimmed)) return line;
      if (/^(classDef|class|click|linkStyle|style)\b/i.test(trimmed)) return line;
      if (/^subgraph\b/i.test(trimmed) && !/\[/.test(trimmed)) return line;
      return repairFlowchartLine(line);
    })
    .join("\n");
}

export function sanitizeMermaidSource(raw: string): string {
  let s = raw.replace(/\r\n/g, "\n").trim();
  if (!s) return "";

  // Unwrap ```mermaid ... ``` or plain ```
  const fence = s.match(/^```(?:mermaid)?\s*\n?([\s\S]*?)\n?```$/i);
  if (fence) s = fence[1].trim();
  else {
    s = s.replace(/^```(?:mermaid)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  }

  if (!s) return "";

  // Prose / JSON mistaken for diagram source
  if (s.startsWith("{") || s.startsWith("[")) return "";

  const lines = s.split("\n");
  const startIdx = lines.findIndex((line) => DIAGRAM_START.test(line.trim()));
  if (startIdx > 0) s = lines.slice(startIdx).join("\n");
  else if (startIdx === -1 && HAS_DIAGRAM_BODY.test(s)) {
    s = `flowchart LR\n${s}`;
  } else if (startIdx === -1) {
    return "";
  }

  // Mermaid 11: prefer flowchart over deprecated graph directive
  s = s.replace(/^graph(\s+(?:TB|BT|RL|LR|TD|DT)?\s*)$/gim, "flowchart$1");
  s = s.replace(/^graph\s+/gim, "flowchart ");

  s = repairFlowchartLabels(s);

  return s.trim();
}

export function isRenderableMermaid(raw: string): boolean {
  const s = sanitizeMermaidSource(raw);
  if (!s) return false;
  const first = s.split("\n")[0]?.trim() ?? "";
  return DIAGRAM_START.test(first);
}
