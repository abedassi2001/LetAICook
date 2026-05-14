"""letAIcook API — health checks and server-side integrations (Gemini, Jira, etc.)."""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from typing import Literal

import google.generativeai as genai
from design_routes import router as design_router
from jira_routes import router as jira_router
from tracking import router as tracking_router
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from gemini_shared import (
    google_api_key,
    is_quota_exhausted,
    plan_model_candidates,
)
from google.api_core.exceptions import GoogleAPIError
from pydantic import BaseModel, Field

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield

app = FastAPI(title="letAIcook API", version="0.1.0", lifespan=lifespan)

_cors_origins = [
    o.strip()
    for o in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
    if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(design_router)
app.include_router(tracking_router)
app.include_router(jira_router)

PLANNING_SYSTEM_PROMPT = """You are letAIcook's planning assistant for software and product teams.

Context: letAIcook uses Firebase (Firestore) for tasks under projects/{projectId}/tasks. Admins create and assign work; workers execute and mark tasks complete. Tasks have status (todo, in_progress, review, done, blocked), priority, due dates, and optional Jira issue keys. The **AI System Designer** (separate page) can turn this conversation into architecture diagrams and structured JSON when the user opens it — help them describe what they are building clearly so that handoff works well.

Your job:
- Help teams kick off a new project: discovery, scope, milestones, risks, and a sensible first slice of work.
- Explain how to break work into tasks and keep them flowing from planning through delivery (who does what, cadence, definition of done).
- Be concrete and actionable; use markdown headings and bullet lists when it helps.
- If the user’s goal is vague, ask a short clarifying question before dumping a long plan.
- Stay neutral on specific vendors unless the user names them; align recommendations with letAIcook’s admin/worker task model.

Do not claim you created tasks in their Firebase project; you only advise. Do not ask for API keys or secrets."""


class ChatMessageIn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=12000)


class ChatPlanRequest(BaseModel):
    messages: list[ChatMessageIn] = Field(
        ...,
        min_length=1,
        max_length=40,
        description="Conversation history; last message should be from the user.",
    )


class ChatPlanResponse(BaseModel):
    message: str


def _run_plan_chat(
    *,
    api_key: str,
    model_name: str,
    history: list[dict[str, list[str]]],
    user_content: str,
) -> str:
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(
        model_name=model_name,
        system_instruction=PLANNING_SYSTEM_PROMPT,
    )
    chat = model.start_chat(history=history)
    response = chat.send_message(
        user_content,
        generation_config=genai.GenerationConfig(temperature=0.7),
    )
    text = response.text or ""
    if not text.strip():
        raise HTTPException(status_code=502, detail="Empty response from AI.")
    return text


@app.get("/health")
def health():
    return {"status": "ok", "service": "letAIcook-api"}


@app.post("/chat/plan", response_model=ChatPlanResponse)
def chat_plan(body: ChatPlanRequest):
    """Project planning and task-lifecycle advice via Gemini (API key on server only)."""
    api_key = google_api_key()
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail=(
                "AI is not configured: set GOOGLE_API_KEY (or GEMINI_API_KEY) on the API "
                "service — use a key from Google AI Studio."
            ),
        )

    if body.messages[-1].role != "user":
        raise HTTPException(
            status_code=400,
            detail="Last message must be from the user.",
        )

    history: list[dict[str, list[str]]] = []
    for m in body.messages[:-1]:
        history.append(
            {
                "role": "user" if m.role == "user" else "model",
                "parts": [m.content],
            }
        )
    user_content = body.messages[-1].content

    candidates = plan_model_candidates()
    last_error: GoogleAPIError | None = None

    for i, model_name in enumerate(candidates):
        try:
            text = _run_plan_chat(
                api_key=api_key,
                model_name=model_name,
                history=history,
                user_content=user_content,
            )
            return ChatPlanResponse(message=text)
        except HTTPException:
            raise
        except GoogleAPIError as e:
            last_error = e
            if is_quota_exhausted(e) and i < len(candidates) - 1:
                continue
            raise HTTPException(
                status_code=502,
                detail=(
                    f"Upstream AI error ({model_name}): {e!s}. "
                    f"Tried: {', '.join(candidates[: i + 1])}. "
                    "Try GEMINI_MODEL / GEMINI_MODEL_FALLBACKS in apps/api/.env.local, "
                    "enable billing for your Google Cloud project, or create a new API key project — "
                    "see https://ai.google.dev/gemini-api/docs/rate-limits"
                ),
            ) from e

    if last_error:
        raise HTTPException(
            status_code=502,
            detail=(
                f"All Gemini models exhausted quota ({', '.join(candidates)}): {last_error!s}. "
                "Enable billing or use a project with free-tier access for these models."
            ),
        ) from last_error

    raise HTTPException(status_code=502, detail="No Gemini model configured.")
