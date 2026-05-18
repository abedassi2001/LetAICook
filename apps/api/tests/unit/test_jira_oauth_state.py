"""OAuth state signing and verification."""

import os

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
