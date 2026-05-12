"""Pure helpers and mocked Gemini (no real API key)."""

from unittest.mock import MagicMock, patch

import pytest
from google.api_core.exceptions import GoogleAPIError, ResourceExhausted

import gemini_shared


def test_google_api_key_prefers_google_then_gemini(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    assert gemini_shared.google_api_key() is None

    monkeypatch.setenv("GEMINI_API_KEY", "g")
    assert gemini_shared.google_api_key() == "g"

    monkeypatch.setenv("GOOGLE_API_KEY", "go")
    assert gemini_shared.google_api_key() == "go"


def test_plan_model_candidates_dedupes_and_orders(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("GEMINI_MODEL", raising=False)
    monkeypatch.delenv("GEMINI_MODEL_FALLBACKS", raising=False)
    c = gemini_shared.plan_model_candidates()
    assert c[0] == gemini_shared.DEFAULT_GEMINI_MODEL
    assert c == list(dict.fromkeys(c))

    monkeypatch.setenv("GEMINI_MODEL", "model-a")
    monkeypatch.setenv("GEMINI_MODEL_FALLBACKS", "model-b, model-a ,model-c")
    c = gemini_shared.plan_model_candidates()
    assert c == ["model-a", "model-b", "model-c"]


@pytest.mark.parametrize(
    "err,expected",
    [
        (ResourceExhausted("429"), True),
        (GoogleAPIError("429 RESOURCE_EXHAUSTED"), True),
        (GoogleAPIError("quota exceeded for model"), True),
        (GoogleAPIError("something else"), False),
    ],
)
def test_is_quota_exhausted(err: GoogleAPIError, expected: bool):
    assert gemini_shared.is_quota_exhausted(err) is expected


def test_generate_content_with_fallback_raises_when_no_key(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    with pytest.raises(gemini_shared.GeminiNotConfiguredError):
        gemini_shared.generate_content_with_fallback(
            system_instruction="s",
            user_content="u",
            temperature=0.5,
        )


def test_generate_content_with_fallback_returns_text(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("GOOGLE_API_KEY", "fake-key-for-mock")
    mock_resp = MagicMock()
    mock_resp.text = "  hello  "
    mock_model = MagicMock()
    mock_model.generate_content.return_value = mock_resp
    with patch("gemini_shared.genai") as mock_genai:
        mock_genai.GenerativeModel.return_value = mock_model
        out = gemini_shared.generate_content_with_fallback(
            system_instruction="sys",
            user_content="user",
            temperature=0.2,
            response_mime_type="application/json",
        )
    assert out == "hello"
    mock_genai.configure.assert_called_once_with(api_key="fake-key-for-mock")
    mock_model.generate_content.assert_called_once()


def test_generate_content_with_fallback_retries_on_quota(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("GOOGLE_API_KEY", "fake")
    monkeypatch.setenv("GEMINI_MODEL", "m1")
    monkeypatch.setenv("GEMINI_MODEL_FALLBACKS", "m2")

    ok = MagicMock()
    ok.text = "second"

    mock_model = MagicMock()
    mock_model.generate_content.side_effect = [
        ResourceExhausted("quota"),
        ok,
    ]

    with patch("gemini_shared.genai") as mock_genai:
        mock_genai.GenerativeModel.return_value = mock_model
        out = gemini_shared.generate_content_with_fallback(
            system_instruction="s",
            user_content="u",
            temperature=0.1,
        )
    assert out == "second"
    assert mock_model.generate_content.call_count == 2
