"""Cross-encoder reranking for retrieved chunks."""
from __future__ import annotations

import logging
from functools import lru_cache
from typing import Any

from app.config import get_runtime_settings

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def get_reranker():
    settings = get_runtime_settings()
    if not settings.reranker_enabled:
        return None

    from sentence_transformers import CrossEncoder

    return CrossEncoder(settings.reranker_model)


def clear_reranker_cache() -> None:
    get_reranker.cache_clear()


def rerank_chunks(
    query: str,
    chunks: list[dict[str, Any]],
    top_k: int,
) -> list[dict[str, Any]]:
    settings = get_runtime_settings()
    if not chunks:
        return []

    if not settings.reranker_enabled:
        return chunks[:top_k]

    try:
        reranker = get_reranker()
        if reranker is None:
            return chunks[:top_k]

        candidate_limit = max(top_k, settings.reranker_top_k)
        candidates = chunks[:candidate_limit]
        pairs = [(query, c.get("text", "")) for c in candidates]
        scores = reranker.predict(pairs)
        ranked = sorted(
            zip(candidates, scores, strict=False),
            key=lambda x: float(x[1]),
            reverse=True,
        )[:top_k]
        return [{**chunk, "_rerank_score": float(score)} for chunk, score in ranked]
    except Exception:
        logger.exception("Cross-encoder rerank failed; returning hybrid ranking")
        return chunks[:top_k]
