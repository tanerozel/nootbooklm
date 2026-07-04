"""RAG pipeline: retrieve → build prompt → generate cited answer."""
from __future__ import annotations

import logging
from typing import Any

import tiktoken
from fastapi import HTTPException
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage

from app.config import get_runtime_settings
from app.llm.client import get_llm
from app.llm.tracker import check_daily_budget, record_token_usage
from app.retrieval.embeddings import get_embedder
from app.retrieval.rerank import rerank_chunks
from app.retrieval.search import get_opensearch_client, hybrid_search

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a research assistant that ONLY answers questions based on the provided source excerpts.

RULES — follow strictly:
1. Base every statement on the provided sources. Never invent information not present in the sources.
2. After each factual claim, append a citation in the format [source_id::chunk_index].
3. If the answer cannot be found in the sources, respond with: "I cannot find information about this in the provided sources."
4. Do NOT speculate or add background knowledge beyond what the sources contain.
5. Be concise and accurate.

Sources will be provided in the following format:
[source_id::chunk_index] (page N) Title: "..." 
Text: ...
"""


def _get_encoder(model: str) -> tiktoken.Encoding:
    """Return a tiktoken encoder for *model*, falling back to cl100k_base."""
    try:
        return tiktoken.encoding_for_model(model)
    except KeyError:
        return tiktoken.get_encoding("cl100k_base")


def _count_tokens(text: str, encoder: tiktoken.Encoding) -> int:
    return len(encoder.encode(text))


def _trim_history(
    history: list[dict],
    budget: int,
    encoder: tiktoken.Encoding,
) -> list[dict]:
    """Return the most-recent subset of *history* that fits within *budget* tokens.

    Messages are considered newest-first so that we always preserve the latest
    turns and discard the oldest ones when the budget is exceeded.  We keep
    whole turns (user + assistant pairs) where possible.
    """
    if not history or budget <= 0:
        return []

    total = 0
    kept: list[dict] = []
    for msg in reversed(history):
        tokens = _count_tokens(msg["content"], encoder)
        if total + tokens > budget and kept:
            # Already have some history; stop adding more to avoid overflow.
            break
        total += tokens
        kept.append(msg)

    kept.reverse()
    return kept


def _format_context(chunks: list[dict[str, Any]]) -> str:
    parts = []
    for c in chunks:
        page_info = f"page {c.get('page_number')}" if c.get("page_number") else "no page"
        parts.append(
            f"[{c['source_id']}::{c['chunk_index']}] ({page_info}) "
            f"Title: \"{c.get('source_title', 'Unknown')}\"\n"
            f"Text: {c['text']}"
        )
    return "\n\n---\n\n".join(parts)


def _extract_citations(chunks: list[dict[str, Any]]) -> list[dict]:
    return [
        {
            "source_id": c["source_id"],
            "source_title": c.get("source_title", ""),
            "chunk_index": c["chunk_index"],
            "page_number": c.get("page_number"),
            "text_snippet": c["text"][:200],
        }
        for c in chunks
    ]


async def answer_question(
    notebook_id: str,
    question: str,
    chat_history: list[dict],
    top_k: int = 8,
) -> dict[str, Any]:
    """Run RAG: retrieve relevant chunks and generate a cited answer.

    Returns {"answer": str, "citations": list[dict], "chunks_used": int}
    """
    embedder = get_embedder()
    query_embedding = embedder.embed_query(question)

    client = get_opensearch_client()
    chunks = hybrid_search(
        client,
        notebook_id=notebook_id,
        query_text=question,
        query_embedding=query_embedding,
        top_k=top_k,
    )
    chunks = rerank_chunks(query=question, chunks=chunks, top_k=top_k)

    if not chunks:
        return {
            "answer": "I cannot find information about this in the provided sources.",
            "citations": [],
            "chunks_used": 0,
        }

    context = _format_context(chunks)

    settings = get_runtime_settings()
    encoder = _get_encoder(settings.llm_model)

    # Reserve tokens for system prompt and current user message, then trim history.
    system_tokens = _count_tokens(SYSTEM_PROMPT, encoder)
    user_msg_text = f"SOURCES:\n{context}\n\nQUESTION: {question}"
    user_tokens = _count_tokens(user_msg_text, encoder)
    fixed_tokens = system_tokens + user_tokens
    history_budget = min(
        settings.max_history_tokens,
        max(0, settings.max_context_tokens - fixed_tokens),
    )

    trimmed_history = _trim_history(chat_history, history_budget, encoder)
    logger.debug(
        "Context window: fixed=%d history_budget=%d history_msgs=%d/%d",
        fixed_tokens,
        history_budget,
        len(trimmed_history),
        len(chat_history),
    )

    # Build message history
    messages = [SystemMessage(content=SYSTEM_PROMPT)]
    for msg in trimmed_history:
        if msg["role"] == "user":
            messages.append(HumanMessage(content=msg["content"]))
        else:
            messages.append(AIMessage(content=msg["content"]))

    messages.append(HumanMessage(content=user_msg_text))

    # Check daily token budget before calling the LLM.
    try:
        check_daily_budget()
    except RuntimeError as exc:
        raise HTTPException(status_code=429, detail=str(exc))

    llm = get_llm()
    response = llm.invoke(messages)
    answer = response.content

    # Record token usage — estimate prompt tokens via tiktoken, completion via API
    # metadata when available, otherwise estimate from the response text.
    prompt_tokens = fixed_tokens + sum(
        _count_tokens(m.content, encoder) for m in messages[:-1]
    )
    # Prefer provider-supplied counts if the LLM exposes them.
    usage_meta = getattr(response, "usage_metadata", None) or {}
    completion_tokens = usage_meta.get(
        "output_tokens",
        _count_tokens(answer, encoder),
    )
    record_token_usage(prompt_tokens, completion_tokens)

    return {
        "answer": answer,
        "citations": _extract_citations(chunks),
        "chunks_used": len(chunks),
    }
