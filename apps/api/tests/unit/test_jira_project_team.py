"""Jira project team aggregation and add-to-project helpers."""

from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from letaicook_api.routers.jira import (
    _add_teammate_to_jira_project,
    _build_project_team,
    _pick_project_role,
)
from letaicook_api.services.jira_session import JiraSession


def _session() -> JiraSession:
    return JiraSession(
        base_url="https://api.atlassian.com/ex/jira/cloud-1",
        auth=None,
        bearer_token="token",
        default_project="DEMO",
        browse_base="https://acme.atlassian.net",
    )


def test_build_project_team_aggregates_assignees(monkeypatch):
    session = _session()

    monkeypatch.setattr(
        "letaicook_api.routers.jira._fetch_project_meta",
        lambda _s, _k: {"name": "Demo", "lead": {"displayName": "Lead User"}},
    )
    monkeypatch.setattr(
        "letaicook_api.routers.jira._fetch_assignable_users",
        lambda _s, _k, max_results=50: [
            {
                "accountId": "acc-1",
                "displayName": "Alex",
                "emailAddress": "alex@example.com",
                "avatarUrls": {"48x48": "https://avatar/alex"},
            },
        ],
    )
    monkeypatch.setattr(
        "letaicook_api.routers.jira._search_jira_issues",
        lambda _s, _jql, _max, fields=None: [
            {
                "key": "DEMO-1",
                "fields": {
                    "summary": "Open task",
                    "status": {
                        "name": "In Progress",
                        "statusCategory": {"name": "In Progress"},
                    },
                    "priority": {"name": "Medium"},
                    "assignee": {
                        "accountId": "acc-1",
                        "displayName": "Alex",
                        "emailAddress": "alex@example.com",
                    },
                },
            },
            {
                "key": "DEMO-2",
                "fields": {
                    "summary": "Unassigned",
                    "status": {"name": "To Do", "statusCategory": {"name": "To Do"}},
                    "priority": None,
                    "assignee": None,
                },
            },
        ],
    )

    team = _build_project_team(session, "DEMO", 50)
    assert team.project_key == "DEMO"
    assert team.project_name == "Demo"
    assert team.project_lead == "Lead User"
    assert team.unassigned_count == 1
    assert len(team.teammates) == 1
    alex = team.teammates[0]
    assert alex.display_name == "Alex"
    assert alex.active_count == 1
    assert alex.total_assigned == 1
    assert len(alex.recent_issues) == 1
    assert alex.recent_issues[0].issue_key == "DEMO-1"


def test_pick_project_role_prefers_developers():
    roles = {
        "Administrators": "https://example/role/1",
        "Developers": "https://example/role/2",
        "Users": "https://example/role/3",
    }
    name, url = _pick_project_role(roles)
    assert name == "Developers"
    assert url == "https://example/role/2"


def test_add_teammate_to_jira_project_success():
    session = _session()

    def fake_get(path, **kwargs):
        resp = MagicMock()
        if path == "/rest/api/3/user/search":
            resp.status_code = 200
            resp.json.return_value = [
                {
                    "accountId": "acc-2",
                    "displayName": "Jamie",
                    "emailAddress": "jamie@example.com",
                }
            ]
        elif path == "/rest/api/3/project/DEMO/role":
            resp.status_code = 200
            resp.json.return_value = {
                "Developers": "https://api.atlassian.com/ex/jira/cloud-1/rest/api/3/project/DEMO/role/10002"
            }
        else:
            resp.status_code = 404
            resp.text = "not found"
        return resp

    def fake_post(path, **kwargs):
        resp = MagicMock()
        assert path == "/rest/api/3/project/DEMO/role/10002"
        assert kwargs.get("json") == {"user": ["acc-2"]}
        resp.status_code = 200
        resp.text = ""
        return resp

    session.get = fake_get  # type: ignore[method-assign]
    session.post = fake_post  # type: ignore[method-assign]

    result = _add_teammate_to_jira_project(session, "DEMO", "jamie@example.com")
    assert result.ok is True
    assert result.account_id == "acc-2"
    assert result.role_name == "Developers"
    assert result.already_member is False


def test_add_teammate_to_jira_project_user_not_found():
    session = _session()

    def fake_get(path, **kwargs):
        resp = MagicMock()
        if path == "/rest/api/3/user/search":
            resp.status_code = 200
            resp.json.return_value = []
        return resp

    session.get = fake_get  # type: ignore[method-assign]

    with pytest.raises(HTTPException) as exc_info:
        _add_teammate_to_jira_project(session, "DEMO", "missing@example.com")
    assert exc_info.value.status_code == 404


def test_add_teammate_to_jira_project_already_member():
    session = _session()

    def fake_get(path, **kwargs):
        resp = MagicMock()
        if path == "/rest/api/3/user/search":
            resp.status_code = 200
            resp.json.return_value = [
                {
                    "accountId": "acc-2",
                    "displayName": "Jamie",
                    "emailAddress": "jamie@example.com",
                }
            ]
        elif path == "/rest/api/3/project/DEMO/role":
            resp.status_code = 200
            resp.json.return_value = {"Member": "https://example/role/99"}
        return resp

    def fake_post(path, **kwargs):
        resp = MagicMock()
        resp.status_code = 400
        resp.text = "User already exists in this role"
        return resp

    session.get = fake_get  # type: ignore[method-assign]
    session.post = fake_post  # type: ignore[method-assign]

    result = _add_teammate_to_jira_project(session, "DEMO", "jamie@example.com")
    assert result.ok is True
    assert result.already_member is True
