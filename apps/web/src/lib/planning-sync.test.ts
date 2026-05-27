import { describe, expect, it } from "vitest";

import {
  buildPlanningDescriptionFallback,
  buildProjectDescriptionFromMessages,
  selectPlanningDescriptionForHandoff,
  resolveSystemDesignerDescription,
} from "./planning-sync";

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

describe("buildPlanningDescriptionFallback", () => {
  it("returns user-only text when there is no assistant follow-up", () => {
    expect(
      buildPlanningDescriptionFallback([{ role: "user", content: "Parking app" }]),
    ).toBe("Parking app");
  });

  it("appends the latest assistant notes when the conversation has replies", () => {
    const out = buildPlanningDescriptionFallback([
      { role: "user", content: "Parking app" },
      { role: "assistant", content: "Intro" },
      { role: "assistant", content: "Includes payments and admin dashboard." },
    ]);
    expect(out).toContain("Parking app");
    expect(out).toContain("Planning notes:");
    expect(out).toContain("payments and admin dashboard");
  });
});

describe("selectPlanningDescriptionForHandoff", () => {
  it("prefers a stored summary over fallback", () => {
    expect(
      selectPlanningDescriptionForHandoff({
        storedSummary: "Gemini summary of the project.",
        messages: [{ role: "user", content: "raw prompt only" }],
      }),
    ).toBe("Gemini summary of the project.");
  });

  it("falls back when summary is empty", () => {
    expect(
      selectPlanningDescriptionForHandoff({
        storedSummary: "   ",
        messages: [{ role: "user", content: "Only user text" }],
      }),
    ).toBe("Only user text");
  });
});

describe("resolveSystemDesignerDescription", () => {
  it("prefers planning when no Firestore draft exists", () => {
    expect(
      resolveSystemDesignerDescription({
        planningDescription: "Latest scope",
        planningSavedAtMs: 200,
      }),
    ).toEqual({
      description: "Latest scope",
      manualOverride: false,
    });
  });

  it("prefers planning over non-manual Firestore drafts", () => {
    expect(
      resolveSystemDesignerDescription({
        planningDescription: "Latest scope",
        planningSavedAtMs: 200,
        firestoreDescriptionDraft: "Older scope",
        firestoreDescriptionDraftManual: false,
        firestoreUpdatedAtMs: 100,
      }),
    ).toEqual({
      description: "Latest scope",
      manualOverride: false,
    });
  });

  it("preserves manual Firestore drafts", () => {
    expect(
      resolveSystemDesignerDescription({
        planningDescription: "Latest scope",
        planningSavedAtMs: 200,
        firestoreDescriptionDraft: "Custom manual scope",
        firestoreDescriptionDraftManual: true,
        firestoreUpdatedAtMs: 100,
      }),
    ).toEqual({
      description: "Custom manual scope",
      manualOverride: true,
    });
  });

  it("uses newer planning for legacy drafts without a manual flag", () => {
    expect(
      resolveSystemDesignerDescription({
        planningDescription: "Latest scope",
        planningSavedAtMs: 200,
        firestoreDescriptionDraft: "Legacy draft",
        firestoreUpdatedAtMs: 100,
      }),
    ).toEqual({
      description: "Latest scope",
      manualOverride: false,
    });
  });

  it("keeps newer legacy Firestore drafts when planning is older", () => {
    expect(
      resolveSystemDesignerDescription({
        planningDescription: "Old planning scope",
        planningSavedAtMs: 100,
        firestoreDescriptionDraft: "Newer saved draft",
        firestoreUpdatedAtMs: 200,
      }),
    ).toEqual({
      description: "Newer saved draft",
      manualOverride: true,
    });
  });
});
