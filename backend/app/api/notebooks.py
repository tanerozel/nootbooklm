"""Notebook CRUD endpoints."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import NotebookCreate, NotebookOut, NotebookUpdate
from app.database import get_db
from app.models import Notebook, Note

router = APIRouter(prefix="/notebooks", tags=["notebooks"])


@router.post("", response_model=NotebookOut, status_code=status.HTTP_201_CREATED)
async def create_notebook(
    data: NotebookCreate,
    db: AsyncSession = Depends(get_db),
) -> NotebookOut:
    notebook_id = str(uuid.uuid4())
    notebook = Notebook(id=notebook_id, title=data.title, description=data.description)
    db.add(notebook)
    # Create a default empty note for this notebook
    note = Note(id=str(uuid.uuid4()), notebook_id=notebook_id, content="")
    db.add(note)
    await db.commit()
    await db.refresh(notebook)
    return notebook


@router.get("", response_model=list[NotebookOut])
async def list_notebooks(db: AsyncSession = Depends(get_db)) -> list[NotebookOut]:
    result = await db.execute(select(Notebook).order_by(Notebook.created_at.desc()))
    return list(result.scalars().all())


@router.get("/{notebook_id}", response_model=NotebookOut)
async def get_notebook(
    notebook_id: str,
    db: AsyncSession = Depends(get_db),
) -> NotebookOut:
    notebook = await db.get(Notebook, notebook_id)
    if not notebook:
        raise HTTPException(status_code=404, detail="Notebook not found")
    return notebook


@router.patch("/{notebook_id}", response_model=NotebookOut)
async def update_notebook(
    notebook_id: str,
    data: NotebookUpdate,
    db: AsyncSession = Depends(get_db),
) -> NotebookOut:
    notebook = await db.get(Notebook, notebook_id)
    if not notebook:
        raise HTTPException(status_code=404, detail="Notebook not found")
    if data.title is not None:
        notebook.title = data.title
    if data.description is not None:
        notebook.description = data.description
    await db.commit()
    await db.refresh(notebook)
    return notebook


@router.delete("/{notebook_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_notebook(
    notebook_id: str,
    db: AsyncSession = Depends(get_db),
) -> None:
    notebook = await db.get(Notebook, notebook_id)
    if not notebook:
        raise HTTPException(status_code=404, detail="Notebook not found")
    await db.delete(notebook)
    await db.commit()
