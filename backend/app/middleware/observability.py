"""Observability middleware: request IDs, structured logging, and in-memory metrics.

Every request receives a unique ``X-Request-ID`` (generated or echoed from the
client) and an ``X-Response-Time`` header containing the elapsed milliseconds.

In-memory metrics counters (reset on process restart) are exposed via the
``get_metrics()`` helper used by the ``/metrics`` endpoint.
"""
from __future__ import annotations

import logging
import time
import uuid
from collections import deque
from threading import Lock
from typing import Deque

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

logger = logging.getLogger(__name__)

_lock = Lock()
_metrics: dict[str, int | float] = {
    "total_requests": 0,
    "total_errors": 0,
    "total_duration_ms": 0,
}
# Keep the last 100 response times for a simple moving average.
_recent_durations: Deque[float] = deque(maxlen=100)


class ObservabilityMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        start = time.perf_counter()

        response = await call_next(request)

        elapsed_ms = (time.perf_counter() - start) * 1000

        with _lock:
            _metrics["total_requests"] += 1
            _metrics["total_duration_ms"] += elapsed_ms
            _recent_durations.append(elapsed_ms)
            if response.status_code >= 400:
                _metrics["total_errors"] += 1

        logger.info(
            "request method=%s path=%s status=%d duration_ms=%.1f request_id=%s",
            request.method,
            request.url.path,
            response.status_code,
            elapsed_ms,
            request_id,
        )

        response.headers["X-Request-ID"] = request_id
        response.headers["X-Response-Time"] = f"{elapsed_ms:.1f}ms"
        return response


def get_metrics() -> dict:
    with _lock:
        total = int(_metrics["total_requests"])
        errors = int(_metrics["total_errors"])
        total_ms = float(_metrics["total_duration_ms"])
        recent = list(_recent_durations)

    avg_ms = total_ms / total if total > 0 else 0.0
    recent_avg_ms = sum(recent) / len(recent) if recent else 0.0

    return {
        "total_requests": total,
        "total_errors": errors,
        "error_rate": round(errors / total, 4) if total > 0 else 0.0,
        "avg_response_time_ms": round(avg_ms, 1),
        "recent_avg_response_time_ms": round(recent_avg_ms, 1),
    }
