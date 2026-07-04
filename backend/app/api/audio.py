"""Audio briefing endpoint — TTS from notebook summary."""
from __future__ import annotations

import io
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_runtime_settings
from app.database import get_db
from app.llm.summary import generate_notebook_summary
from app.models import Notebook

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/notebooks/{notebook_id}/audio-briefing", tags=["audio"])


@router.post("")
async def create_audio_briefing(
    notebook_id: str,
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    notebook = await db.get(Notebook, notebook_id)
    if not notebook:
        raise HTTPException(status_code=404, detail="Notebook not found")

    settings = get_runtime_settings()
    if not settings.openai_api_key:
        raise HTTPException(
            status_code=400,
            detail="OpenAI API key not configured. Audio briefing requires OpenAI TTS.",
        )

    text = notebook.summary
    if not text:
        text = await generate_notebook_summary(notebook_id)
        notebook.summary = text
        notebook.summary_updated_at = datetime.now(timezone.utc)
        await db.commit()

    try:
        from openai import OpenAI

        client = OpenAI(api_key=settings.openai_api_key)
        speech_text = text[:4096]
        response = client.audio.speech.create(
            model="tts-1",
            voice="alloy",
            input=speech_text,
            response_format="mp3",
        )
        audio_bytes = response.content
    except Exception as exc:
        logger.error("TTS generation failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Audio generation failed: {exc}")

    return StreamingResponse(
        io.BytesIO(audio_bytes),
        media_type="audio/mpeg",
        headers={
            "Content-Disposition": f'attachment; filename="briefing-{notebook_id[:8]}.mp3"'
        },
    )
