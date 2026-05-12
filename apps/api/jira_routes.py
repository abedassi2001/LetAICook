"""Jira Cloud REST API integration — proxy routes so secrets stay server-side."""

from __future__ import annotations

import os
from typing import Any

import requests
from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel, Field
from requests.auth import HTTPBasicAuth

router = APIRouter(prefix="/jira", tags=["jira"])

# ---------------------------------------------------------------------------
# Configuration helpers
# ---------------------------------------------------------------------------

def _jira_domain() -> str | None:
    return os.getenv("JIRA_DOMAIN")


def _jira_email() -> str | None:
    return os.getenv("JIRA_EMAIL")


def _jira_api_token() -> str | None:
    return os.getenv("JIRA_API_TOKEN")


def _jira_default_project() -> str | None:
    return os.getenv("JIRA_DEFAULT_PROJECT_KEY")


def get_jira_config(
    x_jira_domain: str | None = Header(None, alias="X-Jira-Domain"),
    x_jira_email: str | None = Header(None, alias="X-Jira-Email"),
    x_jira_api_token: str | None = Header(None, alias="X-Jira-Token"),
    x_jira_project: str | None = Header(None, alias="X-Jira-Project"),
) -> tuple[str, HTTPBasicAuth, str | None]:
    """Return (base_url, auth, project) from headers or env, or raise 503 if not configured."""
    domain = x_jira_domain or _jira_domain()
    email = x_jira_email or _jira_email()
    token = x_jira_api_token or _jira_api_token()
    project = x_jira_project or _jira_default_project()
    
    if not domain or not email or not token:
        raise HTTPException(
            status_code=503,
            detail=(
                "Jira is not configured. Provide X-Jira-Domain, X-Jira-Email, and "
                "X-Jira-Token headers or set server environment variables."
            ),
        )
    base_url = f"https://{domain}" if not domain.startswith("http") else domain
    auth = HTTPBasicAuth(email, token)
    return base_url, auth, project


_HEADERS = {
    "Accept": "application/json",
    "Content-Type": "application/json",
}

# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class JiraConfigStatus(BaseModel):
    configured: bool
    domain: str | None = None
    default_project: str | None = None


class JiraTestResult(BaseModel):
    ok: bool
    message: str
    user: str | None = None


class CreateJiraIssueRequest(BaseModel):
    """Minimum fields to create a Jira issue from a letAICook task."""
    project_key: str | None = Field(
        default=None,
        description="Jira project key (e.g. 'PROJ'). Falls back to JIRA_DEFAULT_PROJECT_KEY.",
    )
    summary: str = Field(..., min_length=1, max_length=500)
    description: str = ""
    issue_type: str = Field(default="Task", description="Jira issue type name.")
    priority: str | None = Field(
        default=None,
        description="Jira priority name (e.g. 'Medium'). None = Jira default.",
    )
    labels: list[str] = Field(default_factory=list)


class CreateJiraIssueResponse(BaseModel):
    issue_key: str
    issue_url: str
    issue_id: str


class JiraIssueStatus(BaseModel):
    issue_key: str
    summary: str
    status: str
    status_category: str
    priority: str | None = None
    assignee: str | None = None
    url: str


class TransitionRequest(BaseModel):
    transition_name: str = Field(
        ...,
        description="Target transition name (e.g. 'In Progress', 'Done').",
    )


class TransitionResponse(BaseModel):
    ok: bool
    issue_key: str
    new_status: str


class BatchCreateRequest(BaseModel):
    """Create multiple Jira issues at once (e.g. from system designer output)."""
    project_key: str | None = None
    issues: list[CreateJiraIssueRequest]


class BatchCreateResponse(BaseModel):
    created: list[CreateJiraIssueResponse]
    errors: list[dict[str, Any]]


class JiraProject(BaseModel):
    key: str
    name: str
    id: str


# ---------------------------------------------------------------------------
# Mapping helpers
# ---------------------------------------------------------------------------

_PRIORITY_MAP: dict[str, str] = {
    "low": "Low",
    "medium": "Medium",
    "high": "High",
    "critical": "Highest",
}


