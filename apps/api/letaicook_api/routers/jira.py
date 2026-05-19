"""Jira Cloud REST API integration — proxy routes so secrets stay server-side."""

from __future__ import annotations

import os
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field

from letaicook_api.deps.auth import verify_firebase_bearer
from letaicook_api.services import jira_oauth
from letaicook_api.services.jira_oauth_store import (
    JiraOAuthRecord,
    delete_record,
    load_record,
    save_record,
)
from letaicook_api.services.jira_session import JiraSession, resolve_jira_session

router = APIRouter(prefix="/jira", tags=["jira"])


def _jira_domain() -> str | None:
    return os.getenv("JIRA_DOMAIN")


def _jira_email() -> str | None:
    return os.getenv("JIRA_EMAIL")


def _jira_api_token() -> str | None:
    return os.getenv("JIRA_API_TOKEN")


def _jira_default_project() -> str | None:
    return os.getenv("JIRA_DEFAULT_PROJECT_KEY")

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


class UpdateJiraIssueRequest(BaseModel):
    """Partial update — only provided fields are sent to Jira."""

    summary: str | None = Field(default=None, min_length=1, max_length=500)
    description: str | None = None
    priority: str | None = Field(
        default=None,
        description="letAICook priority (low/medium/high/critical) or Jira name.",
    )


class UpdateJiraIssueResponse(BaseModel):
    issue_key: str
    issue_url: str


class DeleteJiraIssueResponse(BaseModel):
    ok: bool
    issue_key: str


class SyncStatusRequest(BaseModel):
    """Map a letAICook task status to a Jira workflow transition."""

    status: str = Field(
        ...,
        description="letAICook status: todo, in_progress, review, done, blocked.",
    )


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


class JiraIssueListItem(BaseModel):
    issue_key: str
    summary: str
    status: str
    status_category: str
    priority: str | None = None
    url: str


class JiraConnectionPublic(BaseModel):
    connected: bool
    atlassian_account_id: str | None = None
    cloud_id: str | None = None
    site_name: str | None = None
    site_url: str | None = None
    project_id: str | None = None
    project_key: str | None = None
    project_name: str | None = None
    auth_mode: str | None = None


class JiraSite(BaseModel):
    cloud_id: str
    name: str
    url: str


class DefaultProjectRequest(BaseModel):
    cloud_id: str | None = None
    project_key: str = Field(..., min_length=1, max_length=32)
    project_id: str | None = None
    project_name: str | None = None


class OAuthStartResponse(BaseModel):
    authorize_url: str


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


def _resolve_priority(priority: str | None) -> str | None:
    """Accept letAICook or Jira priority names."""
    if not priority:
        return None
    mapped = _map_priority(priority)
    return mapped if mapped else priority


def _parse_search_issues_payload(data: dict[str, Any]) -> list[dict[str, Any]]:
    """Normalize Jira search / search/jql responses to a list of issue objects."""
    return list(data.get("issues") or data.get("values") or [])


def _search_jira_issues(
    session: JiraSession,
    jql: str,
    max_results: int,
) -> list[dict[str, Any]]:
    """Search issues via Jira Cloud JQL API (new search/jql, with legacy fallback)."""
    limit = min(max(max_results, 1), 100)
    fields_csv = "summary,status,priority"

    resp = session.get(
        "/rest/api/3/search/jql",
        params={
            "jql": jql,
            "maxResults": limit,
            "fields": fields_csv,
        },
    )
    if resp.status_code == 200:
        return _parse_search_issues_payload(resp.json())

    if resp.status_code in (400, 404, 410, 405):
        resp = session.post(
            "/rest/api/3/search/jql",
            json={
                "jql": jql,
                "maxResults": limit,
                "fields": ["summary", "status", "priority"],
            },
        )
        if resp.status_code == 200:
            return _parse_search_issues_payload(resp.json())

    resp = session.get(
        "/rest/api/3/search",
        params={
            "jql": jql,
            "maxResults": limit,
            "fields": fields_csv,
        },
    )
    if resp.status_code == 200:
        return _parse_search_issues_payload(resp.json())

    raise HTTPException(
        status_code=502,
        detail=f"Jira search failed ({resp.status_code}): {resp.text[:400]}",
    )


