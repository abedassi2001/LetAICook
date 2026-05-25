"""Atlassian OAuth 2.0 (3LO) helpers."""

from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import os
import secrets
import time
from typing import Any
from urllib.parse import urlencode

import requests

from letaicook_api.services.jira_oauth_store import JiraOAuthRecord, load_record, save_record

logger = logging.getLogger(__name__)

ATLASSIAN_AUTH_URL = "https://auth.atlassian.com/authorize"
ATLASSIAN_TOKEN_URL = "https://auth.atlassian.com/oauth/token"
ATLASSIAN_RESOURCES_URL = "https://api.atlassian.com/oauth/token/accessible-resources"

ATLASSIAN_SCOPES = [
    "read:jira-work",
    "write:jira-work",
    "read:jira-user",
    "manage:jira-configuration",
    "offline_access",
]

# Space-separated scopes for the authorize URL (Atlassian 3LO).
ATLASSIAN_SCOPE_PARAM = " ".join(ATLASSIAN_SCOPES)

_PLACEHOLDER_CLIENT_IDS = frozenset({"your_client_id", "your-client-id"})

# Error codes for API/frontend (no secrets in payloads).
CODE_NOT_CONFIGURED = "jira_oauth_not_configured"
CODE_MISCONFIGURED = "jira_oauth_misconfigured"
CODE_NO_SITES = "jira_no_sites"
CODE_DISTRIBUTION = "jira_oauth_distribution"

USER_MESSAGES: dict[str, str] = {
    CODE_NOT_CONFIGURED: (
        "Jira integration is not configured by this deployment. "
        "Please ask your administrator to enable it."
    ),
    CODE_MISCONFIGURED: (
        "Jira integration is not configured by this deployment. "
        "Please ask your administrator to complete the server setup."
    ),
    CODE_NO_SITES: (
        "Your Atlassian account does not have access to any Jira Cloud site. "
        "Create a Jira site or ask an admin to invite you, then try again."
    ),
    CODE_DISTRIBUTION: (
        "This Jira app is still in development on Atlassian. Only the app owner can connect "
        "until distribution is enabled. Ask your letAIcook administrator to add your Atlassian "
        "account as a test user or publish the app in the Atlassian Developer Console."
    ),
}

ADMIN_MESSAGES: dict[str, str] = {
    CODE_NOT_CONFIGURED: (
        "Set ATLASSIAN_CLIENT_ID, ATLASSIAN_CLIENT_SECRET, ATLASSIAN_REDIRECT_URI, and "
        "FRONTEND_BASE_URL on the API service (see deploy/README.md)."
    ),
    CODE_MISCONFIGURED: (
        "Replace placeholder Atlassian OAuth values in API env with credentials from "
        "Atlassian Developer Console → OAuth 2.0 (3LO)."
    ),
    CODE_NO_SITES: "accessible-resources returned no Jira Cloud sites for this Atlassian account.",
    CODE_DISTRIBUTION: (
        "Atlassian Developer Console → your OAuth 2.0 app → Distribution: enable distribution "
        "and add each teammate's Atlassian account email as a test user (or publish the app). "
        "See deploy/JIRA_OAUTH_DISTRIBUTION.md."
    ),
}


def map_atlassian_authorize_error(
    error: str | None,
    error_description: str | None = None,
) -> str:
    """Map Atlassian authorize-step error to a settings callback reason code."""
    combined = f"{error or ''} {error_description or ''}".lower()
    if (
        "in development" in combined
        or "only the owner" in combined
        or "don't have access to this app" in combined
        or "do not have access to this app" in combined
    ):
        return CODE_DISTRIBUTION
    if "jira site" in combined or (
        "jira" in combined and ("don't have" in combined or "do not have" in combined)
    ):
        return CODE_NO_SITES
    normalized = (error or "").lower().strip()
    if normalized in ("access_denied", "user_denied", "consent_denied"):
        return "jira_oauth_denied"
    return "jira_oauth_failed"



