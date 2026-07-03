"""Chat and RAG endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import ChatRequest, ChatMessageOut, ChatResponse
from app.database import get_db
from app.llm.rag import answer_question
from app.models import ChatMessage, Notebook

router = APIRouter(prefix="/notebooks/{notebook_id}/chat", tags=["chat"])


@router.post("", response_model=ChatResponse)
async def ask_question(
    notebook_id: str,
    request: ChatRequest,
    db: AsyncSession = Depends(get_db),
) -> ChatResponse:
    notebook = await db.get(Notebook, notebook_id)
    if not notebook:
        raise HTTPException(status_code=404, detail="Notebook not found")

    # Load recent chat history
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.notebook_id == notebook_id)
        .order_by(ChatMessage.created_at.asc())
    )
    history = [
        {"role": m.role, "content": m.content}
        for m in result.scalars().all()
    ]

    # Save user message
    user_msg = ChatMessage(
        notebook_id=notebook_id,
        role="user",
        content=request.question,
    )
    db.add(user_msg)
    await db.commit()
    await db.refresh(user_msg)

    # Run RAG
    rag_result = await answer_question(
        notebook_id=notebook_id,
        question=request.question,
        chat_history=history,
    )

    # Save assistant message
    assistant_msg = ChatMessage(
        notebook_id=notebook_id,
        role="assistant",
        content=rag_result["answer"],
        citations=rag_result["citations"],
    )
    db.add(assistant_msg)
    await db.commit()
    await db.refresh(assistant_msg)

    return ChatResponse(
        message_id=assistant_msg.id,
        answer=rag_result["answer"],
        citations=rag_result["citations"],
        chunks_used=rag_result["chunks_used"],
    )


@router.get("/history", response_model=list[ChatMessageOut])
async def get_chat_history(
    notebook_id: str,
    db: AsyncSession = Depends(get_db),
) -> list[ChatMessageOut]:
    notebook = await db.get(Notebook, notebook_id)
    if not notebook:
        raise HTTPException(status_code=404, detail="Notebook not found")

    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.notebook_id == notebook_id)
        .order_by(ChatMessage.created_at.asc())
    )
    return list(result.scalars().all())


@router.delete("/history", status_code=204)
async def clear_chat_history(
    notebook_id: str,
    db: AsyncSession = Depends(get_db),
) -> None:
    notebook = await db.get(Notebook, notebook_id)
    if not notebook:
        raise HTTPException(status_code=404, detail="Notebook not found")

    result = await db.execute(
        select(ChatMessage).where(ChatMessage.notebook_id == notebook_id)
    )
    for msg in result.scalars().all():
        await db.delete(msg)
    await db.commit()