def _issues_to_list_items(
    session: JiraSession, issues: list[dict[str, Any]]
) -> list[JiraIssueListItem]:
    results: list[JiraIssueListItem] = []
    for item in issues:
        key = item.get("key", "")
        fields = item.get("fields", {})
        status_obj = fields.get("status") or {}
        priority_obj = fields.get("priority")
        results.append(
            JiraIssueListItem(
                issue_key=key,
                summary=fields.get("summary") or key,
                status=status_obj.get("name", "Unknown"),
                status_category=status_obj.get("statusCategory", {}).get(
                    "name", "Unknown"
                ),
                priority=priority_obj.get("name") if priority_obj else None,
                url=session.issue_browse_url(key),
            )
        )
    return results


def _perform_transition(
    session: JiraSession,
    issue_key: str,
    transition_names: list[str],
) -> TransitionResponse:
    resp = session.get(f"/rest/api/3/issue/{issue_key}/transitions")
    if resp.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to fetch transitions for {issue_key}: {resp.text[:300]}",
        )

    transitions = resp.json().get("transitions", [])
    names_lower = {t["name"].lower(): t for t in transitions}
    match = None
    for candidate in transition_names:
        match = names_lower.get(candidate.lower())
        if match:
            break
    if not match:
        available = [t["name"] for t in transitions]
        raise HTTPException(
            status_code=400,
            detail=(
                f"No matching transition for {issue_key}. "
                f"Tried: {transition_names}. Available: {available}"
            ),
        )

    resp = session.post(
        f"/rest/api/3/issue/{issue_key}/transitions",
        json={"transition": {"id": match["id"]}},
    )
    if resp.status_code not in (200, 204):
        raise HTTPException(
            status_code=502,
            detail=f"Transition failed ({resp.status_code}): {resp.text[:300]}",
        )

    return TransitionResponse(
        ok=True,
        issue_key=issue_key,
        new_status=match.get("to", {}).get("name", match["name"]),
    )


def _public_connection(uid: str) -> JiraConnectionPublic:
    record = load_record(uid)
    if record and record.connected:
        return JiraConnectionPublic(
            connected=True,
            atlassian_account_id=record.atlassian_account_id,
            cloud_id=record.cloud_id,
            site_name=record.site_name,
            site_url=record.site_url,
            project_id=record.project_id,
            project_key=record.project_key,
            project_name=record.project_name,
            auth_mode="oauth",
        )
    return JiraConnectionPublic(connected=False, auth_mode=None)


# ---------------------------------------------------------------------------
# OAuth routes
# ---------------------------------------------------------------------------

@router.get("/oauth/start", response_model=OAuthStartResponse)
def jira_oauth_start(uid: str = Depends(verify_firebase_bearer)) -> OAuthStartResponse:
    """Return Atlassian authorize URL for the signed-in Firebase user."""
    try:
        url = jira_oauth.build_authorize_url(uid)
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return OAuthStartResponse(authorize_url=url)


@router.get("/oauth/callback")
def jira_oauth_callback(code: str | None = None, state: str | None = None, error: str | None = None):
    """Exchange authorization code and redirect back to the web app."""
    base = jira_oauth.frontend_base_url()
    if error:
        return RedirectResponse(f"{base}/settings?jira=error&reason={error}")
    if not code or not state:
        return RedirectResponse(f"{base}/settings?jira=error&reason=missing_params")
    try:
        uid = jira_oauth.verify_oauth_state(state)
        tokens = jira_oauth.exchange_code_for_tokens(code)
    except (ValueError, RuntimeError) as exc:
        return RedirectResponse(f"{base}/settings?jira=error&reason=oauth_failed")
    record = load_record(uid) or JiraOAuthRecord(uid=uid)
    try:
        jira_oauth.apply_tokens_to_record(record, tokens)
    except RuntimeError:
        return RedirectResponse(f"{base}/settings?jira=error&reason=resources_failed")
    return RedirectResponse(f"{base}/settings?jira=connected")


