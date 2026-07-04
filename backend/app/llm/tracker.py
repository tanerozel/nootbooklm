"""Token usage tracking and daily budget enforcement.

Usage is persisted to the ``usage_records`` table (one row per calendar day,
UTC).  The cost-control check raises HTTP 429 when the configured daily token
budget is exceeded.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

import sqlite3

from app.config import get_runtime_settings
from app.database import DB_PATH

logger = logging.getLogger(__name__)


def _today_str() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def record_token_usage(prompt_tokens: int, completion_tokens: int) -> None:
    """Atomically increment today's token counters in the DB.

    Uses a direct synchronous SQLite connection so this can be called from
    both sync and async contexts without requiring a passed-in session.
    """
    total = prompt_tokens + completion_tokens
    today = _today_str()
    try:
        with sqlite3.connect(DB_PATH) as conn:
            conn.execute(
                """
                INSERT INTO usage_records (date, prompt_tokens, completion_tokens, total_tokens, request_count, updated_at)
                VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
                ON CONFLICT(date) DO UPDATE SET
                    prompt_tokens     = prompt_tokens     + excluded.prompt_tokens,
                    completion_tokens = completion_tokens + excluded.completion_tokens,
                    total_tokens      = total_tokens      + excluded.total_tokens,
                    request_count     = request_count     + 1,
                    updated_at        = CURRENT_TIMESTAMP
                """,
                (today, prompt_tokens, completion_tokens, total),
            )
            conn.commit()
    except Exception:
        logger.warning("Failed to record token usage", exc_info=True)


def check_daily_budget() -> None:
    """Raise RuntimeError if today's token usage exceeds the configured budget.

    Call this *before* invoking the LLM so we never exceed the limit.
    The caller is responsible for converting this to an HTTP 429.
    """
    settings = get_runtime_settings()
    budget = settings.max_tokens_per_day
    if budget <= 0:
        return

    today = _today_str()
    try:
        with sqlite3.connect(DB_PATH) as conn:
            row = conn.execute(
                "SELECT total_tokens FROM usage_records WHERE date = ?", (today,)
            ).fetchone()
        used = row[0] if row else 0
    except Exception:
        logger.warning("Could not read daily token usage; skipping budget check")
        return

    if used >= budget:
        raise RuntimeError(
            f"Daily token budget of {budget:,} tokens exceeded "
            f"(used {used:,} today). Try again tomorrow."
        )


def get_today_usage() -> dict:
    """Return today's token usage summary."""
    today = _today_str()
    try:
        with sqlite3.connect(DB_PATH) as conn:
            row = conn.execute(
                "SELECT prompt_tokens, completion_tokens, total_tokens, request_count "
                "FROM usage_records WHERE date = ?",
                (today,),
            ).fetchone()
    except Exception:
        row = None

    if row:
        prompt, completion, total, reqs = row
    else:
        prompt = completion = total = reqs = 0

    settings = get_runtime_settings()
    budget = settings.max_tokens_per_day

    return {
        "date": today,
        "prompt_tokens": prompt,
        "completion_tokens": completion,
        "total_tokens": total,
        "request_count": reqs,
        "budget": budget,
        "budget_remaining": max(0, budget - total) if budget > 0 else None,
        "budget_exceeded": total >= budget if budget > 0 else False,
    }


def get_all_usage(limit: int = 30) -> list[dict]:
    """Return usage for the most recent *limit* days (newest first)."""
    try:
        with sqlite3.connect(DB_PATH) as conn:
            rows = conn.execute(
                "SELECT date, prompt_tokens, completion_tokens, total_tokens, request_count "
                "FROM usage_records ORDER BY date DESC LIMIT ?",
                (limit,),
            ).fetchall()
    except Exception:
        rows = []

    return [
        {
            "date": r[0],
            "prompt_tokens": r[1],
            "completion_tokens": r[2],
            "total_tokens": r[3],
            "request_count": r[4],
        }
        for r in rows
    ]
