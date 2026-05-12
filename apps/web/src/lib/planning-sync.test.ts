import { describe, expect, it } from "vitest";

import { buildProjectDescriptionFromMessages } from "./planning-sync";

describe("buildProjectDescriptionFromMessages", () => {
  it("joins trimmed user messages with blank lines", () => {
    expect(
      buildProjectDescriptionFromMessages([
        { role: "user", content: "  First scope.  " },
        { role: "assistant", content: "ignored" },
        { role: "user", content: "Second idea" },
      ]),
    ).toBe("First scope.\n\nSecond idea");
  });

  it("drops empty user lines", () => {
    expect(
      buildProjectDescriptionFromMessages([
        { role: "user", content: "   " },
        { role: "user", content: "Only this" },
      ]),
    ).toBe("Only this");
  });

  it("returns empty string when no user content", () => {
    expect(
      buildProjectDescriptionFromMessages([{ role: "assistant", content: "Hi" }]),
    ).toBe("");
  });
});
