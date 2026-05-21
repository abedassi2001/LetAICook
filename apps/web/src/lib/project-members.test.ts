import { describe, expect, it } from "vitest";

import {
  isValidMemberEmail,
  memberDocIdFromEmail,
  normalizeMemberEmail,
} from "./project-members";

describe("project-members", () => {
  it("normalizes email to lowercase", () => {
    expect(normalizeMemberEmail("  Alex@Example.COM ")).toBe("alex@example.com");
  });

  it("builds stable member doc ids", () => {
    expect(memberDocIdFromEmail("alex@example.com")).toBe("alex_at_example_com");
  });

  it("validates email format", () => {
    expect(isValidMemberEmail("good@team.io")).toBe(true);
    expect(isValidMemberEmail("not-an-email")).toBe(false);
  });
});
