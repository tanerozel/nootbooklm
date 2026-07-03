"""Notes endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import NoteOut, NoteUpdate
from app.database import get_db
from app.models import Note, Notebook

router = APIRouter(prefix="/notebooks/{notebook_id}/notes", tags=["notes"])


@router.get("", response_model=NoteOut)
async def get_note(
    notebook_id: str,
    db: AsyncSession = Depends(get_db),
) -> NoteOut:
    notebook = await db.get(Notebook, notebook_id)
    if not notebook:
        raise HTTPException(status_code=404, detail="Notebook not found")

    result = await db.execute(
        select(Note).where(Note.notebook_id == notebook_id)
    )
    note = result.scalars().first()
    if not note:
        # Create on demand
        note = Note(notebook_id=notebook_id, content="")
        db.add(note)
        await db.commit()
        await db.refresh(note)
    return note


@router.put("", response_model=NoteOut)
async def update_note(
    notebook_id: str,
    data: NoteUpdate,
    db: AsyncSession = Depends(get_db),
) -> NoteOut:
    notebook = await db.get(Notebook, notebook_id)
    if not notebook:
        raise HTTPException(status_code=404, detail="Notebook not found")

    result = await db.execute(
        select(Note).where(Note.notebook_id == notebook_id)
    )
    note = result.scalars().first()
    if not note:
        note = Note(notebook_id=notebook_id, content=data.content)
        db.add(note)
    else:
        note.content = data.content
    await db.commit()
    await db.refresh(note)
    return note
