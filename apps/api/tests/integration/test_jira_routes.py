"""Jira proxy routes — mocked HTTP to Atlassian."""

from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)

JIRA_HEADERS = {
    "X-Jira-Domain": "acme.atlassian.net",
    "X-Jira-Email": "dev@acme.com",
    "X-Jira-Token": "secret-token",
    "X-Jira-Project": "PROJ",
}


def test_jira_config_without_credentials():
    r = client.get("/jira/config")
    assert r.status_code == 200
    assert r.json()["configured"] is False


def test_jira_requires_credentials():
    r = client.post("/jira/config/test")
    assert r.status_code == 503


@patch("letaicook_api.services.jira_session.JiraSession.get")
def test_jira_test_connection_ok(mock_get: MagicMock):
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"displayName": "Dev User"}
    mock_get.return_value = mock_resp

    r = client.post("/jira/config/test", headers=JIRA_HEADERS)
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["user"] == "Dev User"


@patch("letaicook_api.services.jira_session.JiraSession.post")
@patch("letaicook_api.services.jira_session.JiraSession.put")
def test_jira_update_and_delete(mock_put: MagicMock, mock_post: MagicMock):
    mock_put.return_value = MagicMock(status_code=204, text="")
    mock_post.return_value = MagicMock(status_code=204, text="")

    with patch("letaicook_api.services.jira_session.JiraSession.delete") as mock_delete:
        mock_delete.return_value = MagicMock(status_code=204, text="")

        r = client.put(
            "/jira/issues/PROJ-1",
            headers=JIRA_HEADERS,
            json={"summary": "Updated title", "priority": "high"},
        )
        assert r.status_code == 200
        assert r.json()["issue_key"] == "PROJ-1"

        r2 = client.delete("/jira/issues/PROJ-1", headers=JIRA_HEADERS)
        assert r2.status_code == 200
        assert r2.json()["ok"] is True


@patch("letaicook_api.services.jira_session.JiraSession.post")
@patch("letaicook_api.services.jira_session.JiraSession.get")
def test_jira_sync_status(mock_get: MagicMock, mock_post: MagicMock):
    mock_get.return_value = MagicMock(
        status_code=200,
        json=lambda: {
            "transitions": [
                {"id": "1", "name": "In Progress", "to": {"name": "In Progress"}},
            ]
        },
    )
    mock_post.return_value = MagicMock(status_code=204, text="")

    r = client.post(
        "/jira/issues/PROJ-2/sync-status",
        headers=JIRA_HEADERS,
        json={"status": "in_progress"},
    )
    assert r.status_code == 200
    assert r.json()["new_status"] == "In Progress"


@patch("letaicook_api.services.jira_session.JiraSession.get")
def test_list_project_issues(mock_get: MagicMock):
    def fake_get(path, **kwargs):
        if "search/jql" in path:
            return MagicMock(
                status_code=200,
                text="",
                json=lambda: {
                    "issues": [
                        {
                            "key": "PROJ-9",
                            "fields": {
                                "summary": "From Jira",
                                "status": {
                                    "name": "To Do",
                                    "statusCategory": {"name": "To Do"},
                                },
                                "priority": {"name": "Medium"},
                            },
                        }
                    ]
                },
            )
        return MagicMock(status_code=404, text="not used")

    mock_get.side_effect = fake_get
    r = client.get("/jira/projects/PROJ/issues", headers=JIRA_HEADERS)
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["issue_key"] == "PROJ-9"
    assert body[0]["summary"] == "From Jira"
