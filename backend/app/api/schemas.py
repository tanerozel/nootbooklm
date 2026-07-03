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


# ── Settings ──────────────────────────────────────────────────────────────────

class SettingsOut(BaseModel):
    # LLM
    llm_provider: str
    openai_api_key: str
    anthropic_api_key: str
    llm_model: str
    # Embedding
    embedding_provider: str
    embedding_model: str
    embedding_dimension: int
    # OpenSearch (mutable fields only)
    opensearch_user: str
    opensearch_password: str
    opensearch_index: str
    # Chunking
    chunk_size: int
    chunk_overlap: int


class SettingsPatch(BaseModel):
    # LLM
    llm_provider: Optional[str] = None
    openai_api_key: Optional[str] = None
    anthropic_api_key: Optional[str] = None
    llm_model: Optional[str] = None
    # Embedding
    embedding_provider: Optional[str] = None
    embedding_model: Optional[str] = None
    embedding_dimension: Optional[int] = None
    # OpenSearch
    opensearch_user: Optional[str] = None
    opensearch_password: Optional[str] = None
    opensearch_index: Optional[str] = None
    # Chunking
    chunk_size: Optional[int] = None
    chunk_overlap: Optional[int] = None


class SettingsPatchResponse(BaseModel):
    settings: SettingsOut
    warnings: list[str]
