from __future__ import annotations

import os
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.models import Base

DB_PATH = os.environ.get("DB_PATH", "/app/uploads/nootbooklm.db")


def _db_url() -> str:
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    return f"sqlite+aiosqlite:///{DB_PATH}"


engine = create_async_engine(_db_url(), echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session
