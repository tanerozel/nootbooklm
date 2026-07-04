"""In-memory sliding-window rate limiter middleware.

Limits requests per IP per minute.  When ``rate_limit_rpm`` is 0 (default)
the middleware is a no-op.

Algorithm: for each (IP, minute-bucket) pair we keep a count.  Buckets older
than the current minute are evicted lazily to avoid unbounded memory growth.
"""
from __future__ import annotations

import time
from collections import defaultdict
from threading import Lock

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from app.config import get_runtime_settings

_lock = Lock()
# { ip: { minute_bucket: count } }
_counters: dict[str, dict[int, int]] = defaultdict(dict)


def _current_bucket() -> int:
    return int(time.time() // 60)


def _evict_old_buckets(ip_buckets: dict[int, int], current: int) -> None:
    """Remove buckets older than 2 minutes to prevent memory growth."""
    stale = [b for b in ip_buckets if b < current - 1]
    for b in stale:
        del ip_buckets[b]


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(self, request: Request, call_next) -> Response:
        settings = get_runtime_settings()
        rpm = settings.rate_limit_rpm

        if rpm <= 0:
            return await call_next(request)

        # Use X-Forwarded-For if behind a proxy, otherwise fall back to client host.
        forwarded_for = request.headers.get("X-Forwarded-For")
        ip = forwarded_for.split(",")[0].strip() if forwarded_for else (request.client.host if request.client else "unknown")

        bucket = _current_bucket()

        with _lock:
            ip_buckets = _counters[ip]
            _evict_old_buckets(ip_buckets, bucket)
            count = ip_buckets.get(bucket, 0) + 1
            ip_buckets[bucket] = count

        if count > rpm:
            retry_after = 60 - int(time.time() % 60)
            return Response(
                content='{"detail":"Rate limit exceeded. Try again in a moment."}',
                status_code=429,
                media_type="application/json",
                headers={"Retry-After": str(retry_after)},
            )

        return await call_next(request)
