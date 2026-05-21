import { describe, expect, it } from "vitest";

import {
  isDisposableEmailDomain,
  isValidEmailFormat,
  memberDocIdFromEmail,
  normalizeEmail,
} from "./email-utils";

describe("email-utils", () => {
  it("normalizes email", () => {
    expect(normalizeEmail("  Alex@Example.COM ")).toBe("alex@example.com");
  });

  it("builds stable doc ids", () => {
    expect(memberDocIdFromEmail("alex@example.com")).toBe("alex_at_example_com");
  });

  it("accepts valid work-style emails", () => {
    expect(isValidEmailFormat("alex@company.co.il")).toBe(true);
    expect(isValidEmailFormat("dev+tag@startup.io")).toBe(true);
  });

  it("rejects invalid formats", () => {
    expect(isValidEmailFormat("not-an-email")).toBe(false);
    expect(isValidEmailFormat("a@b")).toBe(false);
    expect(isValidEmailFormat("@missing.com")).toBe(false);
    expect(isValidEmailFormat("spaces here@test.com")).toBe(false);
  });

  it("flags disposable domains", () => {
    expect(isDisposableEmailDomain("x@mailinator.com")).toBe(true);
    expect(isDisposableEmailDomain("x@company.com")).toBe(false);
  });
});
