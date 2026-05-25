"""Jira Cloud REST API integration — proxy routes so secrets stay server-side."""

from __future__ import annotations

import os
from typing import Any, Literal

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
    assignee: str | None = None
    assignee_account_id: str | None = None


class JiraTeammateIssue(BaseModel):
    issue_key: str
    summary: str
    status: str
    status_category: str
    priority: str | None = None
    url: str


class JiraProjectTeammate(BaseModel):
    account_id: str | None = None
    display_name: str
    email: str | None = None
    avatar_url: str | None = None
    active_count: int = 0
    in_progress_count: int = 0
    done_count: int = 0
    total_assigned: int = 0
    recent_issues: list[JiraTeammateIssue] = Field(default_factory=list)


class JiraProjectMember(BaseModel):
    account_id: str | None = None
    display_name: str
    email: str | None = None
    avatar_url: str | None = None
    actor_type: Literal["user", "group"] = "user"
    roles: list[str] = Field(default_factory=list)


class JiraProjectTeam(BaseModel):
    project_key: str
    project_name: str | None = None
    project_lead: str | None = None
    site_url: str | None = None
    project_members: list[JiraProjectMember] = Field(default_factory=list)
    teammates: list[JiraProjectTeammate] = Field(default_factory=list)
    unassigned_count: int = 0


class AddProjectTeamMemberRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=320)
    display_name: str | None = Field(default=None, alias="displayName")

    model_config = {"populate_by_name": True}


