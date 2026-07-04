"""NootbookLM — FastAPI application entry point."""
from __future__ import annotations

import logging

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import audio as audio_router
from app.api import chat, notes, notebooks, sources
from app.api import settings as settings_router
from app.api import sharing as sharing_router
from app.api import summary as summary_router
from app.api import usage as usage_router
from app.api import metrics as metrics_router
from app.config import get_settings, load_db_overrides, SENSITIVE_KEYS, decrypt_value
from app.database import init_db, AsyncSessionLocal
from app.middleware.auth import verify_api_key
from app.middleware.observability import ObservabilityMiddleware
from app.middleware.rate_limit import RateLimitMiddleware
from app.models import AppSetting
from sqlalchemy import select

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Routes that do NOT require an API key even when auth is enabled.
_PUBLIC_PREFIXES = ("/health", "/shared/", "/docs", "/openapi.json", "/redoc")


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="NootbookLM API",
        description="Source-grounded research assistant powered by OpenSearch + LLMs",
        version="0.1.0",
    )

    # Observability first so it wraps all middleware and routes.
    app.add_middleware(ObservabilityMiddleware)
    app.add_middleware(RateLimitMiddleware)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Protected routers (API key required when auth is enabled).
    _auth = [Depends(verify_api_key)]
    app.include_router(notebooks.router, dependencies=_auth)
    app.include_router(sources.router, dependencies=_auth)
    app.include_router(chat.router, dependencies=_auth)
    app.include_router(notes.router, dependencies=_auth)
    app.include_router(summary_router.router, dependencies=_auth)
    app.include_router(audio_router.router, dependencies=_auth)
    app.include_router(settings_router.router, dependencies=_auth)
    app.include_router(usage_router.router)
    app.include_router(metrics_router.router)

    # Public router — sharing is always accessible without a key.
    app.include_router(sharing_router.router)

    @app.on_event("startup")
    async def startup() -> None:
        logger.info("Initialising database…")
        await init_db()
        logger.info("Database ready.")

        # Load DB overrides into the in-memory config cache.
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(AppSetting))
            rows = result.scalars().all()
            overrides: dict[str, str] = {}
            for row in rows:
                value = decrypt_value(row.value) if row.key in SENSITIVE_KEYS else row.value
                overrides[row.key] = value
            load_db_overrides(overrides)
        logger.info("Loaded %d setting override(s) from DB.", len(overrides))

    @app.get("/health")
    async def health() -> dict:
        return {"status": "ok"}

    return app


app = create_app()
