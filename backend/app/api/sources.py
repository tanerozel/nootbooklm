"""Source upload and management endpoints."""
from __future__ import annotations

import concurrent.futures
import logging
import os
import uuid
from pathlib import Path
from typing import Optional

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
    status,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

from app.api.schemas import SourceOut
from app.config import get_settings
from app.database import get_db, DB_PATH
from app.ingestion.pipeline import ingest_source
from app.models import Notebook, Source
from app.retrieval.search import delete_source_chunks, get_opensearch_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/notebooks/{notebook_id}/sources", tags=["sources"])

# Thread pool for CPU-bound ingestion work
_executor = concurrent.futures.ThreadPoolExecutor(max_workers=4)


def _sync_ingest(source_id: str) -> None:
    """Run full ingestion synchronously in a worker thread (non-async DB)."""
    import asyncio
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    from app.models import Source as SourceModel

    db_url = f"sqlite+aiosqlite:///{DB_PATH}"
    engine = create_async_engine(db_url)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async def _run():
        async with Session() as session:
            source = await session.get(SourceModel, source_id)
            if not source:
                return
            source.status = "processing"
            await session.commit()

            try:
                chunk_count = ingest_source(
                    source_id=source.id,
                    notebook_id=source.notebook_id,
                    source_type=source.source_type,
                    file_path=source.file_path,
                    url=source.url,
                    title=source.title,
                )
                source.status = "ready"
                source.chunk_count = chunk_count
            except Exception as exc:
                logger.exception("Ingestion failed for source %s", source_id)
                source.status = "error"
                source.error_message = str(exc)

            await session.commit()

        await engine.dispose()

    asyncio.run(_run())


async def _background_ingest(source_id: str) -> None:
    """FastAPI background task: delegates blocking work to thread pool."""
    import asyncio

    loop = asyncio.get_event_loop()
    await loop.run_in_executor(_executor, _sync_ingest, source_id)


@router.post("", response_model=SourceOut, status_code=status.HTTP_202_ACCEPTED)
async def upload_source(
    notebook_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    file: Optional[UploadFile] = File(None),
    url: Optional[str] = Form(None),
    title: Optional[str] = Form(None),
) -> SourceOut:
    notebook = await db.get(Notebook, notebook_id)
    if not notebook:
        raise HTTPException(status_code=404, detail="Notebook not found")

    if not file and not url:
        raise HTTPException(
            status_code=400, detail="Either file or url must be provided"
        )

    settings = get_settings()
    source_id = str(uuid.uuid4())

    if file:
        suffix = Path(file.filename).suffix.lower().lstrip(".")
        if suffix not in ("pdf", "docx", "txt", "text"):
            raise HTTPException(
                status_code=400, detail=f"Unsupported file type: .{suffix}"
            )
        source_type = "text" if suffix in ("txt", "text") else suffix

        upload_path = Path(settings.upload_dir) / notebook_id / source_id
        upload_path.mkdir(parents=True, exist_ok=True)
        file_path = str(upload_path / file.filename)
        with open(file_path, "wb") as f:
            content = await file.read()
            f.write(content)

        source = Source(
            id=source_id,
            notebook_id=notebook_id,
            title=title or Path(file.filename).stem,
            source_type=source_type,
            file_path=file_path,
            status="pending",
        )
    else:
        source = Source(
            id=source_id,
            notebook_id=notebook_id,
            title=title or url,
            source_type="url",
            url=url,
            status="pending",
        )

    db.add(source)
    await db.commit()
    await db.refresh(source)

    background_tasks.add_task(_background_ingest, source_id=source_id)

    return source


@router.get("", response_model=list[SourceOut])
async def list_sources(
    notebook_id: str,
    db: AsyncSession = Depends(get_db),
) -> list[SourceOut]:
    result = await db.execute(
        select(Source)
        .where(Source.notebook_id == notebook_id)
        .order_by(Source.created_at.asc())
    )
    return list(result.scalars().all())


@router.get("/{source_id}", response_model=SourceOut)
async def get_source(
    notebook_id: str,
    source_id: str,
    db: AsyncSession = Depends(get_db),
) -> SourceOut:
    source = await db.get(Source, source_id)
    if not source or source.notebook_id != notebook_id:
        raise HTTPException(status_code=404, detail="Source not found")
    return source


@router.delete("/{source_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_source(
    notebook_id: str,
    source_id: str,
    db: AsyncSession = Depends(get_db),
) -> None:
    source = await db.get(Source, source_id)
    if not source or source.notebook_id != notebook_id:
        raise HTTPException(status_code=404, detail="Source not found")

    try:
        client = get_opensearch_client()
        delete_source_chunks(client, source_id=source_id)
    except Exception:
        logger.warning(
            "Could not delete OpenSearch chunks for source %s", source_id
        )

    if source.file_path and os.path.exists(source.file_path):
        os.remove(source.file_path)

    await db.delete(source)
    await db.commit()
