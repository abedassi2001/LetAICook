"""Resolved Jira API session (OAuth bearer or basic auth)."""

from __future__ import annotations

import os
from dataclasses import dataclass

import requests
from fastapi import Depends, Header, HTTPException
from requests.auth import HTTPBasicAuth

from letaicook_api.deps.auth import optional_firebase_uid
from letaicook_api.services.jira_oauth import ensure_fresh_access_token
from letaicook_api.services.jira_oauth_store import JiraOAuthRecord, load_record

_HEADERS = {
    "Accept": "application/json",
    "Content-Type": "application/json",
}


@dataclass
class JiraSession:
    base_url: str
    auth: HTTPBasicAuth | None
    bearer_token: str | None
    default_project: str | None
    browse_base: str

    def headers(self) -> dict[str, str]:
        out = dict(_HEADERS)
        if self.bearer_token:
            out["Authorization"] = f"Bearer {self.bearer_token}"
        return out

    def get(self, path: str, **kwargs: object) -> requests.Response:
        return requests.get(
            f"{self.base_url}{path}",
            headers=self.headers(),
            auth=self.auth,
            timeout=kwargs.pop("timeout", 15),  # type: ignore[arg-type]
            **kwargs,  # type: ignore[arg-type]
        )

    def post(self, path: str, **kwargs: object) -> requests.Response:
        return requests.post(
            f"{self.base_url}{path}",
            headers=self.headers(),
            auth=self.auth,
            timeout=kwargs.pop("timeout", 15),  # type: ignore[arg-type]
            **kwargs,  # type: ignore[arg-type]
        )

    def put(self, path: str, **kwargs: object) -> requests.Response:
        return requests.put(
            f"{self.base_url}{path}",
            headers=self.headers(),
            auth=self.auth,
            timeout=kwargs.pop("timeout", 15),  # type: ignore[arg-type]
            **kwargs,  # type: ignore[arg-type]
        )

    def delete(self, path: str, **kwargs: object) -> requests.Response:
        return requests.delete(
            f"{self.base_url}{path}",
            headers=self.headers(),
            auth=self.auth,
            timeout=kwargs.pop("timeout", 15),  # type: ignore[arg-type]
            **kwargs,  # type: ignore[arg-type]
        )

    def issue_browse_url(self, issue_key: str) -> str:
        return f"{self.browse_base}/browse/{issue_key}"


def _env_jira_defaults() -> tuple[str | None, str | None, str | None, str | None]:
    return (
        os.getenv("JIRA_DOMAIN"),
        os.getenv("JIRA_EMAIL"),
        os.getenv("JIRA_API_TOKEN"),
        os.getenv("JIRA_DEFAULT_PROJECT_KEY"),
    )


def _session_from_oauth(record: JiraOAuthRecord) -> JiraSession:
    if not record.connected or not record.cloud_id:
        raise HTTPException(
            status_code=503,
            detail="Jira OAuth is not fully connected. Complete setup in Settings.",
        )
    access = ensure_fresh_access_token(record)
    cloud_id = record.cloud_id
    browse = (record.site_url or "").rstrip("/") or f"https://api.atlassian.com/ex/jira/{cloud_id}"
    return JiraSession(
        base_url=f"https://api.atlassian.com/ex/jira/{cloud_id}",
        auth=None,
        bearer_token=access,
        default_project=record.project_key,
        browse_base=browse,
    )


def _session_from_basic(domain: str, email: str, token: str, project: str | None) -> JiraSession:
    base_url = f"https://{domain}" if not domain.startswith("http") else domain.rstrip("/")
    return JiraSession(
        base_url=base_url,
        auth=HTTPBasicAuth(email, token),
        bearer_token=None,
        default_project=project,
        browse_base=base_url,
    )


def resolve_jira_session(
    authorization: str | None = Header(None),
    x_jira_domain: str | None = Header(None, alias="X-Jira-Domain"),
    x_jira_email: str | None = Header(None, alias="X-Jira-Email"),
    x_jira_api_token: str | None = Header(None, alias="X-Jira-Token"),
    x_jira_project: str | None = Header(None, alias="X-Jira-Project"),
) -> JiraSession:
    """OAuth (Bearer) when connected; otherwise manual headers or server env."""
    uid = optional_firebase_uid(authorization)
    if uid:
        record = load_record(uid)
        if record and record.connected and record.access_token:
            try:
                return _session_from_oauth(record)
            except RuntimeError as exc:
                raise HTTPException(status_code=502, detail=str(exc)) from exc

    domain = x_jira_domain or _env_jira_defaults()[0]
    email = x_jira_email or _env_jira_defaults()[1]
    token = x_jira_api_token or _env_jira_defaults()[2]
    project = x_jira_project or _env_jira_defaults()[3]

    if domain and email and token:
        return _session_from_basic(domain.strip(), email.strip(), token.strip(), project)

    raise HTTPException(
        status_code=503,
        detail=(
            "Jira is not configured. Connect Jira in Settings (OAuth) or provide "
            "X-Jira-Domain, X-Jira-Email, and X-Jira-Token headers."
        ),
    )
