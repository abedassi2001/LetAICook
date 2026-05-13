"""
Unit tests for scripts/evening_task_reminder.py (unittest.TestCase; pytest-compatible).

Requires: pip install -r scripts/requirements-task-reminder.txt
Run from repo root:
  python -m unittest discover -s scripts/tests -p "test_*.py" -v
  pytest scripts/tests -v
"""

from __future__ import annotations

import io
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

# Resolve scripts/ so `import evening_task_reminder` works without installing a package.
_SCRIPTS = Path(__file__).resolve().parents[1]
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

import evening_task_reminder as etr  # noqa: E402


class _SecondsTs:
    __slots__ = ("seconds", "nanoseconds")

    def __init__(self, seconds: int, nanoseconds: int = 0) -> None:
        self.seconds = seconds
        self.nanoseconds = nanoseconds


class _DatetimeLike:
    def timestamp(self) -> float:
        return 1_700_000_000.0


class TestHelpers(unittest.TestCase):
    def test_is_open_task(self) -> None:
        self.assertFalse(etr._is_open_task({"status": "done"}))
        self.assertTrue(etr._is_open_task({"status": "todo"}))
        self.assertTrue(etr._is_open_task({}))

    def test_updated_at_millis_seconds(self) -> None:
        ms = etr._updated_at_millis({"updatedAt": _SecondsTs(10, 500_000_000)})
        self.assertEqual(ms, 10_500)

    def test_updated_at_millis_datetime_like(self) -> None:
        ms = etr._updated_at_millis({"updatedAt": _DatetimeLike()})
        self.assertEqual(ms, 1_700_000_000_000)

    def test_updated_at_millis_missing(self) -> None:
        self.assertEqual(etr._updated_at_millis({}), 0)

    def test_load_env_file(self) -> None:
        fd, name = tempfile.mkstemp(suffix=".env", text=True)
        os.close(fd)
        p = Path(name)
        try:
            p.write_text(
                "LETAI_LOAD_TEST_A=from-file\n# c\n"
                "LETAI_LOAD_TEST_B=from-file-should-not-win\n",
                encoding="utf-8",
            )
            with patch.dict(
                os.environ,
                {"LETAI_LOAD_TEST_B": "keep"},
                clear=False,
            ):
                etr._load_env_file(p)
                self.assertEqual(os.environ.get("LETAI_LOAD_TEST_A"), "from-file")
                self.assertEqual(os.environ.get("LETAI_LOAD_TEST_B"), "keep")
        finally:
            p.unlink(missing_ok=True)


