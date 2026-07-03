"""RAG pipeline: retrieve → build prompt → generate cited answer."""
from __future__ import annotations

import json
import logging
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage, AIMessage

from app.llm.client import get_llm
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

    # Build message history
    messages = [SystemMessage(content=SYSTEM_PROMPT)]
    for msg in chat_history[-6:]:  # last 3 turns (user+assistant)
        if msg["role"] == "user":
            messages.append(HumanMessage(content=msg["content"]))
        else:
            messages.append(AIMessage(content=msg["content"]))

    user_message = f"SOURCES:\n{context}\n\nQUESTION: {question}"
    messages.append(HumanMessage(content=user_message))

    llm = get_llm()
    response = llm.invoke(messages)
    answer = response.content

    return {
        "answer": answer,
        "citations": _extract_citations(chunks),
        "chunks_used": len(chunks),
    }
