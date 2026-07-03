"""Pydantic schemas for API request/response models."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


# ── Notebook ──────────────────────────────────────────────────────────────────

class NotebookCreate(BaseModel):
    title: str
    description: Optional[str] = None


class NotebookUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None


class NotebookOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    description: Optional[str]
    created_at: datetime
    updated_at: datetime


# ── Source ────────────────────────────────────────────────────────────────────

class SourceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    notebook_id: str
    title: str
    source_type: str
    url: Optional[str]
    status: str
    error_message: Optional[str]
    chunk_count: int
    created_at: datetime
    updated_at: datetime


# ── Chat ──────────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    question: str


class CitationOut(BaseModel):
    source_id: str
    source_title: str
    chunk_index: int
    page_number: Optional[int]
    text_snippet: str


class ChatMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    notebook_id: str
    role: str
    content: str
    citations: Optional[list]
    created_at: datetime


class ChatResponse(BaseModel):
    message_id: str
    answer: str
    citations: list[CitationOut]
    chunks_used: int


# ── Note ─────────────────────────────────────────────────────────────────────

class NoteUpdate(BaseModel):
    content: str


class NoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    notebook_id: str
    content: str
    updated_at: datetime
