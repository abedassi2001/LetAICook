import { describe, expect, it } from "vitest";

import {
  shouldShowRemoteWorkspaceNotice,
  stableDesignJson,
} from "./system-design-workspace-sync";

describe("shouldShowRemoteWorkspaceNotice", () => {
  const base = {
    nowMs: 10_000,
    ignoreRemoteUntilMs: 0,
    remoteUpdatedAtMs: 9_000,
    lastLocalSaveMs: 8_000,
    remoteDescriptionDraft: "Chess app",
    localDescription: "Chess app",
    remoteDesignJson: stableDesignJson({ a: 1 }),
    localDesignJson: stableDesignJson({ a: 1 }),
  };

  it("returns false during ignore grace period after local save", () => {
    expect(
      shouldShowRemoteWorkspaceNotice({
        ...base,
        nowMs: 5_000,
        ignoreRemoteUntilMs: 6_000,
        remoteDescriptionDraft: "Other tab",
        localDescription: "Chess app",
      }),
    ).toBe(false);
  });

  it("returns false when description and design match local (own save echo)", () => {
    expect(shouldShowRemoteWorkspaceNotice(base)).toBe(false);
  });

  it("returns false when only description updated within own-save window and matches", () => {
    expect(
      shouldShowRemoteWorkspaceNotice({
        ...base,
        remoteUpdatedAtMs: 8_500,
        lastLocalSaveMs: 8_000,
      }),
    ).toBe(false);
  });

  it("returns true when design JSON differs", () => {
    expect(
      shouldShowRemoteWorkspaceNotice({
        ...base,
        remoteDesignJson: stableDesignJson({ a: 2 }),
      }),
    ).toBe(true);
  });

  it("returns true when description differs from local", () => {
    expect(
      shouldShowRemoteWorkspaceNotice({
        ...base,
        remoteDescriptionDraft: "Car park app",
        localDescription: "Chess app",
        remoteUpdatedAtMs: 20_000,
        lastLocalSaveMs: 8_000,
      }),
    ).toBe(true);
  });
});