class JiraOAuthSetupError(Exception):
    """SaaS OAuth cannot proceed; safe to expose code and user_message to clients."""

    def __init__(self, code: str, *, admin_detail: str | None = None) -> None:
        self.code = code
        self.user_message = USER_MESSAGES.get(code, USER_MESSAGES[CODE_NOT_CONFIGURED])
        self.admin_message = admin_detail or ADMIN_MESSAGES.get(
            code, ADMIN_MESSAGES[CODE_NOT_CONFIGURED]
        )
        super().__init__(self.user_message)


def oauth_configured() -> bool:
    """True when server-side Atlassian OAuth env is present."""
    return oauth_config_error() is None


def oauth_config_error() -> JiraOAuthSetupError | None:
    """Return setup error if OAuth is not ready, else None."""
    try:
        _client_id()
    except ValueError as exc:
        msg = str(exc)
        if "placeholder" in msg.lower():
            return JiraOAuthSetupError(CODE_MISCONFIGURED, admin_detail=msg)
        return JiraOAuthSetupError(CODE_NOT_CONFIGURED, admin_detail=msg)
    try:
        _client_secret()
    except ValueError as exc:
        return JiraOAuthSetupError(CODE_NOT_CONFIGURED, admin_detail=str(exc))
    try:
        redirect_uri()
    except ValueError as exc:
        return JiraOAuthSetupError(CODE_NOT_CONFIGURED, admin_detail=str(exc))
    try:
        _state_secret()
    except ValueError as exc:
        return JiraOAuthSetupError(CODE_NOT_CONFIGURED, admin_detail=str(exc))
    return None


def assert_oauth_configured() -> None:
    err = oauth_config_error()
    if err:
        raise err


def _client_id() -> str:
    value = os.getenv("ATLASSIAN_CLIENT_ID", "").strip().strip('"').strip("'")
    if not value:
        raise ValueError("ATLASSIAN_CLIENT_ID is not set.")
    if value.lower() in _PLACEHOLDER_CLIENT_IDS:
        raise ValueError(
            "ATLASSIAN_CLIENT_ID is a placeholder; set the OAuth 2.0 (3LO) Client ID from "
            "Atlassian Developer Console → your app → Settings, then restart the API."
        )
    return value


def _client_secret() -> str:
    value = os.getenv("ATLASSIAN_CLIENT_SECRET", "").strip()
    if not value:
        raise ValueError("ATLASSIAN_CLIENT_SECRET is not set.")
    return value


def redirect_uri() -> str:
    value = os.getenv("ATLASSIAN_REDIRECT_URI", "").strip()
    if not value:
        raise ValueError("ATLASSIAN_REDIRECT_URI is not set.")
    return value


def frontend_base_url() -> str:
    return os.getenv("FRONTEND_BASE_URL", "http://localhost:3000").rstrip("/")


def _state_secret() -> bytes:
    secret = os.getenv("OAUTH_STATE_SECRET") or os.getenv("ATLASSIAN_CLIENT_SECRET") or ""
    if not secret.strip():
        raise ValueError("OAUTH_STATE_SECRET or ATLASSIAN_CLIENT_SECRET required for OAuth state.")
    return secret.encode("utf-8")


def make_oauth_state(uid: str) -> str:
    nonce = secrets.token_urlsafe(16)
    issued = str(int(time.time()))
    payload = f"{uid}|{nonce}|{issued}"
    sig = hmac.new(_state_secret(), payload.encode("utf-8"), hashlib.sha256).hexdigest()
    raw = f"{payload}|{sig}"
    return base64.urlsafe_b64encode(raw.encode("utf-8")).decode("ascii").rstrip("=")


