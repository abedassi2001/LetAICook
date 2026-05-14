"""Jira Cloud REST API integration — proxy routes so secrets stay server-side."""

from __future__ import annotations

import json
import os
import re
from typing import Any

import requests
from fastapi import APIRouter, Depends, Header, HTTPException
from gemini_shared import GeminiNotConfiguredError, generate_content_with_fallback
from google.api_core.exceptions import GoogleAPIError
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


def _adf_to_plain(node: Any) -> str:
    """Best-effort plain text from ADF (for prompts)."""
    if node is None:
        return ""
    if isinstance(node, str):
        return node
    if isinstance(node, dict):
        if node.get("type") == "text":
            return str(node.get("text", ""))
        parts = [_adf_to_plain(c) for c in (node.get("content") or [])]
        return " ".join(p for p in parts if p)
    if isinstance(node, list):
        return " ".join(_adf_to_plain(c) for c in node)
    return ""


def _select_transition(transitions: list[dict[str, Any]], transition_name: str) -> dict[str, Any] | None:
    target = transition_name.lower()
    for t in transitions:
        if str(t.get("name", "")).lower() == target:
            return t
    return None


def _perform_transition_by_name(
    base_url: str,
    auth: HTTPBasicAuth,
    issue_key: str,
    transition_name: str,
) -> str:
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
    match = _select_transition(transitions, transition_name)
    if not match:
        available = [t["name"] for t in transitions]
        raise HTTPException(
            status_code=400,
            detail=(
                f"Transition '{transition_name}' not available for {issue_key}. "
                f"Available: {available}"
            ),
        )
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
    return str(match.get("to", {}).get("name") or transition_name)


def _jira_issue_search(
    base_url: str,
    auth: HTTPBasicAuth,
    jql: str,
    max_results: int,
) -> list[dict[str, Any]]:
    resp = requests.post(
        f"{base_url}/rest/api/3/search",
        headers=_HEADERS,
        auth=auth,
        json={
            "jql": jql,
            "maxResults": max_results,
            "fields": ["summary", "description", "status"],
        },
        timeout=25,
    )
    if resp.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"Jira search failed ({resp.status_code}): {resp.text[:400]}",
        )
    raw_issues = resp.json().get("issues") or []
    out: list[dict[str, Any]] = []
    for item in raw_issues:
        key = item.get("key")
        if not key:
            continue
        fields = item.get("fields") or {}
        desc = fields.get("description")
        plain = _adf_to_plain(desc) if isinstance(desc, dict) else ""
        status_obj = fields.get("status") or {}
        out.append(
            {
                "issue_key": key,
                "summary": str(fields.get("summary") or ""),
                "description": plain[:8000],
                "status": str(status_obj.get("name") or "Unknown"),
            }
        )
    return out


def _apply_issue_fields(
    base_url: str,
    auth: HTTPBasicAuth,
    issue_key: str,
    *,
    summary: str | None,
    description_plain: str | None,
) -> list[str]:
    fields: dict[str, Any] = {}
    if summary is not None:
        fields["summary"] = summary
    if description_plain is not None:
        fields["description"] = _adf_text(description_plain)
    if not fields:
        return []
    resp = requests.put(
        f"{base_url}/rest/api/3/issue/{issue_key}",
        headers=_HEADERS,
        auth=auth,
        json={"fields": fields},
        timeout=20,
    )
    if resp.status_code not in (200, 204):
        raise HTTPException(
            status_code=502,
            detail=f"Jira update failed for {issue_key} ({resp.status_code}): {resp.text[:500]}",
        )
    updated: list[str] = []
    if summary is not None:
        updated.append("summary")
    if description_plain is not None:
        updated.append("description")
    return updated


JIRA_AI_SYSTEM = """You are a careful Jira Cloud assistant. You receive:
1) A JSON array of issues, each with issue_key, summary, description (plain text excerpt), and status.
2) A natural-language instruction from the user.

Return ONLY a JSON array (no markdown code fences) of change objects. Each object may include:
- "issue_key" (string, required): must be exactly one of the keys from the input list.
- "summary" (string, optional): new title if it should change.
- "description" (string, optional): replacement plain-text body if it should change.
- "transition_name" (string, optional): exact Jira transition name to execute if the user asked for a status/workflow change.

Rules:
- Omit issues that need no edits.
- Never invent issue keys.
- If you are unsure about a transition name, omit transition_name rather than guessing.
- Keep edits minimal and aligned with the instruction."""


