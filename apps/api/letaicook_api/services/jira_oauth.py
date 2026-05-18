"""Atlassian OAuth 2.0 (3LO) helpers."""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
import time
from typing import Any
from urllib.parse import urlencode

import requests

from letaicook_api.services.jira_oauth_store import JiraOAuthRecord, load_record, save_record

ATLASSIAN_AUTH_URL = "https://auth.atlassian.com/authorize"
ATLASSIAN_TOKEN_URL = "https://auth.atlassian.com/oauth/token"
ATLASSIAN_RESOURCES_URL = "https://api.atlassian.com/oauth/token/accessible-resources"

DEFAULT_SCOPES = (
    "read:jira-work write:jira-work read:jira-user offline_access"
)


def _client_id() -> str:
    value = os.getenv("ATLASSIAN_CLIENT_ID", "").strip()
    if not value:
        raise ValueError("ATLASSIAN_CLIENT_ID is not set.")
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
    params = {
        "audience": "api.atlassian.com",
        "client_id": _client_id(),
        "scope": DEFAULT_SCOPES,
        "redirect_uri": redirect_uri(),
        "state": make_oauth_state(uid),
        "response_type": "code",
        "prompt": "consent",
    }
    return f"{ATLASSIAN_AUTH_URL}?{urlencode(params)}"


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
        save_record(record)
        return record

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
