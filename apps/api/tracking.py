"""Index user login events directly into Elasticsearch (no message broker)."""
from __future__ import annotations

import json
import logging
import os
import threading
import time
from typing import Any

from elasticsearch import Elasticsearch
from fastapi import APIRouter
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter()

ES_HOST = os.getenv("ELASTICSEARCH_URL", "http://elasticsearch:9200")
LOGIN_INDEX = "logins"

_es_client: Elasticsearch | None = None
_es_lock = threading.Lock()


def _connect_es(retries: int = 8, delay: float = 2.0) -> Elasticsearch | None:
    for attempt in range(1, retries + 1):
        try:
            client = Elasticsearch(ES_HOST)
            info = client.info()
            logger.info(
                "Elasticsearch ready (%s/%s): %s",
                attempt,
                retries,
                info.get("version", {}).get("number", "?"),
            )
            return client
        except Exception as exc:
            logger.warning("ES not ready (%s/%s): %s", attempt, retries, exc)
            time.sleep(delay)
    return None


def _get_es() -> Elasticsearch | None:
    global _es_client
    if _es_client is not None:
        return _es_client
    with _es_lock:
        if _es_client is not None:
            return _es_client
        _es_client = _connect_es()
        return _es_client


class LoginEvent(BaseModel):
    uid: str
    email: str | None = None
    timestamp: str


@router.post("/track-login")
def track_login(event: LoginEvent) -> dict[str, Any]:
    es = _get_es()
    if not es:
        logger.warning("Elasticsearch unavailable — login not indexed.")
        return {"status": "ignored", "reason": "elasticsearch_unavailable"}

    try:
        doc = event.model_dump()
        res = es.index(index=LOGIN_INDEX, document=doc)
        logger.info("Login indexed — uid=%s result=%s", event.uid, res.get("result"))
        return {"status": "success", "result": res.get("result")}
    except Exception as exc:
        logger.error("Failed to index login: %s", exc)
        return {"status": "error", "reason": str(exc)}