def _map_priority(letaicook_priority: str | None) -> str | None:
    """Map letAICook priority to Jira priority name."""
    if not letaicook_priority:
        return None
    return _PRIORITY_MAP.get(letaicook_priority.lower())


_STATUS_TO_TRANSITION: dict[str, list[str]] = {
    "todo": ["To Do", "Backlog", "Open"],
    "in_progress": ["In Progress", "Start Progress"],
    "review": ["In Review", "Review"],
    "done": ["Done", "Closed", "Resolve Issue"],
    "blocked": ["Blocked"],
}


def _adf_text(text: str) -> dict[str, Any]:
    """Convert plain text to Atlassian Document Format (ADF) for API v3."""
    return {
        "type": "doc",
        "version": 1,
        "content": [
            {
                "type": "paragraph",
                "content": [{"type": "text", "text": text}],
            }
        ],
    }


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/config")
def jira_config_status() -> JiraConfigStatus:
    """Check whether Jira is configured (does NOT leak secrets)."""
    domain = _jira_domain()
    return JiraConfigStatus(
        configured=bool(domain and _jira_email() and _jira_api_token()),
        domain=domain,
        default_project=_jira_default_project(),
    )


@router.post("/config/test")
def jira_test_connection(config: tuple[str, HTTPBasicAuth, str | None] = Depends(get_jira_config)) -> JiraTestResult:
    """Validate Jira credentials by calling /rest/api/3/myself."""
    base_url, auth, _ = config
    try:
        resp = requests.get(
            f"{base_url}/rest/api/3/myself",
            headers=_HEADERS,
            auth=auth,
            timeout=10,
        )
        if resp.status_code == 200:
            data = resp.json()
            return JiraTestResult(
                ok=True,
                message="Connected to Jira successfully.",
                user=data.get("displayName") or data.get("emailAddress"),
            )
        return JiraTestResult(
            ok=False,
            message=f"Jira returned {resp.status_code}: {resp.text[:300]}",
        )
    except requests.RequestException as e:
        return JiraTestResult(ok=False, message=f"Connection error: {e!s}")


@router.get("/projects")
def list_jira_projects(config: tuple[str, HTTPBasicAuth, str | None] = Depends(get_jira_config)) -> list[JiraProject]:
    """List Jira projects accessible to the configured user."""
    base_url, auth, _ = config
    resp = requests.get(
        f"{base_url}/rest/api/3/project/search",
        headers=_HEADERS,
        auth=auth,
        params={"maxResults": 50, "orderBy": "name"},
        timeout=10,
    )
    if resp.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"Jira API error {resp.status_code}: {resp.text[:300]}",
        )
    projects = resp.json().get("values", [])
    return [
        JiraProject(key=p["key"], name=p["name"], id=str(p["id"]))
        for p in projects
    ]


@router.post("/issues", response_model=CreateJiraIssueResponse)
def create_jira_issue(
    body: CreateJiraIssueRequest,
    config: tuple[str, HTTPBasicAuth, str | None] = Depends(get_jira_config),
) -> CreateJiraIssueResponse:
    """Create a single Jira issue."""
    base_url, auth, default_proj = config
    project_key = body.project_key or default_proj
    if not project_key:
        raise HTTPException(
            status_code=400,
            detail="No project_key provided and JIRA_DEFAULT_PROJECT_KEY is not set.",
        )

    fields: dict[str, Any] = {
        "project": {"key": project_key},
        "summary": body.summary,
        "issuetype": {"name": body.issue_type},
    }
    if body.description:
        fields["description"] = _adf_text(body.description)
    mapped_priority = _map_priority(body.priority)
    if mapped_priority:
        fields["priority"] = {"name": mapped_priority}
    if body.labels:
        fields["labels"] = body.labels

    resp = requests.post(
        f"{base_url}/rest/api/3/issue",
        headers=_HEADERS,
        auth=auth,
        json={"fields": fields},
        timeout=15,
    )
    if resp.status_code not in (200, 201):
        raise HTTPException(
            status_code=502,
            detail=f"Jira create failed ({resp.status_code}): {resp.text[:500]}",
        )

    data = resp.json()
    issue_key = data["key"]
    return CreateJiraIssueResponse(
        issue_key=issue_key,
        issue_url=f"{base_url}/browse/{issue_key}",
        issue_id=data["id"],
    )