def verify_oauth_state(state: str, max_age_seconds: int = 600) -> str:
    try:
        padded = state + "=" * (-len(state) % 4)
        decoded = base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8")
        uid, nonce, issued, sig = decoded.split("|", 3)
    except (ValueError, UnicodeDecodeError) as exc:
        raise ValueError("Invalid OAuth state.") from exc
    payload = f"{uid}|{nonce}|{issued}"
    expected = hmac.new(_state_secret(), payload.encode("utf-8"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, sig):
        raise ValueError("Invalid OAuth state signature.")
    if int(time.time()) - int(issued) > max_age_seconds:
        raise ValueError("OAuth state expired.")
    return uid


def build_authorize_url(uid: str) -> str:
    assert_oauth_configured()
    client_id = _client_id()
    redirect = redirect_uri()
    params = {
        "audience": "api.atlassian.com",
        "client_id": client_id,
        "scope": ATLASSIAN_SCOPE_PARAM,
        "redirect_uri": redirect,
        "state": make_oauth_state(uid),
        "response_type": "code",
        "prompt": "consent",
    }
    url = f"{ATLASSIAN_AUTH_URL}?{urlencode(params)}"
    logger.info(
        "Atlassian OAuth authorize URL built (client_id_prefix=%s, redirect_uri=%s)",
        client_id[:6],
        redirect,
    )
    return url


def exchange_code_for_tokens(code: str) -> dict[str, Any]:
    resp = requests.post(
        ATLASSIAN_TOKEN_URL,
        json={
            "grant_type": "authorization_code",
            "client_id": _client_id(),
            "client_secret": _client_secret(),
            "code": code,
            "redirect_uri": redirect_uri(),
        },
        headers={"Content-Type": "application/json"},
        timeout=20,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"Token exchange failed ({resp.status_code}).")
    return resp.json()


def refresh_access_token(refresh_token: str) -> dict[str, Any]:
    resp = requests.post(
        ATLASSIAN_TOKEN_URL,
        json={
            "grant_type": "refresh_token",
            "client_id": _client_id(),
            "client_secret": _client_secret(),
            "refresh_token": refresh_token,
        },
        headers={"Content-Type": "application/json"},
        timeout=20,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"Token refresh failed ({resp.status_code}).")
    return resp.json()


def fetch_accessible_resources(access_token: str) -> list[dict[str, Any]]:
    resp = requests.get(
        ATLASSIAN_RESOURCES_URL,
        headers={
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json",
        },
        timeout=15,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"accessible-resources failed ({resp.status_code}).")
    data = resp.json()
    return data if isinstance(data, list) else []


def ensure_fresh_access_token(record: JiraOAuthRecord) -> str:
    """Return a valid access token, refreshing when near expiry."""
    if record.access_token and record.expires_at > time.time() + 60:
        return record.access_token
    if not record.refresh_token:
        raise RuntimeError("Jira OAuth refresh token missing.")
    tokens = refresh_access_token(record.refresh_token)
    record.access_token = str(tokens.get("access_token") or "")
    if tokens.get("refresh_token"):
        record.refresh_token = str(tokens["refresh_token"])
    expires_in = int(tokens.get("expires_in") or 3600)
    record.expires_at = time.time() + expires_in
    save_record(record)
    return record.access_token


def apply_tokens_to_record(
    record: JiraOAuthRecord,
    tokens: dict[str, Any],
    *,
    pick_cloud_id: str | None = None,
) -> JiraOAuthRecord:
    record.access_token = str(tokens.get("access_token") or "")
    record.refresh_token = str(tokens.get("refresh_token") or record.refresh_token)
    expires_in = int(tokens.get("expires_in") or 3600)
    record.expires_at = time.time() + expires_in
    record.connected = bool(record.access_token and record.refresh_token)

    resources = fetch_accessible_resources(record.access_token)
    if not resources:
        record.access_token = ""
        record.refresh_token = ""
        record.connected = False
        save_record(record)
        raise JiraOAuthSetupError(CODE_NO_SITES)

    chosen = None
    if pick_cloud_id:
        chosen = next((r for r in resources if r.get("id") == pick_cloud_id), None)
    if not chosen:
        chosen = resources[0]

    record.cloud_id = str(chosen.get("id") or "") or None
    record.site_name = chosen.get("name")
    record.site_url = (chosen.get("url") or "").rstrip("/") or None
    save_record(record)
    return record
