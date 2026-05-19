"""OAuth state signing and authorization URL."""

from urllib.parse import parse_qs, urlparse

import pytest

from letaicook_api.services import jira_oauth


@pytest.fixture(autouse=True)
def oauth_env(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("ATLASSIAN_CLIENT_SECRET", "test-secret-for-state")
    monkeypatch.setenv("ATLASSIAN_CLIENT_ID", "test-client")
    monkeypatch.setenv("ATLASSIAN_REDIRECT_URI", "http://localhost:8000/jira/oauth/callback")


def test_oauth_state_round_trip():
    state = jira_oauth.make_oauth_state("firebase-uid-123")
    uid = jira_oauth.verify_oauth_state(state)
    assert uid == "firebase-uid-123"


def test_oauth_state_rejects_tamper():
    state = jira_oauth.make_oauth_state("uid-a")
    tampered = state[:-1] + ("x" if state[-1] != "x" else "y")
    with pytest.raises(ValueError):
        jira_oauth.verify_oauth_state(tampered)


def test_build_authorize_url_rejects_placeholder_client_id(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("ATLASSIAN_CLIENT_ID", "your_client_id")
    with pytest.raises(jira_oauth.JiraOAuthSetupError) as exc_info:
        jira_oauth.build_authorize_url("firebase-uid-test")
    assert exc_info.value.code == jira_oauth.CODE_MISCONFIGURED


def test_build_authorize_url_includes_required_scopes(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("ATLASSIAN_CLIENT_ID", "abc123RealClientIdFromConsole")
    url = jira_oauth.build_authorize_url("firebase-uid-test")
    assert url.startswith(f"{jira_oauth.ATLASSIAN_AUTH_URL}?")
    query = parse_qs(urlparse(url).query)
    assert "scope" in query
    scope_value = query["scope"][0]
    assert scope_value == jira_oauth.ATLASSIAN_SCOPE_PARAM
    assert scope_value == (
        "read:jira-work write:jira-work read:jira-user offline_access"
    )
    for required in jira_oauth.ATLASSIAN_SCOPES:
        assert required in scope_value.split()
    # Encoded URL must contain scope= (spaces as + or %20)
    assert "scope=read%3Ajira-work" in url or "scope=read:jira-work" in url
    assert "offline_access" in url.replace("+", " ")