def _parse_model_json_array(text: str) -> list[dict[str, Any]]:
    cleaned = text.strip()
    m = re.search(r"\[[\s\S]*\]", cleaned)
    if m:
        cleaned = m.group(0)
    data = json.loads(cleaned)
    if not isinstance(data, list):
        raise ValueError("Model output is not a JSON array.")
    return [x for x in data if isinstance(x, dict)]


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
    new_status = _perform_transition_by_name(base_url, auth, issue_key, body.transition_name)
    return TransitionResponse(ok=True, issue_key=issue_key, new_status=new_status)


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


class JiraAiSyncRequest(BaseModel):
    """Pull issues with JQL, ask Gemini for edits, apply updates in Jira (user credentials via headers)."""

    instruction: str = Field(..., min_length=1, max_length=8000)
    jql: str | None = Field(
        default=None,
        max_length=4000,
        description="Jira JQL. If omitted, uses open issues in the default project.",
    )
    max_issues: int = Field(default=12, ge=1, le=30)


class JiraAiSyncResultItem(BaseModel):
    issue_key: str
    updated_fields: list[str] = Field(default_factory=list)
    transitioned_to: str | None = None
    error: str | None = None


class JiraAiSyncResponse(BaseModel):
    jql_used: str
    issues_considered: list[str]
    results: list[JiraAiSyncResultItem]


@router.post("/ai-sync", response_model=JiraAiSyncResponse)
def jira_ai_sync(
    body: JiraAiSyncRequest,
    config: tuple[str, HTTPBasicAuth, str | None] = Depends(get_jira_config),
) -> JiraAiSyncResponse:
    """
    Fetch issues from Jira with the logged-in user's token (X-Jira-* headers),
    propose field/transition updates with Gemini, then apply them in Jira.
    """
    base_url, auth, default_proj = config
    jql = (body.jql or "").strip()
    if not jql:
        if not default_proj:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Provide a JQL query or set default project "
                    "(X-Jira-Project header or JIRA_DEFAULT_PROJECT_KEY)."
                ),
            )
        jql = f'project = {default_proj} AND statusCategory != "Done" ORDER BY updated DESC'

    issues = _jira_issue_search(base_url, auth, jql, body.max_issues)
    keys = [i["issue_key"] for i in issues]
    if not keys:
        return JiraAiSyncResponse(jql_used=jql, issues_considered=[], results=[])

    valid_keys = set(keys)
    user_blob = json.dumps({"issues": issues, "instruction": body.instruction}, ensure_ascii=False)

    try:
        raw = generate_content_with_fallback(
            system_instruction=JIRA_AI_SYSTEM,
            user_content=user_blob,
            temperature=0.2,
            response_mime_type="application/json",
        )
    except GeminiNotConfiguredError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except GoogleAPIError as e:
        raise HTTPException(status_code=502, detail=f"Gemini error: {e!s}") from e

    try:
        changes = _parse_model_json_array(raw)
    except (json.JSONDecodeError, ValueError) as e:
        raise HTTPException(
            status_code=502,
            detail=f"Model returned invalid JSON: {e!s}",
        ) from e

    results: list[JiraAiSyncResultItem] = []
    for ch in changes:
        key = str(ch.get("issue_key") or "").strip().upper()
        if not key or key not in valid_keys:
            continue
        item = JiraAiSyncResultItem(issue_key=key)
        try:
            new_summary: str | None = None
            new_desc: str | None = None
            if isinstance(ch.get("summary"), str) and ch["summary"].strip():
                new_summary = ch["summary"].strip()
            if isinstance(ch.get("description"), str) and ch["description"].strip():
                new_desc = ch["description"].strip()

            if new_summary is not None or new_desc is not None:
                item.updated_fields = _apply_issue_fields(
                    base_url,
                    auth,
                    key,
                    summary=new_summary,
                    description_plain=new_desc,
                )

            tn = ch.get("transition_name")
            if isinstance(tn, str) and tn.strip():
                item.transitioned_to = _perform_transition_by_name(
                    base_url, auth, key, tn.strip()
                )
        except HTTPException as e:
            detail = e.detail
            item.error = detail if isinstance(detail, str) else json.dumps(detail)
        except Exception as e:
            item.error = str(e)
        results.append(item)

    return JiraAiSyncResponse(jql_used=jql, issues_considered=keys, results=results)
