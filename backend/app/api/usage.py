"""Token usage and cost-control endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from app.llm.tracker import get_all_usage, get_today_usage
from app.middleware.auth import verify_api_key

router = APIRouter(prefix="/usage", tags=["usage"], dependencies=[Depends(verify_api_key)])


@router.get("")
async def usage_today() -> dict:
    """Return today's token usage and budget information."""
    return get_today_usage()


@router.get("/history")
async def usage_history(days: int = 30) -> list[dict]:
    """Return daily token usage for the last *days* days (max 90)."""
    limit = max(1, min(days, 90))
    return get_all_usage(limit=limit)
