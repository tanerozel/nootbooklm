"""Notebook auto-summary endpoints."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import SummaryOut
from app.database import get_db
from app.llm.summary import generate_notebook_summary
from app.models import Notebook

router = APIRouter(prefix="/notebooks/{notebook_id}/summary", tags=["summary"])


@router.get("", response_model=SummaryOut)
async def get_summary(
    notebook_id: str,
    db: AsyncSession = Depends(get_db),
) -> SummaryOut:
    notebook = await db.get(Notebook, notebook_id)
    if not notebook:
        raise HTTPException(status_code=404, detail="Notebook not found")
    return SummaryOut(
        summary=notebook.summary,
        summary_updated_at=notebook.summary_updated_at,
    )


@router.post("", response_model=SummaryOut)
async def create_summary(
    notebook_id: str,
    db: AsyncSession = Depends(get_db),
) -> SummaryOut:
    notebook = await db.get(Notebook, notebook_id)
    if not notebook:
        raise HTTPException(status_code=404, detail="Notebook not found")

    summary = await generate_notebook_summary(notebook_id)
    notebook.summary = summary
    notebook.summary_updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(notebook)
    return SummaryOut(
        summary=notebook.summary,
        summary_updated_at=notebook.summary_updated_at,
    )
