"""End-to-end ingestion pipeline: load → chunk → embed → index."""
from __future__ import annotations

import logging
from typing import Optional

from app.ingestion.chunker import chunk_document
from app.ingestion.loaders import load_document
from app.retrieval.embeddings import get_embedder
from app.retrieval.search import get_opensearch_client, ensure_index, bulk_index_chunks

logger = logging.getLogger(__name__)


def ingest_source(
    source_id: str,
    notebook_id: str,
    source_type: str,
    file_path: Optional[str] = None,
    url: Optional[str] = None,
    title: Optional[str] = None,
) -> int:
    """Ingest a source document (synchronous). Returns number of chunks indexed."""
    logger.info("Loading document source_id=%s type=%s", source_id, source_type)
    doc = load_document(source_type, file_path=file_path, url=url, title=title)

    logger.info("Chunking document source_id=%s title=%s", source_id, doc.title)
    chunks = chunk_document(doc, source_id=source_id, notebook_id=notebook_id)
    logger.info("Produced %d chunks for source_id=%s", len(chunks), source_id)

    if not chunks:
        return 0

    embedder = get_embedder()
    texts = [c["text"] for c in chunks]
    logger.info("Embedding %d chunks…", len(texts))
    embeddings = embedder.embed_documents(texts)

    for chunk, emb in zip(chunks, embeddings):
        chunk["embedding"] = emb

    client = get_opensearch_client()
    ensure_index(client)
    bulk_index_chunks(client, chunks)

    logger.info("Indexed %d chunks for source_id=%s", len(chunks), source_id)
    return len(chunks)
