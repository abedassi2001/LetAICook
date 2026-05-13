"""
Evening reminder: read open tasks from Firestore and show a Windows message box.

Path: projects/{teamId}/tasks/{taskId} (see task-model.ts).
Requires a Firebase service account with Firestore access (never commit the JSON).

Typical scheduling: Windows Task Scheduler, daily at 18:00, action:
  python scripts/evening_task_reminder.py
with working directory = repo root and environment variables set (or --env-file).
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path


DONE_STATUS = "done"


def _load_env_file(path: Path) -> None:
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def _updated_at_millis(data: dict) -> int:
    v = data.get("updatedAt")
    if v is None:
        return 0
    if hasattr(v, "timestamp") and callable(v.timestamp):
        try:
            return int(v.timestamp() * 1000)
        except (OSError, ValueError, OverflowError):
            return 0
    seconds = getattr(v, "seconds", None)
    if seconds is not None:
        ns = int(getattr(v, "nanoseconds", 0) or 0)
        return int(seconds) * 1000 + ns // 1_000_000
    return 0


def _is_open_task(data: dict) -> bool:
    return (data.get("status") or "") != DONE_STATUS


def _show_message(title: str, body: str) -> None:
    if sys.platform == "win32":
        import ctypes

        ctypes.windll.user32.MessageBoxW(None, body, title, 0x40)
    else:
        print(f"{title}\n{body}", file=sys.stderr)


def _fetch_tasks(
    *,
    team_id: str,
    assignee_uid: str | None,
    all_open: bool,
) -> list[tuple[str, dict]]:
    if not all_open and not assignee_uid:
        raise ValueError(
            "Set TASK_REMINDER_UID to your Firebase Auth uid, or set "
            "TASK_REMINDER_ALL_OPEN_TASKS=1 for team-wide open tasks (trusted machine only)."
        )

    import firebase_admin
    from firebase_admin import credentials, firestore

    try:
        firebase_admin.get_app()
    except ValueError:
        cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "").strip()
        if cred_path and Path(cred_path).is_file():
            firebase_admin.initialize_app(credentials.Certificate(cred_path))
        else:
            firebase_admin.initialize_app()

    db = firestore.client()
    tasks_ref = db.collection("projects").document(team_id).collection("tasks")

    if all_open:
        snap = (
            tasks_ref.order_by("updatedAt", direction=firestore.Query.DESCENDING)
            .limit(50)
            .stream()
        )
        rows: list[tuple[str, dict]] = []
        for doc in snap:
            d = doc.to_dict() or {}
            if _is_open_task(d):
                rows.append((doc.id, d))
            if len(rows) >= 5:
                break
        return rows

    snap = tasks_ref.where("assigneeUid", "==", assignee_uid).stream()
    candidates: list[tuple[str, dict, int]] = []
    for doc in snap:
        d = doc.to_dict() or {}
        if not _is_open_task(d):
            continue
        candidates.append((doc.id, d, _updated_at_millis(d)))
    candidates.sort(key=lambda x: x[2], reverse=True)
    return [(doc_id, d) for doc_id, d, _ in candidates[:5]]


def main() -> int:
    repo_root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(
        description="Show last open tasks from Firestore (Windows popup)."
    )
    parser.add_argument(
        "--env-file",
        type=Path,
        default=None,
        help="Optional dotenv-style file (default: scripts/.env.task-reminder if it exists).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print task lines to stdout instead of opening a GUI dialog.",
    )
    args = parser.parse_args()

    env_path = args.env_file
    if env_path is None:
        default_env = repo_root / "scripts" / ".env.task-reminder"
        if default_env.is_file():
            env_path = default_env
    if env_path is not None:
        _load_env_file(env_path)

    team_id = os.environ.get("TASK_REMINDER_TEAM_ID", "demo-project").strip()
    assignee_uid = os.environ.get("TASK_REMINDER_UID", "").strip() or None
    all_open = os.environ.get("TASK_REMINDER_ALL_OPEN_TASKS", "").strip().lower() in (
        "1",
        "true",
        "yes",
    )

    try:
        tasks = _fetch_tasks(
            team_id=team_id,
            assignee_uid=assignee_uid,
            all_open=all_open,
        )
    except Exception as e:  # noqa: BLE001 — surface any Firestore/config error to the user
        msg = f"Could not load tasks.\n\n{e!s}"
        if args.dry_run:
            print(msg, file=sys.stderr)
        else:
            _show_message("letAIcook — task reminder", msg)
        return 1

    if not tasks:
        if all_open:
            body = f"No open tasks found for team `{team_id}`."
        else:
            body = (
                "You have no open assigned tasks in Firestore for this team.\n\n"
                f"Team: {team_id}"
            )
        title = "letAIcook — task reminder"
        if args.dry_run:
            print(f"{title}\n{body}")
        else:
            _show_message(title, body)
        return 0

    lines = []
    for _doc_id, data in tasks:
        title_task = (data.get("title") or "(no title)").strip()
        st = (data.get("status") or "?").strip()
        pri = (data.get("priority") or "").strip()
        jira = (data.get("jiraIssueKey") or "").strip()
        meta = f"{st}, {pri}" if pri else st
        line = f"- {title_task} [{meta}]"
        if jira:
            line += f" ({jira})"
        lines.append(line)

    body = f"Open tasks (up to 5), newest activity first — team `{team_id}`:\n\n" + "\n".join(
        lines
    )
    title = "letAIcook — evening tasks"

    if args.dry_run:
        print(f"{title}\n{body}")
    else:
        _show_message(title, body)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
