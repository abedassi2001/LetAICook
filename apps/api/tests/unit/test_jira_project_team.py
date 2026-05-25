"""Jira project team aggregation and add-to-project helpers."""

from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from letaicook_api.routers.jira import (
    JiraProjectMember,
    _add_teammate_to_jira_project,
    _build_project_members,
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


def _patch_empty_project_members(monkeypatch) -> None:
    monkeypatch.setattr(
        "letaicook_api.routers.jira._build_project_members",
        lambda _s, _k: [],
    )


def test_build_project_team_aggregates_assignees(monkeypatch):
    session = _session()
    _patch_empty_project_members(monkeypatch)

    monkeypatch.setattr(
        "letaicook_api.routers.jira._fetch_project_meta",
        lambda _s, _k: {"name": "Demo", "lead": {"displayName": "Lead User"}},
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


def test_build_project_team_assignable_users_ignored_without_issues(monkeypatch):
    """Assignable users must not appear when the project has no assigned issues."""
    session = _session()
    _patch_empty_project_members(monkeypatch)

    monkeypatch.setattr(
        "letaicook_api.routers.jira._fetch_project_meta",
        lambda _s, _k: {"name": "Empty", "lead": {"displayName": "Lead"}},
    )
    monkeypatch.setattr(
        "letaicook_api.routers.jira._fetch_assignable_users",
        lambda _s, _k, max_results=50: [
            {
                "accountId": "acc-a",
                "displayName": "Assignable Only",
                "emailAddress": "a@example.com",
            },
            {
                "accountId": "acc-b",
                "displayName": "Another Assignable",
                "emailAddress": "b@example.com",
            },
        ],
    )
    monkeypatch.setattr(
        "letaicook_api.routers.jira._search_jira_issues",
        lambda _s, _jql, _max, fields=None: [],
    )

    team = _build_project_team(session, "TES", 50)
    assert team.project_key == "TES"
    assert team.teammates == []
    assert team.unassigned_count == 0


def test_build_project_team_includes_issue_assignee_not_in_assignable(monkeypatch):
    session = _session()
    _patch_empty_project_members(monkeypatch)

    monkeypatch.setattr(
        "letaicook_api.routers.jira._fetch_project_meta",
        lambda _s, _k: {"name": "Demo", "lead": None},
    )
    monkeypatch.setattr(
        "letaicook_api.routers.jira._fetch_assignable_users",
        lambda _s, _k, max_results=50: [
            {
                "accountId": "acc-other",
                "displayName": "Someone Else",
                "emailAddress": "other@example.com",
            },
        ],
    )
    monkeypatch.setattr(
        "letaicook_api.routers.jira._search_jira_issues",
        lambda _s, _jql, _max, fields=None: [
            {
                "key": "DEMO-9",
                "fields": {
                    "summary": "Jamie task",
                    "status": {"name": "To Do", "statusCategory": {"name": "To Do"}},
                    "priority": None,
                    "assignee": {
                        "accountId": "acc-jamie",
                        "displayName": "Jamie",
                        "emailAddress": "jamie@example.com",
                    },
                },
            },
        ],
    )

    team = _build_project_team(session, "DEMO", 50)
    assert len(team.teammates) == 1
    assert team.teammates[0].account_id == "acc-jamie"
    assert team.teammates[0].display_name == "Jamie"
    assert team.teammates[0].total_assigned == 1


def test_build_project_members_dedupes_user_across_roles(monkeypatch):
    session = _session()

    monkeypatch.setattr(
        "letaicook_api.routers.jira._fetch_project_roles",
        lambda _s, _k: {
            "Developers": "/rest/api/3/project/DEMO/role/1",
            "Member": "/rest/api/3/project/DEMO/role/2",
        },
    )

    def role_detail(_s, role_url: str):
        actors = [
            {
                "type": "atlassian-user-role-actor",
                "displayName": "Alex Cohen",
                "actorUser": {"accountId": "acc-alex"},
            }
        ]
        return {"actors": actors, "name": "Role"}

    monkeypatch.setattr(
        "letaicook_api.routers.jira._fetch_project_role_detail",
        role_detail,
    )

    members = _build_project_members(session, "DEMO")
    assert len(members) == 1
    assert members[0].account_id == "acc-alex"
    assert members[0].display_name == "Alex Cohen"
    assert sorted(members[0].roles) == ["Developers", "Member"]


def test_build_project_members_user_in_role_without_issues(monkeypatch):
    session = _session()

    monkeypatch.setattr(
        "letaicook_api.routers.jira._fetch_project_meta",
        lambda _s, _k: {"name": "Demo", "lead": None},
    )
    monkeypatch.setattr(
        "letaicook_api.routers.jira._fetch_project_roles",
        lambda _s, _k: {"Developers": "/rest/api/3/project/DEMO/role/1"},
    )
    monkeypatch.setattr(
        "letaicook_api.routers.jira._fetch_project_role_detail",
        lambda _s, _url: {
            "actors": [
                {
                    "type": "atlassian-user-role-actor",
                    "displayName": "Idle Member",
                    "actorUser": {"accountId": "acc-idle"},
                }
            ]
        },
    )
    monkeypatch.setattr(
        "letaicook_api.routers.jira._search_jira_issues",
        lambda _s, _jql, _max, fields=None: [],
    )

    team = _build_project_team(session, "DEMO", 50)
    assert len(team.project_members) == 1
    assert team.project_members[0].account_id == "acc-idle"
    assert team.teammates == []


def test_build_project_members_parses_group_actor(monkeypatch):
    session = _session()

    monkeypatch.setattr(
        "letaicook_api.routers.jira._fetch_project_roles",
        lambda _s, _k: {"Developers": "/rest/api/3/project/DEMO/role/1"},
    )
    monkeypatch.setattr(
        "letaicook_api.routers.jira._fetch_project_role_detail",
        lambda _s, _url: {
            "actors": [
                {
                    "type": "atlassian-group-role-actor",
                    "displayName": "jira-developers",
                    "actorGroup": {
                        "groupId": "grp-1",
                        "displayName": "jira-developers",
                        "name": "jira-developers",
                    },
                }
            ]
        },
    )

    members = _build_project_members(session, "DEMO")
    assert len(members) == 1
    assert members[0].actor_type == "group"
    assert members[0].account_id is None
    assert members[0].display_name == "jira-developers"
    assert members[0].roles == ["Developers"]


def test_build_project_team_returns_members_and_workload(monkeypatch):
    session = _session()

    monkeypatch.setattr(
        "letaicook_api.routers.jira._fetch_project_meta",
        lambda _s, _k: {"name": "Demo", "lead": None},
    )
    monkeypatch.setattr(
        "letaicook_api.routers.jira._build_project_members",
        lambda _s, _k: [
            JiraProjectMember(
                account_id="acc-role",
                display_name="Role User",
                roles=["Developers"],
            )
        ],
    )
    monkeypatch.setattr(
        "letaicook_api.routers.jira._search_jira_issues",
        lambda _s, _jql, _max, fields=None: [
            {
                "key": "DEMO-1",
                "fields": {
                    "summary": "Task",
                    "status": {"name": "To Do", "statusCategory": {"name": "To Do"}},
                    "priority": None,
                    "assignee": {
                        "accountId": "acc-worker",
                        "displayName": "Worker",
                        "emailAddress": "w@example.com",
                    },
                },
            },
        ],
    )

    team = _build_project_team(session, "DEMO", 50)
    assert len(team.project_members) == 1
    assert team.project_members[0].account_id == "acc-role"
    assert len(team.teammates) == 1
    assert team.teammates[0].account_id == "acc-worker"


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