@router.get("/connection", response_model=JiraConnectionPublic)
def jira_connection(uid: str = Depends(verify_firebase_bearer)) -> JiraConnectionPublic:
    """Public Jira connection status (no tokens)."""
    return _public_connection(uid)


@router.get("/sites", response_model=list[JiraSite])
def jira_list_sites(uid: str = Depends(verify_firebase_bearer)) -> list[JiraSite]:
    record = load_record(uid)
    if not record or not record.connected:
        raise HTTPException(status_code=404, detail="Jira is not connected via OAuth.")
    try:
        access = jira_oauth.ensure_fresh_access_token(record)
        resources = jira_oauth.fetch_accessible_resources(access)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return [
        JiraSite(
            cloud_id=str(r.get("id") or ""),
            name=str(r.get("name") or ""),
            url=str(r.get("url") or ""),
        )
        for r in resources
        if r.get("id")
    ]


@router.post("/default-project", response_model=JiraConnectionPublic)
def jira_set_default_project(
    body: DefaultProjectRequest,
    uid: str = Depends(verify_firebase_bearer),
) -> JiraConnectionPublic:
    record = load_record(uid)
    if not record or not record.connected:
        raise HTTPException(status_code=404, detail="Jira OAuth is not connected.")
    if body.cloud_id and body.cloud_id != record.cloud_id:
        try:
            access = jira_oauth.ensure_fresh_access_token(record)
            jira_oauth.apply_tokens_to_record(
                record,
                {"access_token": access, "refresh_token": record.refresh_token, "expires_in": 3600},
                pick_cloud_id=body.cloud_id,
            )
        except RuntimeError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
    record.project_key = body.project_key.strip()
    record.project_id = body.project_id
    record.project_name = body.project_name
    save_record(record)
    return _public_connection(uid)


@router.delete("/connection")
def jira_disconnect(uid: str = Depends(verify_firebase_bearer)) -> dict[str, bool]:
    delete_record(uid)
    return {"ok": True}


# ---------------------------------------------------------------------------
# Jira API proxy routes
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
def jira_test_connection(session: JiraSession = Depends(resolve_jira_session)) -> JiraTestResult:
    """Validate Jira credentials by calling /rest/api/3/myself."""
    try:
        resp = session.get("/rest/api/3/myself", timeout=10)
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
    except OSError as e:
        return JiraTestResult(ok=False, message=f"Connection error: {e!s}")


