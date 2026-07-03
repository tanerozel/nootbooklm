"""Text chunking with metadata preservation."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.config import get_settings
from app.ingestion.loaders import LoadedDocument


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def chunk_document(
    doc: LoadedDocument,
    source_id: str,
    notebook_id: str,
) -> list[dict]:
    """Split a LoadedDocument into chunks with required metadata.

    Returns a list of dicts suitable for indexing into OpenSearch.
    """
    settings = get_settings()
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=settings.chunk_size,
        chunk_overlap=settings.chunk_overlap,
        length_function=len,
        separators=["\n\n", "\n", ". ", " ", ""],
    )

    chunks = []
    chunk_index = 0
    created_at = _now_iso()

    for page in doc.pages:
        text = page["text"]
        if not text.strip():
            continue

        page_number: Optional[int] = page.get("page_number")
        splits = splitter.split_text(text)

        for split in splits:
            if not split.strip():
                continue
            chunks.append(
                {
                    "source_id": source_id,
                    "source_title": doc.title,
                    "notebook_id": notebook_id,
                    "page_number": page_number,
                    "chunk_index": chunk_index,
                    "text": split.strip(),
                    "created_at": created_at,
                }
            )
            chunk_index += 1

    return chunks
