import { describe, expect, it } from "vitest";
import { jiraCallbackErrorMessage, parseJiraApiError } from "./jira-errors";

describe("parseJiraApiError", () => {
  it("reads structured API error message and code", () => {
    const msg = parseJiraApiError(
      JSON.stringify({
        detail: {
          message:
            "Jira integration is not configured by this deployment. Please ask your administrator to enable it.",
          code: "jira_oauth_not_configured",
        },
      }),
      503,
    );
    expect(msg).toContain("not configured by this deployment");
  });

  it("maps callback reason codes to friendly text", () => {
    expect(jiraCallbackErrorMessage("jira_no_sites")).toContain(
      "does not have access to any Jira Cloud site",
    );
    expect(jiraCallbackErrorMessage("jira_oauth_distribution")).toContain(
      "administrator",
    );
  });
});
