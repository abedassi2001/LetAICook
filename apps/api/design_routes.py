"""AI System Designer — structured Gemini JSON for architecture, diagrams, APIs, tasks."""

from __future__ import annotations

import json
from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from gemini_shared import (
    GeminiNotConfiguredError,
    generate_content_with_fallback,
    google_api_key,
    plan_model_candidates,
)
from google.api_core.exceptions import GoogleAPIError
from pydantic import BaseModel, ConfigDict, Field, model_validator

router = APIRouter()

DESIGN_JSON_INSTRUCTIONS = """
You are a principal engineer and product designer. The product uses:
- Frontend: React + Tailwind (Next.js App Router)
- Backend: FastAPI
- Database: Firebase Firestore
- Diagrams: Mermaid syntax only inside diagrams.* string fields

Return ONLY a single JSON object (no markdown code fences). Use "" or [] where a section is not applicable.

Keys:
- project_name: string
- description: string (1–3 sentences)
- pages: array of { "name": string, "path": optional string, "purpose": optional string, "components": string[] }
- backend_services: array of { "name": string, "technology": string, "description": optional string }
- database_schema: array of { "table": string, "fields": string[] } (logical entities / collections)
- api_routes: array of { "method": string, "route": string, "description": optional string }
- use_cases: array of { "id": string, "actor": string, "goal": string, "steps": string[] }
- relationships: array of { "from": string, "to": string, "label": string or null } (system/layer links)
- diagrams: object with ONLY these string keys (Mermaid; may be ""):
  - "architecture": flowchart or graph LR — clients, Next.js, FastAPI, Firestore, externals
  - "sequence": sequenceDiagram — primary user journey
  - "erd": erDiagram — core entities
  - "class": classDiagram — main modules/domain
  - "user_flow": flowchart — onboarding or core UX
- tasks: array of { "title": string, "description": string, "estimate_points": number or null }
- wireframe_suggestions: string[]
- react_flow_nodes: array of { "id": string, "position": { "x": number, "y": number }, "data": { "label": string } } (optional; may be [] if relationships define the graph)
- react_flow_edges: array of { "id": string, "source": string, "target": string, "label": string or null }

Use valid Mermaid. Keep labels short. Prefer meaningful relationships and concise diagrams over huge node lists.
"""


class ChatCtxMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., max_length=12000)


class DesignProjectRequest(BaseModel):
    description: str = Field(..., min_length=3, max_length=20000)
    context_messages: list[ChatCtxMessage] | None = Field(
        default=None,
        max_length=30,
        description="Optional planning-chat history for richer context.",
    )
    previous_design: dict[str, Any] | None = None
    regenerate_focus: str | None = Field(
        default=None,
        description='If set (e.g. "architecture"), merge with previous_design and mainly refresh diagrams / graph.',
    )


