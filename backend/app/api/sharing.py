"""Notebook sharing endpoints."""
from __future__ import annotations

import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import ShareOut, SharedNotebookOut
from app.database import get_db
from app.models import Notebook

router = APIRouter(tags=["sharing"])


@router.post("/notebooks/{notebook_id}/share", response_model=ShareOut)
async def create_share_link(
    notebook_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> ShareOut:
    notebook = await db.get(Notebook, notebook_id)
    if not notebook:
        raise HTTPException(status_code=404, detail="Notebook not found")

    if not notebook.share_token:
        notebook.share_token = secrets.token_urlsafe(32)
        await db.commit()
        await db.refresh(notebook)

    base_url = str(request.base_url).rstrip("/")
    return ShareOut(
        share_token=notebook.share_token,
        share_url=f"{base_url}/shared/{notebook.share_token}",
    )


@router.delete("/notebooks/{notebook_id}/share", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def revoke_share_link(
    notebook_id: str,
    db: AsyncSession = Depends(get_db),
) -> None:
    notebook = await db.get(Notebook, notebook_id)
    if not notebook:
        raise HTTPException(status_code=404, detail="Notebook not found")

    notebook.share_token = None
    await db.commit()


@router.get("/shared/{token}", response_model=SharedNotebookOut)
async def get_shared_notebook(
    token: str,
    db: AsyncSession = Depends(get_db),
) -> SharedNotebookOut:
    result = await db.execute(select(Notebook).where(Notebook.share_token == token))
    notebook = result.scalar_one_or_none()
    if not notebook:
        raise HTTPException(status_code=404, detail="Shared notebook not found")
    return notebook
