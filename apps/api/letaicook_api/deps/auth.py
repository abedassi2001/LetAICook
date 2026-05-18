"""Firebase ID token verification for API routes."""

from __future__ import annotations

import logging
import os

from fastapi import Header, HTTPException
from google.auth.transport import requests as google_auth_requests
from google.oauth2 import id_token

logger = logging.getLogger(__name__)


def firebase_project_id() -> str:
    project_id = (
        os.getenv("FIREBASE_PROJECT_ID")
        or os.getenv("NEXT_PUBLIC_FIREBASE_PROJECT_ID")
        or ""
    ).strip()
    if not project_id:
        raise HTTPException(
            status_code=503,
            detail="FIREBASE_PROJECT_ID is not configured on the API service.",
        )
    return project_id


def verify_firebase_bearer(authorization: str | None = Header(None)) -> str:
    """Return Firebase uid from Authorization: Bearer <idToken>."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Authorization bearer token required.")
    token = authorization[7:].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Authorization bearer token required.")
    project_id = firebase_project_id()
    try:
        # Firebase ID tokens use issuer securetoken.google.com — not verify_token (Google OAuth).
        claims = id_token.verify_firebase_token(
            token,
            google_auth_requests.Request(),
            audience=project_id,
        )
    except ValueError as exc:
        logger.warning(
            "Firebase ID token verification failed (project_id=%s, error_type=%s)",
            project_id,
            type(exc).__name__,
        )
        raise HTTPException(status_code=401, detail="Invalid or expired auth token.") from exc
    uid = claims.get("sub") or claims.get("user_id")
    if not uid or not isinstance(uid, str):
        raise HTTPException(status_code=401, detail="Invalid auth token claims.")
    return uid


def optional_firebase_uid(authorization: str | None = Header(None)) -> str | None:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    try:
        return verify_firebase_bearer(authorization)
    except HTTPException:
        return None
