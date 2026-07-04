from __future__ import annotations

import base64
import hashlib
from functools import lru_cache
from typing import Any, Literal

from cryptography.fernet import Fernet
from pydantic_settings import BaseSettings, SettingsConfigDict

# Keys stored encrypted in the DB.
SENSITIVE_KEYS: frozenset[str] = frozenset(
    {"openai_api_key", "anthropic_api_key", "opensearch_password"}
)

# Keys that must never be overridden via the UI (stay ENV-only).
ENV_ONLY_KEYS: frozenset[str] = frozenset(
    {
        "secret_key",
        "backend_cors_origins",
        "opensearch_host",
        "opensearch_port",
        "upload_dir",
        "api_key",          # auth key must not be patchable via API
    }
)

# Keys that affect embeddings — a change requires re-indexing sources.
EMBEDDING_AFFECTING_KEYS: frozenset[str] = frozenset(
    {"embedding_provider", "embedding_model", "embedding_dimension"}
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # LLM
    llm_provider: Literal["openai", "anthropic"] = "openai"
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    llm_model: str = "gpt-4o-mini"  # or claude-3-haiku-20240307

    # Embedding
    embedding_provider: Literal["openai", "huggingface"] = "openai"
    embedding_model: str = "text-embedding-3-small"
    embedding_dimension: int = 1536

    # OpenSearch
    opensearch_host: str = "localhost"
    opensearch_port: int = 9200
    opensearch_user: str = "admin"
    opensearch_password: str = "admin"
    opensearch_index: str = "nootbooklm_chunks"
    opensearch_use_search_pipeline: bool = True
    opensearch_search_pipeline: str = "nootbooklm_hybrid_pipeline"

    # Retrieval / rerank
    reranker_enabled: bool = False
    reranker_model: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"
    reranker_top_k: int = 8

    # Backend
    secret_key: str = "change-me-in-production-at-least-32-chars"
    backend_cors_origins: str = "http://localhost:3000"
    backend_cors_origin_regex: str = ""

    # Auth
    api_key: str = ""  # empty = disabled (dev mode)

    # Rate limiting
    rate_limit_rpm: int = 60  # requests per minute per IP; 0 = disabled

    # Cost control
    max_tokens_per_day: int = 0  # 0 = unlimited

    # Chunking
    chunk_size: int = 400
    chunk_overlap: int = 50

    # Context window management
    max_context_tokens: int = 8192   # total token budget sent to the LLM
    max_history_tokens: int = 2000   # tokens reserved for chat history

    # Storage
    upload_dir: str = "/app/uploads"

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.backend_cors_origins.split(",")]


@lru_cache
def get_settings() -> Settings:
    return Settings()


# ── Runtime settings (ENV + DB overrides) ────────────────────────────────────

# Module-level mutable override store loaded from DB on startup.
_overrides: dict[str, str] = {}


def load_db_overrides(overrides: dict[str, str]) -> None:
    """Replace the in-memory override cache (called on startup and after PATCH)."""
    global _overrides
    _overrides = dict(overrides)


def get_runtime_settings() -> Settings:
    """Return effective settings: DB overrides take priority over ENV."""
    if not _overrides:
        return get_settings()
    base = get_settings().model_dump()
    base.update(_overrides)
    return Settings.model_validate(base)


# ── Encryption helpers ────────────────────────────────────────────────────────

def _fernet() -> Fernet:
    raw_key = get_settings().secret_key.encode()
    derived = base64.urlsafe_b64encode(hashlib.sha256(raw_key).digest())
    return Fernet(derived)


def encrypt_value(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt_value(token: str) -> str:
    return _fernet().decrypt(token.encode()).decode()


def mask_sensitive(value: str) -> str:
    """Show first 4 and last 4 characters; mask the middle with ****."""
    if len(value) <= 8:
        return "****"
    return value[:4] + "****" + value[-4:]


def settings_to_display(s: Settings) -> dict[str, Any]:
    """Return settings dict with sensitive fields masked."""
    d = s.model_dump()
    for key in SENSITIVE_KEYS:
        if d.get(key):
            d[key] = mask_sensitive(d[key])
    # Strip ENV-only keys not exposed via API
    for key in ("secret_key", "backend_cors_origins", "upload_dir"):
        d.pop(key, None)
    return d
