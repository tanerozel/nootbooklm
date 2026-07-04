"""Observability metrics endpoint."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from app.middleware.auth import verify_api_key
from app.middleware.observability import get_metrics

router = APIRouter(prefix="/metrics", tags=["observability"], dependencies=[Depends(verify_api_key)])


@router.get("")
async def metrics() -> dict:
    """Return in-memory request metrics (resets on process restart)."""
    return get_metrics()
