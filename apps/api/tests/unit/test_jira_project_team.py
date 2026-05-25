"""Jira project team aggregation."""

from unittest.mock import MagicMock

from letaicook_api.routers.jira import _build_project_team
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
