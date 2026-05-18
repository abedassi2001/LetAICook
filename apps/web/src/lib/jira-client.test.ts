import { describe, expect, it } from "vitest";
import {
  jiraCredentialsFromProfile,
  jiraHeaders,
  resolveJiraClientAuth,
} from "./jira-client";
import type { UserProfileDoc } from "./user-model";

describe("jiraCredentialsFromProfile", () => {
  it("returns null when credentials are incomplete", () => {
    expect(jiraCredentialsFromProfile(null)).toBeNull();
    expect(
      jiraCredentialsFromProfile({
        jiraDomain: "acme.atlassian.net",
      } as UserProfileDoc),
    ).toBeNull();
  });

  it("returns credentials when domain, email, and token are set", () => {
    const creds = jiraCredentialsFromProfile({
      jiraDomain: " acme.atlassian.net ",
      jiraEmail: " dev@acme.com ",
      jiraApiToken: " secret ",
      jiraDefaultProject: " PROJ ",
    } as UserProfileDoc);
    expect(creds).toEqual({
      domain: "acme.atlassian.net",
      email: "dev@acme.com",
      apiToken: "secret",
      defaultProject: "PROJ",
    });
  });
});

describe("resolveJiraClientAuth", () => {
  it("prefers oauth when user is signed in", () => {
    const auth = resolveJiraClientAuth(
      { getIdToken: async () => "tok" } as never,
      null,
    );
    expect(auth?.mode).toBe("oauth");
  });

  it("falls back to manual without user", () => {
    const auth = resolveJiraClientAuth(null, {
      jiraDomain: "acme.atlassian.net",
      jiraEmail: "a@b.com",
      jiraApiToken: "secret",
    } as never);
    expect(auth?.mode).toBe("manual");
  });
});

describe("jiraHeaders", () => {
  it("maps credentials to proxy headers", () => {
    expect(
      jiraHeaders({
        domain: "acme.atlassian.net",
        email: "dev@acme.com",
        apiToken: "tok",
        defaultProject: "ABC",
      }),
    ).toMatchObject({
      "X-Jira-Domain": "acme.atlassian.net",
      "X-Jira-Email": "dev@acme.com",
      "X-Jira-Token": "tok",
      "X-Jira-Project": "ABC",
    });
  });
});
