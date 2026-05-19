/** User-facing messages for Jira OAuth (codes match apps/api letaicook_api/services/jira_oauth.py). */

const CALLBACK_MESSAGES: Record<string, string> = {
  jira_oauth_not_configured:
    "Jira integration is not configured by this deployment. Please ask your administrator to enable it.",
  jira_oauth_misconfigured:
    "Jira integration is not configured by this deployment. Please ask your administrator to complete the server setup.",
  jira_oauth_distribution:
    "This app is not yet approved for your Atlassian account. Ask the letAIcook administrator to enable access for external users in the Atlassian Developer Console.",
  jira_no_sites:
    "Your Atlassian account does not have access to any Jira Cloud site. Create a Jira site or ask an admin to invite you, then try again.",
  jira_oauth_denied: "Jira connection was cancelled.",
  jira_oauth_failed:
    "We could not finish connecting to Jira. Please try again.",
  missing_params:
    "We could not finish connecting to Jira. Please try again.",
};

type ApiErrorDetail =
  | string
  | {
      message?: string;
      code?: string;
      admin_message?: string;
    };

export function parseJiraApiError(raw: string, status: number): string {
  try {
    const body = JSON.parse(raw) as { detail?: ApiErrorDetail };
    const detail = body.detail;
    if (typeof detail === "string") return detail;
    if (detail && typeof detail === "object") {
      if (detail.message) return detail.message;
      if (detail.code && CALLBACK_MESSAGES[detail.code]) {
        return CALLBACK_MESSAGES[detail.code];
      }
    }
  } catch {
    /* use raw */
  }
  if (status === 503) {
    return CALLBACK_MESSAGES.jira_oauth_not_configured;
  }
  return raw || "Something went wrong while connecting to Jira.";
}

export function jiraCallbackErrorMessage(reason: string | null): string {
  if (!reason) return CALLBACK_MESSAGES.jira_oauth_failed;
  return CALLBACK_MESSAGES[reason] ?? CALLBACK_MESSAGES.jira_oauth_failed;
}
