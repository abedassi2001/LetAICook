"""Minimal FastAPI service — full orchestration layer comes next (per Plan/README)."""

from fastapi import FastAPI

app = FastAPI(title="letAIcook API", version="0.1.0")


@app.get("/health")
def health():
    return {"status": "ok", "service": "letAIcook-api"}
