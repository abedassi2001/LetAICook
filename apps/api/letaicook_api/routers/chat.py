"""Planning chat — Gemini-backed product and task-lifecycle advice."""

from __future__ import annotations

from typing import Literal

import google.generativeai as genai
from fastapi import APIRouter, HTTPException
from google.api_core.exceptions import GoogleAPIError
from pydantic import BaseModel, Field

from letaicook_api.services.gemini_shared import (
    google_api_key,
    is_quota_exhausted,
    plan_model_candidates,
)

router = APIRouter(tags=["chat"])

PLANNING_SYSTEM_PROMPT = """You are letAIcook's planning assistant for software and product teams.

Context: letAIcook uses Firebase (Firestore) for tasks under projects/{projectId}/tasks. Admins create and assign work; workers execute and mark tasks complete. Tasks have status (todo, in_progress, review, done, blocked), priority, due dates, and optional Jira issue keys. The **AI System Designer** (separate page) can turn this conversation into architecture diagrams and structured JSON when the user opens it — help them describe what they are building clearly so that handoff works well.

Your job:
- Help teams kick off a new project: discovery, scope, milestones, risks, and a sensible first slice of work.
- Explain how to break work into tasks and keep them flowing from planning through delivery (who does what, cadence, definition of done).
- Be concrete and actionable; use markdown headings and bullet lists when it helps.
- If the user's goal is vague, ask a short clarifying question before dumping a long plan.
- Stay neutral on specific vendors unless the user names them; align recommendations with letAIcook's admin/worker task model.

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


class ChatPlanSummaryRequest(BaseModel):
    messages: list[ChatMessageIn] = Field(
        ...,
        min_length=1,
        max_length=40,
        description="Full planning conversation to condense for System Designer.",
    )


class ChatPlanSummaryResponse(BaseModel):
    summary: str


PLANNING_SUMMARY_PROMPT = """You write concise project descriptions for letAIcook's System Designer handoff.

Read the planning conversation (user and assistant). Produce a clear summary (roughly 150–450 words) that a system architect can use to generate architecture.

Include when discussed:
- Product goal and target users
- Core features and workflows
- Technical stack, integrations, or constraints mentioned
- Milestones, risks, or delivery cadence
- How work maps to letAIcook (admins assign tasks; workers execute)

Use short paragraphs and bullet lists where helpful. Plain text only — no code fences, no preamble like "Here is a summary".
Do not invent requirements that were not discussed. If the conversation is thin, summarize what exists and note open questions briefly."""


def _format_messages_for_summary(messages: list[ChatMessageIn]) -> str:
    lines: list[str] = []
    for m in messages:
        label = "User" if m.role == "user" else "Assistant"
        lines.append(f"{label}:\n{m.content.strip()}\n")
    return "\n".join(lines).strip()


def _run_plan_summary(*, api_key: str, model_name: str, transcript: str) -> str:
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(model_name=model_name)
    response = model.generate_content(
        [
            PLANNING_SUMMARY_PROMPT,
            "Conversation:\n\n" + transcript,
        ],
        generation_config=genai.GenerationConfig(temperature=0.4),
    )
    text = response.text or ""
    if not text.strip():
        raise HTTPException(status_code=502, detail="Empty summary from AI.")
    return text.strip()


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


@router.post("/chat/plan", response_model=ChatPlanResponse)
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


@router.post("/chat/plan/summary", response_model=ChatPlanSummaryResponse)
def chat_plan_summary(body: ChatPlanSummaryRequest):
    """Condense a planning conversation into a System Designer project description."""
    api_key = google_api_key()
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail=(
                "AI is not configured: set GOOGLE_API_KEY (or GEMINI_API_KEY) on the API "
                "service — use a key from Google AI Studio."
            ),
        )

    transcript = _format_messages_for_summary(body.messages)
    candidates = plan_model_candidates()
    last_error: GoogleAPIError | None = None

    for i, model_name in enumerate(candidates):
        try:
            summary = _run_plan_summary(
                api_key=api_key,
                model_name=model_name,
                transcript=transcript,
            )
            return ChatPlanSummaryResponse(summary=summary)
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
                    f"Tried: {', '.join(candidates[: i + 1])}."
                ),
            ) from e

    if last_error:
        raise HTTPException(
            status_code=502,
            detail=f"All Gemini models exhausted quota ({', '.join(candidates)}): {last_error!s}.",
        ) from last_error

    raise HTTPException(status_code=502, detail="No Gemini model configured.")
