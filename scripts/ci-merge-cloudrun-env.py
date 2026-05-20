#!/usr/bin/env python3
"""Merge Cloud Run env vars and apply with --env-vars-file.

gcloud --update-env-vars cannot safely pass CORS_ORIGINS (commas + https:// colons).
This script reads existing env from the service, applies overrides from the
environment, writes a quoted YAML file, and runs gcloud run services update.

CI / bash example:
  export GOOGLE_API_KEY="..."
  export CORS_ORIGINS="https://web.run.app,http://localhost:3000"
  python3 scripts/ci-merge-cloudrun-env.py letaicook-api us-central1
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile


def _yaml_quote(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def _gcloud_executable() -> str:
    override = os.environ.get("GCLOUD_BIN", "").strip()
    if override:
        if override.lower().endswith(".ps1"):
            cmd = f"{override[:-4]}.cmd"
            if os.path.isfile(cmd):
                return cmd
        return override
    for name in ("gcloud.cmd", "gcloud"):
        found = shutil.which(name)
        if found:
            return found
    return "gcloud.cmd" if os.name == "nt" else "gcloud"


def _gcloud_base(project: str) -> list[str]:
    cmd = [_gcloud_executable()]
    if project:
        cmd.extend(["--project", project])
    return cmd


def _describe_env(service: str, region: str, project: str) -> dict[str, str]:
    cmd = [
        *_gcloud_base(project),
        "run",
        "services",
        "describe",
        service,
        "--region",
        region,
        "--format=json",
    ]
    raw = subprocess.check_output(cmd, text=True)
    data = json.loads(raw)
    containers = (
        data.get("spec", {})
        .get("template", {})
        .get("spec", {})
        .get("containers", [])
    )
    if not containers:
        return {}
    merged: dict[str, str] = {}
    for item in containers[0].get("env", []):
        name = item.get("name")
        if name and "value" in item:
            merged[name] = str(item["value"])
    return merged


def _overrides_from_env() -> dict[str, str]:
    keys = (
        "GOOGLE_API_KEY",
        "CORS_ORIGINS",
        "FIREBASE_PROJECT_ID",
        "ATLASSIAN_CLIENT_ID",
        "ATLASSIAN_CLIENT_SECRET",
        "ATLASSIAN_REDIRECT_URI",
        "FRONTEND_BASE_URL",
        "OAUTH_STATE_SECRET",
    )
    out: dict[str, str] = {}
    for key in keys:
        val = os.environ.get(key, "").strip()
        if val:
            out[key] = val
    return out


def _write_env_file(path: str, env: dict[str, str]) -> None:
    lines = [f'{k}: "{_yaml_quote(v)}"' for k, v in sorted(env.items())]
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))
        fh.write("\n")


def main() -> int:
    args = [a for a in sys.argv[1:] if a != "--dry-run"]
    dry_run = "--dry-run" in sys.argv

    if len(args) < 2:
        print(
            "Usage: ci-merge-cloudrun-env.py SERVICE REGION [PROJECT_ID] [--dry-run]",
            file=sys.stderr,
        )
        return 2

    service = args[0]
    region = args[1]
    project = args[2] if len(args) > 2 else os.environ.get("GCP_PROJECT_ID", "")

    overrides = _overrides_from_env()
    if not overrides:
        print("ERROR: set at least one env override (e.g. CORS_ORIGINS).", file=sys.stderr)
        return 1

    merged = _describe_env(service, region, project)
    merged.update(overrides)

    fd, path = tempfile.mkstemp(suffix=".yaml", prefix="cloudrun-env-")
    os.close(fd)
    try:
        _write_env_file(path, merged)
        if dry_run:
            with open(path, encoding="utf-8") as fh:
                print(fh.read(), end="")
            return 0
        cmd = [
            *_gcloud_base(project),
            "run",
            "services",
            "update",
            service,
            "--region",
            region,
            "--env-vars-file",
            path,
        ]
        subprocess.check_call(cmd)
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
