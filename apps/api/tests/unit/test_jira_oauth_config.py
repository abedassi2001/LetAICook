"""SaaS-style Jira OAuth configuration and public API shape."""

import pytest
from pydantic import BaseModel

from letaicook_api.routers.jira import JiraConnectionPublic, _public_connection
from letaicook_api.services import jira_oauth


def test_oauth_not_configured_when_env_missing(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("ATLASSIAN_CLIENT_ID", raising=False)
    monkeypatch.delenv("ATLASSIAN_CLIENT_SECRET", raising=False)
    monkeypatch.delenv("ATLASSIAN_REDIRECT_URI", raising=False)
    assert jira_oauth.oauth_configured() is False
    err = jira_oauth.oauth_config_error()
    assert err is not None
    assert err.code == jira_oauth.CODE_NOT_CONFIGURED


def test_public_connection_exposes_no_tokens(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("ATLASSIAN_CLIENT_ID", "abc123RealClientIdFromConsole")
    monkeypatch.setenv("ATLASSIAN_CLIENT_SECRET", "secret-value")
    monkeypatch.setenv("ATLASSIAN_REDIRECT_URI", "http://localhost:8000/jira/oauth/callback")
    pub = _public_connection("user-1")
    payload = pub.model_dump()
    assert "access_token" not in payload
    assert "refresh_token" not in payload
    assert pub.oauth_available is True


def test_public_connection_when_oauth_unconfigured(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("ATLASSIAN_CLIENT_ID", raising=False)
    pub = _public_connection("user-1")
    assert pub.connected is False
    assert pub.oauth_available is False
    assert pub.error_code == jira_oauth.CODE_NOT_CONFIGURED
    assert pub.user_message


def test_map_atlassian_authorize_error_no_jira_site():
    reason = jira_oauth.map_atlassian_authorize_error(
        "access_denied",
        "This app requires access to a Jira site which you don't have permission to access.",
    )
    assert reason == jira_oauth.CODE_NO_SITES


def test_map_atlassian_authorize_error_development_distribution():
    reason = jira_oauth.map_atlassian_authorize_error(
        "access_denied",
        "This application is in development - only the owner of this application may grant it access",
    )
    assert reason == jira_oauth.CODE_DISTRIBUTION


def test_apply_tokens_raises_when_no_accessible_sites(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("ATLASSIAN_CLIENT_ID", "abc123RealClientIdFromConsole")
    monkeypatch.setenv("ATLASSIAN_CLIENT_SECRET", "secret-value")
    monkeypatch.setenv("ATLASSIAN_REDIRECT_URI", "http://localhost:8000/jira/oauth/callback")

    def _empty_resources(_access_token: str):
        return []

    monkeypatch.setattr(jira_oauth, "fetch_accessible_resources", _empty_resources)

    from letaicook_api.services.jira_oauth_store import JiraOAuthRecord

    record = JiraOAuthRecord(uid="user-no-sites")
    with pytest.raises(jira_oauth.JiraOAuthSetupError) as exc_info:
        jira_oauth.apply_tokens_to_record(
            record,
            {"access_token": "at", "refresh_token": "rt", "expires_in": 3600},
        )
    assert exc_info.value.code == jira_oauth.CODE_NO_SITES
    assert record.connected is False
    assert record.access_token == ""


def test_jira_connection_public_model_fields():
    """Guardrail: public response must not gain token fields accidentally."""

    class _Fields(BaseModel):
        pass

    allowed = set(JiraConnectionPublic.model_fields)
    forbidden = {"access_token", "refresh_token", "client_secret"}
    assert forbidden.isdisjoint(allowed)