class DesignProjectResponse(BaseModel):
    """Validated shape returned to the client (stored in Firestore). Supports legacy flat diagram keys via validator."""

    model_config = ConfigDict(extra="ignore")

    project_name: str = ""
    description: str = ""
    pages: list[dict[str, Any]] = Field(default_factory=list)
    backend_services: list[dict[str, Any]] = Field(default_factory=list)
    database_schema: list[dict[str, Any]] = Field(default_factory=list)
    api_routes: list[dict[str, Any]] = Field(default_factory=list)
    use_cases: list[dict[str, Any]] = Field(default_factory=list)
    relationships: list[dict[str, Any]] = Field(default_factory=list)
    diagrams: dict[str, Any] = Field(default_factory=dict)
    tasks: list[dict[str, Any]] = Field(default_factory=list)
    wireframe_suggestions: list[str] = Field(default_factory=list)
    react_flow_nodes: list[dict[str, Any]] = Field(default_factory=list)
    react_flow_edges: list[dict[str, Any]] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def _merge_legacy_diagram_keys(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        merged = dict(data)
        diagrams: dict[str, Any] = {}
        raw_diag = merged.get("diagrams")
        if isinstance(raw_diag, dict):
            diagrams = {str(k): v for k, v in raw_diag.items()}

        def lift(key: str, legacy: str) -> None:
            if not diagrams.get(key) and merged.get(legacy):
                diagrams[key] = merged[legacy]

        lift("architecture", "architecture_diagram")
        lift("sequence", "sequence_diagram")
        lift("erd", "erd_diagram")
        lift("class", "class_diagram")
        lift("user_flow", "user_flow_diagram")
        merged["diagrams"] = diagrams
        return merged


def _build_user_content(body: DesignProjectRequest) -> str:
    parts: list[str] = [f"Project description:\n{body.description.strip()}"]
    if body.context_messages:
        ctx = "\n".join(
            f"{m.role.upper()}: {m.content}" for m in body.context_messages[-12:]
        )
        parts.append(f"Additional context from planning conversation:\n{ctx}")
    if body.regenerate_focus and body.previous_design:
        parts.append(
            "Previous design JSON (update only what regenerate_focus implies; keep the rest identical):\n"
            + json.dumps(body.previous_design, ensure_ascii=False)[:24000]
        )
        parts.append(
            f'Focus for this run: "{body.regenerate_focus}". '
            "Refresh diagrams.architecture, diagrams.sequence, relationships, react_flow_nodes, "
            "and react_flow_edges as needed; keep project_name, pages, api_routes, database_schema "
            "unless they must change for consistency."
        )
    return "\n\n".join(parts)


def _gemini_detail_prefix(err: GoogleAPIError, tried: list[str]) -> str:
    return (
        f"Upstream AI error: {err!s}. Tried: {', '.join(tried)}. "
        "Try GEMINI_MODEL / GEMINI_MODEL_FALLBACKS in apps/api/.env.local, "
        "enable billing for your Google Cloud project, or create a new API key — "
        "see https://ai.google.dev/gemini-api/docs/rate-limits"
    )


@router.post("/design-project", response_model=DesignProjectResponse)
def design_project(body: DesignProjectRequest):
    """Structured system design JSON via Gemini (same API key as /chat/plan)."""
    user_content = _build_user_content(body)
    system = DESIGN_JSON_INSTRUCTIONS
    if body.regenerate_focus:
        system += (
            "\nThe user asked for a partial regeneration. Preserve unchanged fields from previous_design."
        )

    candidates = plan_model_candidates()
    try:
        raw_text = generate_content_with_fallback(
            system_instruction=system,
            user_content=user_content,
            temperature=0.35,
            response_mime_type="application/json",
        )
    except GeminiNotConfiguredError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except GoogleAPIError as e:
        raise HTTPException(
            status_code=502,
            detail=_gemini_detail_prefix(e, candidates),
        ) from e

    try:
        data = json.loads(raw_text)
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=502,
            detail=f"Model returned invalid JSON: {e!s}",
        ) from e

    try:
        return DesignProjectResponse.model_validate(data)
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"JSON did not match schema: {e!s}",
        ) from e


class DesignExtrasRequest(BaseModel):
    design: dict[str, Any]


@router.post("/design-project/jira-tasks")
def design_jira_tasks(body: DesignExtrasRequest):
    """Generate Jira-style markdown from an existing design (Gemini)."""
    if not google_api_key():
        raise HTTPException(
            status_code=503,
            detail="AI is not configured: set GOOGLE_API_KEY (or GEMINI_API_KEY) on the API.",
        )
    compact = json.dumps(body.design, ensure_ascii=False)[:12000]
    user_content = f"From this system design JSON:\n{compact}"
    system = (
        "Output markdown only: a Jira-ready backlog with epics, stories, and acceptance criteria. "
        "Use ### headings."
    )
    candidates = plan_model_candidates()
    try:
        text = generate_content_with_fallback(
            system_instruction=system,
            user_content=user_content,
            temperature=0.4,
            response_mime_type=None,
        )
    except GeminiNotConfiguredError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except GoogleAPIError as e:
        raise HTTPException(
            status_code=502,
            detail=_gemini_detail_prefix(e, candidates),
        ) from e
    return {"markdown": text}


@router.post("/design-project/pitch")
def design_pitch(body: DesignExtrasRequest):
    """Short startup-style pitch from design (Gemini)."""
    if not google_api_key():
        raise HTTPException(
            status_code=503,
            detail="AI is not configured: set GOOGLE_API_KEY (or GEMINI_API_KEY) on the API.",
        )
    compact = json.dumps(body.design, ensure_ascii=False)[:12000]
    user_content = f"Product/system design:\n{compact}"
    system = (
        "Write a concise startup pitch: problem, solution, market, traction hooks, team ask. "
        "Markdown, bold key phrases."
    )
    candidates = plan_model_candidates()
    try:
        text = generate_content_with_fallback(
            system_instruction=system,
            user_content=user_content,
            temperature=0.5,
            response_mime_type=None,
        )
    except GeminiNotConfiguredError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except GoogleAPIError as e:
        raise HTTPException(
            status_code=502,
            detail=_gemini_detail_prefix(e, candidates),
        ) from e
    return {"markdown": text}
