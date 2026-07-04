"""Auto-summary generation for a notebook."""
from __future__ import annotations

import logging

from langchain_core.messages import HumanMessage, SystemMessage

from app.llm.client import get_llm
from app.retrieval.embeddings import get_embedder
from app.retrieval.search import get_opensearch_client, hybrid_search

logger = logging.getLogger(__name__)

SUMMARY_SYSTEM_PROMPT = """You are a research assistant. Your task is to produce a concise, well-structured summary of the provided source excerpts from a research notebook.

RULES:
1. Summarise only information present in the provided sources.
2. Organise the summary with a brief overview paragraph followed by key themes or topics as bullet points.
3. Keep the total summary under 600 words.
4. Do NOT add information not present in the sources.
5. Write in clear, plain English.
"""


async def generate_notebook_summary(notebook_id: str) -> str:
    """Retrieve representative chunks and ask the LLM for a summary."""
    embedder = get_embedder()
    query_embedding = embedder.embed_query("summary overview key topics main findings")
    client = get_opensearch_client()
    chunks = hybrid_search(
        client,
        notebook_id=notebook_id,
        query_text="summary overview key topics main findings",
        query_embedding=query_embedding,
        top_k=20,
    )
    if not chunks:
        return "No sources available to summarise."

    parts: list[str] = []
    for chunk in chunks:
        page_info = (
            f"page {chunk.get('page_number')}"
            if chunk.get("page_number")
            else "no page"
        )
        parts.append(
            f"[{chunk.get('source_title', 'Unknown')}] ({page_info})\n{chunk['text']}"
        )

    context = "\n\n---\n\n".join(parts)
    llm = get_llm()
    messages = [
        SystemMessage(content=SUMMARY_SYSTEM_PROMPT),
        HumanMessage(
            content=f"SOURCES:\n{context}\n\nPlease produce the notebook summary now."
        ),
    ]
    response = llm.invoke(messages)
    return response.content if isinstance(response.content, str) else str(response.content)
