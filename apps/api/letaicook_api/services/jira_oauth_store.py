"""Server-side persistence for Atlassian OAuth tokens (per Firebase uid)."""

from __future__ import annotations

import json
import os
import re
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

_UID_SAFE = re.compile(r"^[\w-]+$")


@dataclass
class JiraOAuthRecord:
    uid: str
    connected: bool = False
    atlassian_account_id: str | None = None
    access_token: str = ""
    refresh_token: str = ""
    expires_at: float = 0.0
    cloud_id: str | None = None
    site_name: str | None = None
    site_url: str | None = None
    project_id: str | None = None
    project_key: str | None = None
    project_name: str | None = None

    def public_dict(self) -> dict[str, Any]:
        return {
            "connected": self.connected,
            "atlassian_account_id": self.atlassian_account_id,
            "cloud_id": self.cloud_id,
            "site_name": self.site_name,
            "site_url": self.site_url,
            "project_id": self.project_id,
            "project_key": self.project_key,
            "project_name": self.project_name,
            "has_manual_fallback": False,
        }


def _data_dir() -> Path:
    raw = os.getenv("JIRA_OAUTH_DATA_DIR", ".jira_oauth_data").strip()
    path = Path(raw)
    path.mkdir(parents=True, exist_ok=True)
    return path


def _path_for_uid(uid: str) -> Path:
    if not _UID_SAFE.match(uid):
        raise ValueError("Invalid uid for storage path.")
    return _data_dir() / f"{uid}.json"


def load_record(uid: str) -> JiraOAuthRecord | None:
    path = _path_for_uid(uid)
    if not path.is_file():
        return None
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return JiraOAuthRecord(
        uid=uid,
        connected=bool(raw.get("connected")),
        atlassian_account_id=raw.get("atlassian_account_id"),
        access_token=str(raw.get("access_token") or ""),
        refresh_token=str(raw.get("refresh_token") or ""),
        expires_at=float(raw.get("expires_at") or 0),
        cloud_id=raw.get("cloud_id"),
        site_name=raw.get("site_name"),
        site_url=raw.get("site_url"),
        project_id=raw.get("project_id"),
        project_key=raw.get("project_key"),
        project_name=raw.get("project_name"),
    )


def save_record(record: JiraOAuthRecord) -> None:
    path = _path_for_uid(record.uid)
    payload = asdict(record)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def delete_record(uid: str) -> None:
    path = _path_for_uid(uid)
    if path.is_file():
        path.unlink()
