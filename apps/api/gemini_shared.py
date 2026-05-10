"""Shared Gemini configuration and single-turn generation (planning chat + system designer)."""

from __future__ import annotations

import os

import google.generativeai as genai
from google.api_core.exceptions import GoogleAPIError, ResourceExhausted

# gemini-2.0-flash is deprecated and often has no free-tier quota (limit: 0).
DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-lite"
DEFAULT_GEMINI_FALLBACKS = (
    "gemini-2.5-flash",
    "gemini-3.1-flash-lite",
)


class GeminiNotConfiguredError(Exception):
    """No GOOGLE_API_KEY / GEMINI_API_KEY on the API service."""


def google_api_key() -> str | None:
    return os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")


def plan_model_candidates() -> list[str]:
    primary = (os.getenv("GEMINI_MODEL") or DEFAULT_GEMINI_MODEL).strip()
    raw = (os.getenv("GEMINI_MODEL_FALLBACKS") or "").strip()
    if raw:
        fallbacks = [m.strip() for m in raw.split(",") if m.strip()]
    else:
        fallbacks = list(DEFAULT_GEMINI_FALLBACKS)

    seen: set[str] = set()
    order: list[str] = []
    for m in [primary, *fallbacks]:
        if m and m not in seen:
            seen.add(m)
            order.append(m)
    return order


def is_quota_exhausted(err: GoogleAPIError) -> bool:
    if isinstance(err, ResourceExhausted):
        return True
    msg = str(err)
    return (
        "429" in msg
        or "RESOURCE_EXHAUSTED" in msg
        or "quota" in msg.lower()
        or "exceeded" in msg.lower()
    )


def generate_content_with_fallback(
    *,
    system_instruction: str,
    user_content: str,
    temperature: float,
    response_mime_type: str | None = None,
) -> str:
    """
    Single-turn generation. Optionally forces JSON MIME type (system designer).
    Raises GeminiNotConfiguredError or the last GoogleAPIError if all models fail.
    """
    api_key = google_api_key()
    if not api_key:
        raise GeminiNotConfiguredError(
            "Set GOOGLE_API_KEY (or GEMINI_API_KEY) on the API — same key as planning chat."
        )

    candidates = plan_model_candidates()
    last_error: GoogleAPIError | None = None

    gen_cfg_kwargs: dict = {"temperature": temperature}
    if response_mime_type:
        gen_cfg_kwargs["response_mime_type"] = response_mime_type

    for i, model_name in enumerate(candidates):
        try:
            genai.configure(api_key=api_key)
            model = genai.GenerativeModel(
                model_name=model_name,
                system_instruction=system_instruction,
            )
            response = model.generate_content(
                user_content,
                generation_config=genai.GenerationConfig(**gen_cfg_kwargs),
            )
            text = (response.text or "").strip()
            if not text:
                raise GoogleAPIError("Empty response from model.")
            return text
        except GoogleAPIError as e:
            last_error = e
            if is_quota_exhausted(e) and i < len(candidates) - 1:
                continue
            raise

    if last_error:
        raise last_error
    raise GoogleAPIError("No Gemini model succeeded.")
