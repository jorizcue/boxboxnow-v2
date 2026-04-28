"""Per-user daily rate limit for the chatbot.

This is the **real** cost guard. Groq has its own rate limits but they're
about preventing abuse, not budget. The cap below is enforced before
every LLM call so a runaway user (bot, infinite loop, etc.) can't burn
through the free-tier quota in seconds.

Limits live in settings (env-overridable):
  - chatbot_daily_message_limit
  - chatbot_max_input_chars
  - chatbot_max_output_tokens (passed to the LLM as max_tokens)
"""
from __future__ import annotations

from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.schemas import ChatUsage


async def check_and_consume(
    db: AsyncSession,
    user_id: int,
) -> tuple[bool, int]:
    """Atomically check if the user is under their daily quota and, if so,
    increment the message counter. Returns (allowed, remaining_after).

    The caller should `await db.commit()` separately so the increment
    rolls back if downstream LLM/embedding calls fail. We only commit
    once at the end of the request to keep usage accurate.
    """
    settings = get_settings()
    limit = settings.chatbot_daily_message_limit
    today = date.today()

    result = await db.execute(
        select(ChatUsage).where(
            ChatUsage.user_id == user_id,
            ChatUsage.day == today,
        )
    )
    usage = result.scalar_one_or_none()

    if usage is None:
        usage = ChatUsage(user_id=user_id, day=today, message_count=0)
        db.add(usage)
        await db.flush()

    if usage.message_count >= limit:
        return False, 0

    usage.message_count += 1
    remaining = limit - usage.message_count
    return True, remaining


async def record_tokens(
    db: AsyncSession,
    user_id: int,
    input_tokens: int,
    output_tokens: int,
) -> None:
    """Add the LLM token counts to today's row. Called after a successful
    completion so we have an accurate per-user daily token total for
    monitoring."""
    today = date.today()
    result = await db.execute(
        select(ChatUsage).where(
            ChatUsage.user_id == user_id,
            ChatUsage.day == today,
        )
    )
    usage = result.scalar_one_or_none()
    if usage is None:
        # check_and_consume should have created this row already; create
        # defensively if it didn't (e.g. race condition).
        usage = ChatUsage(user_id=user_id, day=today, message_count=1)
        db.add(usage)
    usage.input_tokens += input_tokens
    usage.output_tokens += output_tokens
