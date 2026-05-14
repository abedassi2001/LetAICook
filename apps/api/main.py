"""ASGI entry: `uvicorn main:app` (Docker / local) re-exports the packaged app."""
// test
from letaicook_api.main import app

__all__ = ["app"]
