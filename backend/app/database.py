from __future__ import annotations

import os
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.models import Base

DEFAULT_UPLOAD_DIR = Path(
    os.environ.get("UPLOAD_DIR", str(Path(__file__).resolve().parents[1] / "uploads"))
)
DB_PATH = os.environ.get("DB_PATH", str(DEFAULT_UPLOAD_DIR / "nootbooklm.db"))


def _db_url() -> str:
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    return f"sqlite+aiosqlite:///{DB_PATH}"


engine = create_async_engine(_db_url(), echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_ensure_source_progress_columns)
        await conn.run_sync(_ensure_notebook_feature_columns)


def _ensure_source_progress_columns(conn) -> None:
    rows = conn.exec_driver_sql("PRAGMA table_info(sources)").fetchall()
    existing_cols = {row[1] for row in rows}

    if "ingestion_step" not in existing_cols:
        conn.exec_driver_sql(
            "ALTER TABLE sources ADD COLUMN ingestion_step VARCHAR DEFAULT 'queued'"
        )
    if "progress_percent" not in existing_cols:
        conn.exec_driver_sql(
            "ALTER TABLE sources ADD COLUMN progress_percent INTEGER DEFAULT 0"
        )


def _ensure_notebook_feature_columns(conn) -> None:
    rows = conn.exec_driver_sql("PRAGMA table_info(notebooks)").fetchall()
    existing_cols = {row[1] for row in rows}

    if "summary" not in existing_cols:
        conn.exec_driver_sql("ALTER TABLE notebooks ADD COLUMN summary TEXT")
    if "summary_updated_at" not in existing_cols:
        conn.exec_driver_sql(
            "ALTER TABLE notebooks ADD COLUMN summary_updated_at DATETIME"
        )
    if "share_token" not in existing_cols:
        conn.exec_driver_sql("ALTER TABLE notebooks ADD COLUMN share_token VARCHAR")

    conn.exec_driver_sql(
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_notebooks_share_token ON notebooks (share_token)"
    )


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session
