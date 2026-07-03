"""NootbookLM — FastAPI application entry point."""
from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import notebooks, sources, chat, notes
from app.api import settings as settings_router
from app.config import get_settings, load_db_overrides, SENSITIVE_KEYS, decrypt_value
from app.database import init_db, AsyncSessionLocal
from app.models import AppSetting
from sqlalchemy import select

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="NootbookLM API",
        description="Source-grounded research assistant powered by OpenSearch + LLMs",
        version="0.1.0",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(notebooks.router)
    app.include_router(sources.router)
    app.include_router(chat.router)
    app.include_router(notes.router)
    app.include_router(settings_router.router)

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