@router.get("/issues/{issue_key}", response_model=JiraIssueStatus)
def get_jira_issue(
    issue_key: str,
    config: tuple[str, HTTPBasicAuth, str | None] = Depends(get_jira_config),
) -> JiraIssueStatus:
    """Fetch current status of a Jira issue."""
    base_url, auth, _ = config
    resp = requests.get(
        f"{base_url}/rest/api/3/issue/{issue_key}",
        headers=_HEADERS,
        auth=auth,
        params={"fields": "summary,status,priority,assignee"},
        timeout=10,
    )
    if resp.status_code == 404:
        raise HTTPException(status_code=404, detail=f"Issue {issue_key} not found in Jira.")
    if resp.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"Jira API error {resp.status_code}: {resp.text[:300]}",
        )
    data = resp.json()
    fields = data.get("fields", {})
    status_obj = fields.get("status", {})
    priority_obj = fields.get("priority")
    assignee_obj = fields.get("assignee")
    return JiraIssueStatus(
        issue_key=issue_key,
        summary=fields.get("summary", ""),
        status=status_obj.get("name", "Unknown"),
        status_category=status_obj.get("statusCategory", {}).get("name", "Unknown"),
        priority=priority_obj.get("name") if priority_obj else None,
        assignee=assignee_obj.get("displayName") if assignee_obj else None,
        url=f"{base_url}/browse/{issue_key}",
    )


@router.post("/issues/{issue_key}/transition", response_model=TransitionResponse)
def transition_jira_issue(
    issue_key: str,
    body: TransitionRequest,
    config: tuple[str, HTTPBasicAuth, str | None] = Depends(get_jira_config),
) -> TransitionResponse:
    """Transition a Jira issue to a new status (e.g. 'In Progress', 'Done')."""
    base_url, auth, _ = config

    # 1. Get available transitions
    resp = requests.get(
        f"{base_url}/rest/api/3/issue/{issue_key}/transitions",
        headers=_HEADERS,
        auth=auth,
        timeout=10,
    )
    if resp.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to fetch transitions for {issue_key}: {resp.text[:300]}",
        )

    transitions = resp.json().get("transitions", [])
    target = body.transition_name.lower()
    match = next(
        (t for t in transitions if t["name"].lower() == target),
        None,
    )
    if not match:
        available = [t["name"] for t in transitions]
        raise HTTPException(
            status_code=400,
            detail=f"Transition '{body.transition_name}' not available for {issue_key}. "
                   f"Available: {available}",
        )

    # 2. Perform transition
    resp = requests.post(
        f"{base_url}/rest/api/3/issue/{issue_key}/transitions",
        headers=_HEADERS,
        auth=auth,
        json={"transition": {"id": match["id"]}},
        timeout=10,
    )
    if resp.status_code not in (200, 204):
        raise HTTPException(
            status_code=502,
            detail=f"Transition failed ({resp.status_code}): {resp.text[:300]}",
        )

    return TransitionResponse(
        ok=True,
        issue_key=issue_key,
        new_status=match.get("to", {}).get("name", body.transition_name),
    )


@router.post("/issues/batch", response_model=BatchCreateResponse)
def batch_create_jira_issues(
    body: BatchCreateRequest,
    config: tuple[str, HTTPBasicAuth, str | None] = Depends(get_jira_config),
) -> BatchCreateResponse:
    """Create multiple Jira issues at once (e.g. from system designer)."""
    base_url, auth, default_proj = config
    project_key = body.project_key or default_proj
    if not project_key:
        raise HTTPException(
            status_code=400,
            detail="No project_key provided and JIRA_DEFAULT_PROJECT_KEY is not set.",
        )

    created: list[CreateJiraIssueResponse] = []
    errors: list[dict[str, Any]] = []

    for i, issue in enumerate(body.issues):
        try:
            issue.project_key = issue.project_key or project_key
            result = create_jira_issue(issue, config=config)
            created.append(result)
        except HTTPException as e:
            errors.append({"index": i, "summary": issue.summary, "error": e.detail})

    return BatchCreateResponse(created=created, errors=errors)
