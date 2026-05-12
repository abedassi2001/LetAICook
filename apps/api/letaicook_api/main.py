"""FastAPI application factory and ASGI `app` instance."""

from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from letaicook_api.routers import chat, design, health, jira


def create_app() -> FastAPI:
    application = FastAPI(title="letAIcook API", version="0.1.0")

    _cors_origins = [
        o.strip()
        for o in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
        if o.strip()
    ]
    application.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    application.include_router(health.router)
    application.include_router(chat.router)
    application.include_router(design.router)
    application.include_router(jira.router)

    return application


app = create_app()