@router.get("/projects")
def list_jira_projects(session: JiraSession = Depends(resolve_jira_session)) -> list[JiraProject]:
    """List Jira projects accessible to the configured user."""
    resp = session.get(
        "/rest/api/3/project/search",
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


@router.get("/projects/{project_key}/issues", response_model=list[JiraIssueListItem])
def list_jira_project_issues(
    project_key: str,
    max_results: int = 50,
    session: JiraSession = Depends(resolve_jira_session),
) -> list[JiraIssueListItem]:
    """List issues in a Jira project (for importing into letAICook tasks)."""
    jql = f'project = "{project_key}" ORDER BY updated DESC'
    issues = _search_jira_issues(session, jql, max_results)
    return _issues_to_list_items(session, issues)


@router.post("/issues", response_model=CreateJiraIssueResponse)
def create_jira_issue(
    body: CreateJiraIssueRequest,
    session: JiraSession = Depends(resolve_jira_session),
) -> CreateJiraIssueResponse:
    """Create a single Jira issue."""
    default_proj = session.default_project
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

    resp = session.post("/rest/api/3/issue", json={"fields": fields}, timeout=15)
    if resp.status_code not in (200, 201):
        raise HTTPException(
            status_code=502,
            detail=f"Jira create failed ({resp.status_code}): {resp.text[:500]}",
        )

    data = resp.json()
    issue_key = data["key"]
    return CreateJiraIssueResponse(
        issue_key=issue_key,
        issue_url=session.issue_browse_url(issue_key),
        issue_id=data["id"],
    )


@router.get("/issues/{issue_key}", response_model=JiraIssueStatus)
def get_jira_issue(
    issue_key: str,
    session: JiraSession = Depends(resolve_jira_session),
) -> JiraIssueStatus:
    """Fetch current status of a Jira issue."""
    resp = session.get(
        f"/rest/api/3/issue/{issue_key}",
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
        url=session.issue_browse_url(issue_key),
    )


@router.post("/issues/{issue_key}/transition", response_model=TransitionResponse)
def transition_jira_issue(
    issue_key: str,
    body: TransitionRequest,
    session: JiraSession = Depends(resolve_jira_session),
) -> TransitionResponse:
    """Transition a Jira issue to a new status (e.g. 'In Progress', 'Done')."""
    return _perform_transition(session, issue_key, [body.transition_name])


@router.put("/issues/{issue_key}", response_model=UpdateJiraIssueResponse)
def update_jira_issue(
    issue_key: str,
    body: UpdateJiraIssueRequest,
    session: JiraSession = Depends(resolve_jira_session),
) -> UpdateJiraIssueResponse:
    """Update summary, description, and/or priority of a Jira issue."""
    fields: dict[str, Any] = {}
    if body.summary is not None:
        fields["summary"] = body.summary
    if body.description is not None:
        fields["description"] = _adf_text(body.description)
    mapped_priority = _resolve_priority(body.priority)
    if body.priority is not None and mapped_priority:
        fields["priority"] = {"name": mapped_priority}

    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update.")

    resp = session.put(f"/rest/api/3/issue/{issue_key}", json={"fields": fields}, timeout=15)
    if resp.status_code == 404:
        raise HTTPException(status_code=404, detail=f"Issue {issue_key} not found in Jira.")
    if resp.status_code not in (200, 204):
        raise HTTPException(
            status_code=502,
            detail=f"Jira update failed ({resp.status_code}): {resp.text[:500]}",
        )

    return UpdateJiraIssueResponse(
        issue_key=issue_key,
        issue_url=session.issue_browse_url(issue_key),
    )


@router.delete("/issues/{issue_key}", response_model=DeleteJiraIssueResponse)
def delete_jira_issue(
    issue_key: str,
    session: JiraSession = Depends(resolve_jira_session),
) -> DeleteJiraIssueResponse:
    """Delete a Jira issue."""
    resp = session.delete(f"/rest/api/3/issue/{issue_key}", timeout=15)
    if resp.status_code == 404:
        raise HTTPException(status_code=404, detail=f"Issue {issue_key} not found in Jira.")
    if resp.status_code not in (200, 204):
        raise HTTPException(
            status_code=502,
            detail=f"Jira delete failed ({resp.status_code}): {resp.text[:500]}",
        )
    return DeleteJiraIssueResponse(ok=True, issue_key=issue_key)


@router.post("/issues/{issue_key}/sync-status", response_model=TransitionResponse)
def sync_jira_issue_status(
    issue_key: str,
    body: SyncStatusRequest,
    session: JiraSession = Depends(resolve_jira_session),
) -> TransitionResponse:
    """Transition a Jira issue using letAICook task status names."""
    key = body.status.lower().strip()
    candidates = _STATUS_TO_TRANSITION.get(key)
    if not candidates:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown letAICook status '{body.status}'. "
            f"Expected one of: {list(_STATUS_TO_TRANSITION)}",
        )
    return _perform_transition(session, issue_key, candidates)


@router.post("/issues/batch", response_model=BatchCreateResponse)
def batch_create_jira_issues(
    body: BatchCreateRequest,
    session: JiraSession = Depends(resolve_jira_session),
) -> BatchCreateResponse:
    """Create multiple Jira issues at once (e.g. from system designer)."""
    default_proj = session.default_project
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
            result = create_jira_issue(issue, session=session)
            created.append(result)
        except HTTPException as e:
            errors.append({"index": i, "summary": issue.summary, "error": e.detail})

    return BatchCreateResponse(created=created, errors=errors)