class AddProjectTeamMemberResponse(BaseModel):
    ok: bool
    message: str
    account_id: str | None = None
    display_name: str | None = None
    role_name: str | None = None
    already_member: bool = False


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
    oauth_available: bool = True
    user_message: str | None = None
    error_code: str | None = None


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
    *,
    fields: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Search issues via Jira Cloud JQL API (new search/jql, with legacy fallback)."""
    limit = min(max(max_results, 1), 100)
    field_list = fields or ["summary", "status", "priority"]
    fields_csv = ",".join(field_list)

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
                "fields": field_list,
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


def _issue_to_teammate_item(
    session: JiraSession, item: dict[str, Any]
) -> JiraTeammateIssue:
    key = item.get("key", "")
    fields = item.get("fields", {})
    status_obj = fields.get("status") or {}
    priority_obj = fields.get("priority")
    return JiraTeammateIssue(
        issue_key=key,
        summary=fields.get("summary") or key,
        status=status_obj.get("name", "Unknown"),
        status_category=status_obj.get("statusCategory", {}).get("name", "Unknown"),
        priority=priority_obj.get("name") if priority_obj else None,
        url=session.issue_browse_url(key),
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
        assignee_obj = fields.get("assignee")
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
                assignee=assignee_obj.get("displayName") if assignee_obj else None,
                assignee_account_id=assignee_obj.get("accountId") if assignee_obj else None,
            )
        )
    return results


def _fetch_assignable_users(
    session: JiraSession, project_key: str, max_results: int = 50
) -> list[dict[str, Any]]:
    resp = session.get(
        "/rest/api/3/user/assignable/search",
        params={"project": project_key, "maxResults": min(max_results, 50)},
        timeout=15,
    )
    if resp.status_code != 200:
        return []
    data = resp.json()
    if isinstance(data, list):
        return data
    return list(data.get("values") or data.get("users") or [])


def _fetch_project_meta(session: JiraSession, project_key: str) -> dict[str, Any]:
    resp = session.get(f"/rest/api/3/project/{project_key}", timeout=10)
    if resp.status_code != 200:
        return {}
    return resp.json()


_ROLE_PREFERENCE = (
    "Developers",
    "Member",
    "Members",
    "Users",
    "Team",
    "Contributor",
    "Service Desk Team",
)


def _search_jira_user_by_email(session: JiraSession, email: str) -> dict[str, Any] | None:
    query = email.strip()
    resp = session.get(
        "/rest/api/3/user/search",
        params={"query": query, "maxResults": 20},
        timeout=15,
    )
    if resp.status_code == 401:
        raise HTTPException(
            status_code=502,
            detail="Jira connection expired or invalid. Reconnect Jira in Settings.",
        )
    if resp.status_code == 403:
        raise HTTPException(
            status_code=403,
            detail=(
                "Your Jira connection does not have permission to look up users. "
                "Ask a Jira administrator to grant access or add this person in Jira."
            ),
        )
    if resp.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"Jira user search failed ({resp.status_code}): {resp.text[:300]}",
        )
    users = resp.json()
    if not isinstance(users, list) or not users:
        return None
    target = query.lower()
    for user in users:
        addr = (user.get("emailAddress") or "").lower()
        if addr == target:
            return user
    return users[0]


def _fetch_project_roles(session: JiraSession, project_key: str) -> dict[str, str]:
    resp = session.get(f"/rest/api/3/project/{project_key}/role", timeout=15)
    if resp.status_code == 404:
        raise HTTPException(status_code=404, detail=f"Jira project {project_key} was not found.")
    if resp.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"Could not load Jira project roles ({resp.status_code}): {resp.text[:300]}",
        )
    data = resp.json()
    if not isinstance(data, dict) or not data:
        raise HTTPException(
            status_code=502,
            detail="Jira returned no project roles for this project.",
        )
    return {str(name): str(url) for name, url in data.items()}


def _pick_project_role(roles: dict[str, str]) -> tuple[str, str]:
    for name in _ROLE_PREFERENCE:
        if name in roles:
            return name, roles[name]
    for name, url in roles.items():
        if name.lower() not in ("administrators", "administrator"):
            return name, url
    name, url = next(iter(roles.items()))
    return name, url


def _role_id_from_url(role_url: str) -> str:
    return role_url.rstrip("/").split("/")[-1]


def _role_detail_api_path(role_url: str, session: JiraSession) -> str:
    """Normalize a Jira project role URL to a path for session.get."""
    if role_url.startswith("/"):
        return role_url
    base = session.base_url.rstrip("/")
    if role_url.startswith(base):
        suffix = role_url[len(base) :]
        return suffix if suffix.startswith("/") else f"/{suffix}"
    marker = "/rest/api/"
    pos = role_url.find(marker)
    if pos >= 0:
        return role_url[pos:]
    return role_url


_USER_ROLE_ACTOR = "atlassian-user-role-actor"
_GROUP_ROLE_ACTOR = "atlassian-group-role-actor"


def _fetch_project_role_detail(session: JiraSession, role_url: str) -> dict[str, Any] | None:
    resp = session.get(_role_detail_api_path(role_url, session), timeout=15)
    if resp.status_code != 200:
        return None
    data = resp.json()
    return data if isinstance(data, dict) else None


def _build_project_members(session: JiraSession, project_key: str) -> list[JiraProjectMember]:
    """Users and groups assigned to Jira project roles (not issue workload)."""
    try:
        roles = _fetch_project_roles(session, project_key)
    except HTTPException:
        return []

    merged: dict[str, JiraProjectMember] = {}

    for role_name, role_url in roles.items():
        detail = _fetch_project_role_detail(session, role_url)
        if not detail:
            continue
        actors = detail.get("actors")
        if not isinstance(actors, list):
            continue

        for actor in actors:
            if not isinstance(actor, dict):
                continue
            actor_type = str(actor.get("type") or "")

            if actor_type == _USER_ROLE_ACTOR:
                actor_user = actor.get("actorUser")
                if not isinstance(actor_user, dict):
                    continue
                account_id = actor_user.get("accountId")
                if not account_id:
                    continue
                key = f"user:{account_id}"
                if key not in merged:
                    merged[key] = JiraProjectMember(
                        account_id=account_id,
                        display_name=actor.get("displayName") or account_id,
                        actor_type="user",
                    )
                if role_name not in merged[key].roles:
                    merged[key].roles.append(role_name)
                continue

            if actor_type == _GROUP_ROLE_ACTOR or "group" in actor_type:
                actor_group = actor.get("actorGroup")
                group_id = None
                if isinstance(actor_group, dict):
                    group_id = actor_group.get("groupId") or actor_group.get("name")
                group_id = group_id or actor.get("name") or actor.get("displayName")
                if not group_id:
                    continue
                key = f"group:{group_id}"
                display_name = (
                    actor.get("displayName")
                    or (actor_group.get("displayName") if isinstance(actor_group, dict) else None)
                    or (actor_group.get("name") if isinstance(actor_group, dict) else None)
                    or str(group_id)
                )
                if key not in merged:
                    merged[key] = JiraProjectMember(
                        display_name=display_name,
                        actor_type="group",
                    )
                if role_name not in merged[key].roles:
                    merged[key].roles.append(role_name)

    return sorted(
        merged.values(),
        key=lambda m: (m.actor_type != "user", m.display_name.lower()),
    )


def _add_teammate_to_jira_project(
    session: JiraSession,
    project_key: str,
    email: str,
    *,
    display_name_hint: str | None = None,
) -> AddProjectTeamMemberResponse:
    user = _search_jira_user_by_email(session, email)
    if not user:
        raise HTTPException(
            status_code=404,
            detail=(
                f"No Jira user found for {email.strip()}. "
                "They need an Atlassian account with access to this site."
            ),
        )

    account_id = user.get("accountId")
    if not account_id:
        raise HTTPException(
            status_code=502,
            detail="Jira returned a user without an account id.",
        )

    display_name = (
        user.get("displayName")
        or display_name_hint
        or user.get("emailAddress")
        or email.strip()
    )

    roles = _fetch_project_roles(session, project_key)
    role_name, role_url = _pick_project_role(roles)
    role_id = _role_id_from_url(role_url)

    resp = session.post(
        f"/rest/api/3/project/{project_key}/role/{role_id}",
        json={"user": [account_id]},
        timeout=15,
    )
    if resp.status_code in (200, 201, 204):
        return AddProjectTeamMemberResponse(
            ok=True,
            message=f"Added {display_name} to the {role_name} role in Jira project {project_key}.",
            account_id=account_id,
            display_name=display_name,
            role_name=role_name,
        )

    body_lower = (resp.text or "").lower()
    if resp.status_code == 400 and (
        "already" in body_lower or "exists" in body_lower or "duplicate" in body_lower
    ):
        return AddProjectTeamMemberResponse(
            ok=True,
            message=f"{display_name} is already on Jira project {project_key} ({role_name} role).",
            account_id=account_id,
            display_name=display_name,
            role_name=role_name,
            already_member=True,
        )

    if resp.status_code in (401, 403):
        raise HTTPException(
            status_code=403,
            detail=(
                "Your Jira connection cannot add people to this project. "
                "Reconnect Jira in Settings with an account that has Administer Projects "
                "permission, or ask a Jira administrator to add this teammate."
            ),
        )

    raise HTTPException(
        status_code=502,
        detail=f"Could not add user to Jira project ({resp.status_code}): {resp.text[:300]}",
    )


def _build_project_team(
    session: JiraSession, project_key: str, max_issues: int = 100
) -> JiraProjectTeam:
    meta = _fetch_project_meta(session, project_key)
    lead = meta.get("lead") or {}
    project_name = meta.get("name")
    project_lead = lead.get("displayName") if isinstance(lead, dict) else None

    members: dict[str, JiraProjectTeammate] = {}

    jql = f'project = "{project_key}" ORDER BY updated DESC'
    issues = _search_jira_issues(
        session,
        jql,
        max_issues,
        fields=["summary", "status", "priority", "assignee"],
    )
    unassigned = 0

    for raw in issues:
        fields = raw.get("fields", {})
        assignee_obj = fields.get("assignee")
        teammate_issue = _issue_to_teammate_item(session, raw)
        category = (teammate_issue.status_category or "").lower()
        is_done = category == "done" or teammate_issue.status.lower() in ("done", "closed", "resolved")
        in_progress = not is_done and (
            category == "in progress"
            or "progress" in teammate_issue.status.lower()
            or teammate_issue.status.lower() in ("in review", "review")
        )

        if not assignee_obj:
            unassigned += 1
            continue

        account_id = assignee_obj.get("accountId")
        member_key = account_id or assignee_obj.get("emailAddress") or assignee_obj.get("displayName")
        if member_key not in members:
            avatars = assignee_obj.get("avatarUrls") or {}
            members[member_key] = JiraProjectTeammate(
                account_id=account_id,
                display_name=assignee_obj.get("displayName") or "Unknown",
                email=assignee_obj.get("emailAddress"),
                avatar_url=avatars.get("48x48") or avatars.get("32x32"),
            )

        member = members[member_key]
        member.total_assigned += 1
        if is_done:
            member.done_count += 1
        else:
            member.active_count += 1
            if in_progress:
                member.in_progress_count += 1
            if len(member.recent_issues) < 5 and not is_done:
                member.recent_issues.append(teammate_issue)

    teammates = sorted(
        members.values(),
        key=lambda m: (-m.active_count, -m.total_assigned, m.display_name.lower()),
    )
    project_members = _build_project_members(session, project_key)

    return JiraProjectTeam(
        project_key=project_key,
        project_name=project_name,
        project_lead=project_lead,
        site_url=session.browse_base,
        project_members=project_members,
        teammates=teammates,
        unassigned_count=unassigned,
    )


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


def _oauth_error_response(exc: jira_oauth.JiraOAuthSetupError) -> HTTPException:
    return HTTPException(
        status_code=503,
        detail={
            "message": exc.user_message,
            "code": exc.code,
            "admin_message": exc.admin_message,
        },
    )


def _public_connection(uid: str) -> JiraConnectionPublic:
    setup_err = jira_oauth.oauth_config_error()
    if setup_err:
        return JiraConnectionPublic(
            connected=False,
            auth_mode=None,
            oauth_available=False,
            user_message=setup_err.user_message,
            error_code=setup_err.code,
        )
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
            oauth_available=True,
        )
    return JiraConnectionPublic(connected=False, auth_mode=None, oauth_available=True)


# ---------------------------------------------------------------------------
# OAuth routes
# ---------------------------------------------------------------------------

@router.get("/oauth/start", response_model=OAuthStartResponse)
def jira_oauth_start(uid: str = Depends(verify_firebase_bearer)) -> OAuthStartResponse:
    """Return Atlassian authorize URL for the signed-in Firebase user."""
    try:
        url = jira_oauth.build_authorize_url(uid)
    except jira_oauth.JiraOAuthSetupError as exc:
        raise _oauth_error_response(exc) from exc
    return OAuthStartResponse(authorize_url=url)


@router.get("/oauth/callback")
def jira_oauth_callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    error_description: str | None = None,
):
    """Exchange authorization code and redirect back to the web app."""
    base = jira_oauth.frontend_base_url()
    if error:
        reason = jira_oauth.map_atlassian_authorize_error(error, error_description)
        return RedirectResponse(f"{base}/settings?jira=error&reason={reason}")
    if not code or not state:
        return RedirectResponse(f"{base}/settings?jira=error&reason=missing_params")
    try:
        uid = jira_oauth.verify_oauth_state(state)
        tokens = jira_oauth.exchange_code_for_tokens(code)
    except (ValueError, RuntimeError):
        return RedirectResponse(f"{base}/settings?jira=error&reason=jira_oauth_failed")
    record = load_record(uid) or JiraOAuthRecord(uid=uid)
    try:
        jira_oauth.apply_tokens_to_record(record, tokens)
    except jira_oauth.JiraOAuthSetupError as exc:
        return RedirectResponse(f"{base}/settings?jira=error&reason={exc.code}")
    except RuntimeError:
        return RedirectResponse(f"{base}/settings?jira=error&reason=jira_oauth_failed")
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


@router.get("/projects/{project_key}/team", response_model=JiraProjectTeam)
def list_jira_project_team(
    project_key: str,
    max_results: int = 100,
    session: JiraSession = Depends(resolve_jira_session),
) -> JiraProjectTeam:
    """Teammates on a Jira project with workload from live issues (no Jira UI login)."""
    return _build_project_team(session, project_key, max_results)


@router.post("/projects/{project_key}/team", response_model=AddProjectTeamMemberResponse)
def add_jira_project_team_member(
    project_key: str,
    body: AddProjectTeamMemberRequest,
    session: JiraSession = Depends(resolve_jira_session),
) -> AddProjectTeamMemberResponse:
    """Add an Atlassian user to a Jira project role by email (server-side OAuth/basic)."""
    return _add_teammate_to_jira_project(
        session,
        project_key,
        body.email,
        display_name_hint=body.display_name,
    )


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
