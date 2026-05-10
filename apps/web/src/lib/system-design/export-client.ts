"use client";

import type { SystemDesignBlueprint } from "@/lib/system-design/types";
import { blueprintToMarkdown } from "@/lib/system-design/markdown";

export function downloadTextFile(filename: string, mime: string, text: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportBlueprintJson(b: SystemDesignBlueprint) {
  const name = (b.project_name || "design").replace(/[/\\?%*:|"<>]/g, "-");
  downloadTextFile(`${name}.json`, "application/json", JSON.stringify(b, null, 2));
}

export function exportBlueprintMarkdown(b: SystemDesignBlueprint) {
  const name = (b.project_name || "design").replace(/[/\\?%*:|"<>]/g, "-");
  downloadTextFile(`${name}.md`, "text/markdown", blueprintToMarkdown(b));
}

/** Client-only: dynamic import html2canvas. */
export async function exportElementPng(
  element: HTMLElement,
  filenameBase: string,
  backgroundColor = "#030503",
) {
  const { default: html2canvas } = await import("html2canvas");
  const canvas = await html2canvas(element, { scale: 2, backgroundColor });
  const safe = filenameBase.replace(/[/\\?%*:|"<>]/g, "-");
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = `${safe}-export.png`;
  a.click();
}
