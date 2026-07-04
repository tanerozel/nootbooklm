"""API key authentication dependency.

When the ``api_key`` setting is non-empty, every request must supply a
matching ****** in the Authorization header.  If ``api_key`` is empty
(default), authentication is disabled and all requests are allowed through.

Endpoints excluded from auth:
  - GET  /health
  - GET  /shared/{token}  (read-only public share view)
  - GET  /docs, /openapi.json  (Swagger UI)
"""
from __future__ import annotations

from fastapi import Header, HTTPException, status
from typing import Optional

from app.config import get_runtime_settings


async def verify_api_key(authorization: Optional[str] = Header(default=None)) -> None:
    """FastAPI dependency — raises 401 when auth is enabled and key is wrong."""
    settings = get_runtime_settings()
    expected = settings.api_key.strip()

    if not expected:
        # Auth disabled — allow all traffic.
        return

    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header. Supply: Authorization: ******",
            headers={"WWW-Authenticate": "Bearer"},
        )

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Authorization header format. Expected: ******",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if token != expected:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key.",
            headers={"WWW-Authenticate": "Bearer"},
        )