class TestFetchTasks(unittest.TestCase):
    def _firestore_chain(self) -> tuple[MagicMock, MagicMock]:
        """db.collection('projects').document(team).collection('tasks') -> tasks_ref."""
        mock_db = MagicMock()
        proj_col = MagicMock()
        team_doc = MagicMock()
        tasks_ref = MagicMock()
        mock_db.collection.return_value = proj_col
        proj_col.document.return_value = team_doc
        team_doc.collection.return_value = tasks_ref
        return mock_db, tasks_ref

    @patch("firebase_admin.initialize_app")
    @patch("firebase_admin.get_app", side_effect=ValueError("no default app"))
    @patch("firebase_admin.firestore.client")
    def test_fetch_assignee_sorts_and_caps_at_five(
        self, mock_fs_client: MagicMock, _mock_get_app: MagicMock, _mock_init: MagicMock
    ) -> None:
        mock_db, tasks_ref = self._firestore_chain()
        mock_fs_client.return_value = mock_db

        def make_doc(doc_id: str, updated_seconds: int, status: str) -> MagicMock:
            d = MagicMock()
            d.id = doc_id
            d.to_dict.return_value = {
                "title": doc_id,
                "status": status,
                "assigneeUid": "user-1",
                "updatedAt": _SecondsTs(updated_seconds),
            }
            return d

        stream_docs = [
            make_doc("old-open", 1, "todo"),
            make_doc("done-1", 99, "done"),
            make_doc("new-open", 50, "in_progress"),
            make_doc("mid-open", 10, "todo"),
            make_doc("sixth", 60, "todo"),
            make_doc("seventh", 70, "todo"),
        ]
        tasks_ref.where.return_value.stream.return_value = stream_docs

        out = etr._fetch_tasks(
            team_id="demo-project",
            assignee_uid="user-1",
            all_open=False,
        )
        self.assertEqual(len(out), 5)
        titles = [d["title"] for _, d in out]
        self.assertEqual(
            titles,
            ["seventh", "sixth", "new-open", "mid-open", "old-open"],
        )
        tasks_ref.where.assert_called_once_with("assigneeUid", "==", "user-1")

    @patch("firebase_admin.initialize_app")
    @patch("firebase_admin.get_app", side_effect=ValueError("no default app"))
    @patch("firebase_admin.firestore.client")
    def test_fetch_all_open_skips_done_respects_order(
        self,
        mock_fs_client: MagicMock,
        _mock_get_app: MagicMock,
        _mock_init: MagicMock,
    ) -> None:
        mock_db, tasks_ref = self._firestore_chain()
        mock_fs_client.return_value = mock_db

        def make_doc(doc_id: str, status: str) -> MagicMock:
            d = MagicMock()
            d.id = doc_id
            d.to_dict.return_value = {"title": doc_id, "status": status}
            return d

        ordered = [
            make_doc("a", "done"),
            make_doc("b", "todo"),
            make_doc("c", "done"),
            make_doc("d", "review"),
        ]
        q = MagicMock()
        q.limit.return_value.stream.return_value = ordered
        tasks_ref.order_by.return_value = q

        out = etr._fetch_tasks(
            team_id="demo-project",
            assignee_uid=None,
            all_open=True,
        )
        self.assertEqual([(i, d["title"]) for i, d in out], [("b", "b"), ("d", "d")])

    def test_fetch_requires_uid_when_not_all_open(self) -> None:
        with self.assertRaises(ValueError) as ctx:
            etr._fetch_tasks(
                team_id="demo-project",
                assignee_uid=None,
                all_open=False,
            )
        self.assertIn("TASK_REMINDER_UID", str(ctx.exception))


class TestMain(unittest.TestCase):
    @patch.object(etr, "_fetch_tasks")
    def test_main_dry_run_prints_tasks(self, mock_fetch: MagicMock) -> None:
        mock_fetch.return_value = [
            (
                "id1",
                {
                    "title": "Ship feature",
                    "status": "todo",
                    "priority": "high",
                    "jiraIssueKey": "PROJ-1",
                },
            ),
        ]
        out = io.StringIO()
        with patch.object(sys, "argv", ["evening_task_reminder.py", "--dry-run"]):
            with patch.dict(
                os.environ,
                {
                    "TASK_REMINDER_UID": "u1",
                    "TASK_REMINDER_TEAM_ID": "demo-project",
                    "TASK_REMINDER_ALL_OPEN_TASKS": "",
                },
                clear=False,
            ):
                with patch.object(sys, "stdout", out):
                    code = etr.main()
        self.assertEqual(code, 0)
        text = out.getvalue()
        self.assertIn("evening tasks", text)
        self.assertIn("Ship feature", text)
        self.assertIn("PROJ-1", text)
        self.assertIn("demo-project", text)

    @patch.object(etr, "_fetch_tasks", return_value=[])
    def test_main_dry_run_empty_assignee(self, _mock: MagicMock) -> None:
        out = io.StringIO()
        with patch.object(sys, "argv", ["evening_task_reminder.py", "--dry-run"]):
            with patch.dict(
                os.environ,
                {"TASK_REMINDER_UID": "u1", "TASK_REMINDER_ALL_OPEN_TASKS": ""},
                clear=False,
            ):
                with patch.object(sys, "stdout", out):
                    code = etr.main()
        self.assertEqual(code, 0)
        self.assertIn("no open assigned tasks", out.getvalue())

    @patch.object(etr, "_fetch_tasks", side_effect=RuntimeError("network down"))
    def test_main_dry_run_error_to_stderr(self, _mock: MagicMock) -> None:
        err = io.StringIO()
        with patch.object(sys, "argv", ["evening_task_reminder.py", "--dry-run"]):
            with patch.dict(
                os.environ,
                {"TASK_REMINDER_UID": "u1", "TASK_REMINDER_ALL_OPEN_TASKS": ""},
                clear=False,
            ):
                with patch.object(sys, "stderr", err):
                    code = etr.main()
        self.assertEqual(code, 1)
        self.assertIn("network down", err.getvalue())
