import { describe, expect, it } from "vitest";

import { isRenderableMermaid, sanitizeMermaidSource } from "./sanitize-mermaid";

describe("sanitizeMermaidSource", () => {
  it("unwraps mermaid fences", () => {
    expect(sanitizeMermaidSource("```mermaid\nflowchart LR\nA-->B\n```")).toBe(
      "flowchart LR\nA-->B",
    );
  });

  it("converts graph to flowchart", () => {
    expect(sanitizeMermaidSource("graph LR\nA-->B")).toBe("flowchart LR\nA-->B");
  });

  it("returns empty for prose-only text", () => {
    expect(sanitizeMermaidSource("The system uses Next.js and FastAPI.")).toBe("");
    expect(isRenderableMermaid("The system uses Next.js and FastAPI.")).toBe(false);
  });

  it("prepends flowchart when body has arrows but no directive", () => {
    expect(sanitizeMermaidSource("A[Web] --> B[API]")).toBe("flowchart LR\nA[Web] --> B[API]");
  });

  it("skips lines before the diagram directive", () => {
    expect(
      sanitizeMermaidSource("Title line\nflowchart TD\nA-->B"),
    ).toBe("flowchart TD\nA-->B");
  });

  it("quotes flowchart labels that contain parentheses (Mermaid 11)", () => {
    const input = `flowchart LR
Clients[Clients (Browser)] --> NextJS[Next.js App]`;
    const out = sanitizeMermaidSource(input);
    expect(out).toContain('Clients["Clients (Browser)"]');
    expect(out).toContain("NextJS[Next.js App]");
  });
});
