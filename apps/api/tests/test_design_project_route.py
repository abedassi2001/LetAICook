"""POST /design-project with mocked Gemini."""

import json
from unittest.mock import patch

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)

_MINIMAL_DESIGN = {
    "project_name": "Test",
    "description": "d",
    "pages": [],
    "backend_services": [],
    "database_schema": [],
    "api_routes": [],
    "use_cases": [],
    "relationships": [],
    "diagrams": {
        "architecture": "",
        "sequence": "",
        "erd": "",
        "class": "",
        "user_flow": "",
    },
    "tasks": [],
    "wireframe_suggestions": [],
    "react_flow_nodes": [],
    "react_flow_edges": [],
}


def test_design_project_returns_validated_json(monkeypatch):
    monkeypatch.setenv("GOOGLE_API_KEY", "mock")
    payload = json.dumps(_MINIMAL_DESIGN)
    with patch("design_routes.generate_content_with_fallback", return_value=payload):
        r = client.post(
            "/design-project",
            json={"description": "Build a task app"},
        )
    assert r.status_code == 200
    body = r.json()
    assert body["project_name"] == "Test"
    assert body["diagrams"]["architecture"] == ""


def test_design_project_503_when_not_configured(monkeypatch):
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    r = client.post("/design-project", json={"description": "Anything"})
    assert r.status_code == 503
