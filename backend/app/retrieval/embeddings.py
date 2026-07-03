"""Embedding provider — swappable via config."""
from __future__ import annotations

from functools import lru_cache
from typing import Protocol

from app.config import get_runtime_settings


class Embedder(Protocol):
    def embed_documents(self, texts: list[str]) -> list[list[float]]: ...
    def embed_query(self, text: str) -> list[float]: ...


@lru_cache(maxsize=1)
def get_embedder() -> Embedder:
    settings = get_runtime_settings()
    provider = settings.embedding_provider

    if provider == "openai":
        from langchain_openai import OpenAIEmbeddings

        return OpenAIEmbeddings(
            model=settings.embedding_model,
            openai_api_key=settings.openai_api_key,
        )

    if provider == "huggingface":
        from langchain_community.embeddings import HuggingFaceEmbeddings

        return HuggingFaceEmbeddings(model_name=settings.embedding_model)

    raise ValueError(f"Unknown embedding provider: {provider}")


def clear_embedder_cache() -> None:
    get_embedder.cache_clear()
