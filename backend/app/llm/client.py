"""Provider-agnostic LLM client factory."""
from __future__ import annotations

from functools import lru_cache
from typing import Any

from app.config import get_runtime_settings


@lru_cache(maxsize=1)
def get_llm() -> Any:
    s = get_runtime_settings()
    if s.llm_provider == "openai":
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(
            model=s.llm_model,
            openai_api_key=s.openai_api_key,
            temperature=0.2,
        )
    if s.llm_provider == "anthropic":
        from langchain_anthropic import ChatAnthropic

        return ChatAnthropic(
            model=s.llm_model,
            anthropic_api_key=s.anthropic_api_key,
            temperature=0.2,
        )
    raise ValueError(f"Unknown LLM provider: {s.llm_provider}")


def clear_llm_cache() -> None:
    get_llm.cache_clear()
