"""Planning summary endpoint without AI configured (no secrets in CI)."""

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_chat_plan_summary_returns_503_without_api_key(monkeypatch):
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    r = client.post(
        "/chat/plan/summary",
        json={
            "messages": [
                {"role": "user", "content": "Build a parking app"},
                {"role": "assistant", "content": "Scope includes occupancy and payments."},
            ]
        },
    )
    assert r.status_code == 503
    assert "AI is not configured" in r.json()["detail"]
