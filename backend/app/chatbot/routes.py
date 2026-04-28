"""Chatbot HTTP endpoints.

User-facing:
    POST /api/chat            — streaming SSE answer to a single question
    GET  /api/chat/history    — load past messages of a session

Admin-only:
    GET    /api/chat/admin/stats         — usage and cost overview
    POST   /api/chat/admin/reindex       — re-run the doc ingest
    DELETE /api/chat/admin/messages      — wipe messages of a user/session

The streaming endpoint uses Server-Sent Events. We can't use the browser
EventSource API because EventSource doesn't support custom headers (we
need `Authorization: Bearer ...`), so the frontend reads the response
body via `fetch` + ReadableStream. The wire format is the same SSE
event/data lines either way.
"""
from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any, AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import delete as sa_delete, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth_routes import get_current_user
from app.chatbot import embeddings, ingest as ingest_mod, llm, rate_limit, vectorstore
from app.config import get_settings
from app.models.database import async_session, get_db
from app.models.schemas import ChatMessage, ChatUsage, DocChunk, User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat", tags=["chat"])


# ───────────────────────── Schemas ─────────────────────────

class ChatRequest(BaseModel):
    question: str = Field(..., min_length=1)
    session_id: str | None = None


class ChatHistoryMessage(BaseModel):
    role: str
    content: str
    created_at: datetime


class ChatHistoryResponse(BaseModel):
    session_id: str
    messages: list[ChatHistoryMessage]


# ───────────────────────── Helpers ─────────────────────────

def _check_chat_permission(user: User) -> None:
    if user.is_admin:
        return
    tabs = {access.tab for access in (user.tab_access or [])}
    if "chat" not in tabs:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "No tienes acceso al asistente.",
        )


def _require_admin(user: User) -> None:
    if not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Solo administradores.")


def _sse_event(data: dict) -> str:
    """Format one SSE event. We send everything on the default `message`
    event type and rely on the JSON `type` field to discriminate."""
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


# ───────────────────────── POST /api/chat (streaming) ─────────────────────────

@router.post("")
async def chat(
    payload: ChatRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    _check_chat_permission(user)
    settings = get_settings()

    question = payload.question.strip()
    if not question:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "La pregunta está vacía.")
    if len(question) > settings.chatbot_max_input_chars:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"La pregunta supera el máximo de {settings.chatbot_max_input_chars} caracteres.",
        )
    if not settings.openai_api_key or not settings.groq_api_key:
        logger.error("Chatbot keys not configured (OPENAI_API_KEY or GROQ_API_KEY missing)")
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "El asistente no está configurado en este entorno.",
        )

    # Reserve one message slot up-front so concurrent requests can't sneak past
    # the cap. Commit immediately — the rest of the work happens inside the
    # streaming response and is too late to roll back the count atomically.
    allowed, remaining = await rate_limit.check_and_consume(db, user.id)
    await db.commit()
    if not allowed:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"Has alcanzado el límite diario de {settings.chatbot_daily_message_limit} mensajes. Inténtalo mañana.",
        )

    session_id = payload.session_id or str(uuid.uuid4())
    user_id = user.id  # capture before db session is closed

    # Pre-flight RAG retrieval (cheap and non-streaming) so we can report
    # any failure as a normal HTTP error and not as a half-streamed response.
    try:
        query_vec = embeddings.embed_text(question)
    except Exception as exc:
        logger.exception("Embedding failed: %s", exc)
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "El asistente no pudo procesar tu pregunta. Inténtalo de nuevo.",
        )

    retrieved = await vectorstore.search(db, query_vec, top_k=settings.chatbot_top_k)
    chunks_payload = [r.as_dict() for r in retrieved]

    async def event_stream() -> AsyncGenerator[str, None]:
        # First event: hand the session_id and remaining-quota back to the
        # client right away so the UI can update before any tokens arrive.
        yield _sse_event({
            "type": "meta",
            "session_id": session_id,
            "remaining_today": remaining,
        })

        full_answer_parts: list[str] = []
        in_tokens = 0
        out_tokens = 0

        try:
            # Run the blocking SDK iterator in a thread so the event loop
            # stays responsive (other requests, the heartbeat below, etc.).
            loop = asyncio.get_running_loop()
            queue: asyncio.Queue = asyncio.Queue()

            def producer():
                try:
                    for kind, data in llm.stream_complete(question, chunks_payload):
                        loop.call_soon_threadsafe(queue.put_nowait, (kind, data))
                except Exception as e:
                    loop.call_soon_threadsafe(queue.put_nowait, ("error", str(e)))
                finally:
                    loop.call_soon_threadsafe(queue.put_nowait, ("done", None))

            await loop.run_in_executor(None, producer)

            while True:
                kind, data = await queue.get()
                if kind == "token":
                    full_answer_parts.append(data)
                    yield _sse_event({"type": "token", "content": data})
                elif kind == "usage":
                    in_tokens, out_tokens = data
                elif kind == "error":
                    logger.error("LLM stream error: %s", data)
                    yield _sse_event({
                        "type": "error",
                        "message": "El asistente no pudo procesar tu pregunta. Inténtalo de nuevo.",
                    })
                    return
                elif kind == "done":
                    break
        except Exception as exc:
            logger.exception("Streaming failed: %s", exc)
            yield _sse_event({
                "type": "error",
                "message": "El asistente no pudo procesar tu pregunta. Inténtalo de nuevo.",
            })
            return

        full_answer = "".join(full_answer_parts).strip()

        # Persist messages + token counts in a fresh DB session so we don't
        # rely on the request-scoped `db` (it's already been closed by the
        # time the stream finishes — FastAPI cleans up Depends after the
        # endpoint function returns).
        async with async_session() as out_db:
            out_db.add(ChatMessage(
                user_id=user_id,
                session_id=session_id,
                role="user",
                content=question,
            ))
            if full_answer:
                out_db.add(ChatMessage(
                    user_id=user_id,
                    session_id=session_id,
                    role="assistant",
                    content=full_answer,
                ))
            await rate_limit.record_tokens(out_db, user_id, in_tokens, out_tokens)
            await out_db.commit()

        yield _sse_event({"type": "done"})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # disable nginx/Caddy buffering if any
        },
    )


# ───────────────────────── GET /api/chat/history ─────────────────────────

@router.get("/history", response_model=ChatHistoryResponse)
async def history(
    session_id: str = Query(..., min_length=1),
    limit: int = Query(100, ge=1, le=500),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Return the last `limit` messages of a session belonging to the
    current user. Used by the widget to restore the conversation when
    it's reopened."""
    _check_chat_permission(user)
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.user_id == user.id, ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at.asc())
        .limit(limit)
    )
    rows = result.scalars().all()
    return ChatHistoryResponse(
        session_id=session_id,
        messages=[
            ChatHistoryMessage(role=r.role, content=r.content, created_at=r.created_at)
            for r in rows
        ],
    )


# ───────────────────────── Admin endpoints ─────────────────────────


class AdminUserUsage(BaseModel):
    user_id: int
    username: str
    message_count: int
    input_tokens: int
    output_tokens: int


class AdminQuestionRow(BaseModel):
    user_id: int
    username: str
    content: str
    created_at: datetime


class AdminStatsResponse(BaseModel):
    messages_24h: int
    messages_7d: int
    messages_30d: int
    input_tokens_30d: int
    output_tokens_30d: int
    estimated_cost_usd_30d: float  # OpenAI embeddings + Groq paid tier estimate
    indexed_chunks: int
    top_users_30d: list[AdminUserUsage]
    recent_questions: list[AdminQuestionRow]
    daily_message_limit: int


@router.get("/admin/stats", response_model=AdminStatsResponse)
async def admin_stats(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    _require_admin(user)
    settings = get_settings()
    now = datetime.now(timezone.utc)

    # Aggregate message counts in three windows from chat_messages.role='user'
    async def count_messages_since(delta: timedelta) -> int:
        since = now - delta
        result = await db.execute(
            select(func.count(ChatMessage.id)).where(
                ChatMessage.role == "user",
                ChatMessage.created_at >= since,
            )
        )
        return result.scalar_one() or 0

    messages_24h = await count_messages_since(timedelta(days=1))
    messages_7d = await count_messages_since(timedelta(days=7))
    messages_30d = await count_messages_since(timedelta(days=30))

    # Token totals over the last 30 days from chat_usage.
    cutoff_day = (now - timedelta(days=30)).date()
    result = await db.execute(
        select(
            func.coalesce(func.sum(ChatUsage.input_tokens), 0),
            func.coalesce(func.sum(ChatUsage.output_tokens), 0),
        ).where(ChatUsage.day >= cutoff_day)
    )
    in_30, out_30 = result.one()

    # Cost estimate: OpenAI embeddings + Groq paid tier rates (we may be on
    # free tier today, but show what it WOULD cost on paid for sizing).
    # OpenAI text-embedding-3-small: $0.02/M tokens. Embedding tokens not
    # tracked separately, approximate from question count × 30 tokens.
    embed_tokens = (messages_30d or 0) * 30
    embed_cost = embed_tokens / 1_000_000 * 0.02
    # Groq Llama 3.1 8B Instant paid: $0.05 / $0.08 per M (input/output).
    groq_cost = (in_30 or 0) / 1_000_000 * 0.05 + (out_30 or 0) / 1_000_000 * 0.08
    estimated_cost = round(embed_cost + groq_cost, 4)

    # Indexed chunks count.
    result = await db.execute(select(func.count(DocChunk.id)))
    indexed = result.scalar_one() or 0

    # Top users by message count in the last 30 days.
    cutoff_dt = now - timedelta(days=30)
    result = await db.execute(
        select(
            User.id,
            User.username,
            func.count(ChatMessage.id).label("msg_count"),
            func.coalesce(func.sum(ChatUsage.input_tokens), 0),
            func.coalesce(func.sum(ChatUsage.output_tokens), 0),
        )
        .join(ChatMessage, ChatMessage.user_id == User.id)
        .outerjoin(
            ChatUsage,
            (ChatUsage.user_id == User.id) & (ChatUsage.day >= cutoff_day),
        )
        .where(ChatMessage.role == "user", ChatMessage.created_at >= cutoff_dt)
        .group_by(User.id, User.username)
        .order_by(desc("msg_count"))
        .limit(10)
    )
    top_users = [
        AdminUserUsage(
            user_id=row[0],
            username=row[1],
            message_count=row[2],
            input_tokens=row[3] or 0,
            output_tokens=row[4] or 0,
        )
        for row in result.all()
    ]

    # Most recent user questions (last 30) — useful to spot doc gaps.
    result = await db.execute(
        select(ChatMessage, User.username)
        .join(User, User.id == ChatMessage.user_id)
        .where(ChatMessage.role == "user")
        .order_by(desc(ChatMessage.created_at))
        .limit(30)
    )
    recent = [
        AdminQuestionRow(
            user_id=msg.user_id,
            username=username,
            content=msg.content,
            created_at=msg.created_at,
        )
        for msg, username in result.all()
    ]

    return AdminStatsResponse(
        messages_24h=messages_24h,
        messages_7d=messages_7d,
        messages_30d=messages_30d,
        input_tokens_30d=in_30 or 0,
        output_tokens_30d=out_30 or 0,
        estimated_cost_usd_30d=estimated_cost,
        indexed_chunks=indexed,
        top_users_30d=top_users,
        recent_questions=recent,
        daily_message_limit=settings.chatbot_daily_message_limit,
    )


class ReindexResponse(BaseModel):
    indexed_chunks: int
    duration_s: float


@router.post("/admin/reindex", response_model=ReindexResponse)
async def admin_reindex(
    user: User = Depends(get_current_user),
) -> Any:
    """Re-run the doc ingest. Blocks until complete (~10s for current
    docs). Admin-only. Returns the number of chunks indexed."""
    _require_admin(user)
    settings = get_settings()
    if not settings.openai_api_key:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "OPENAI_API_KEY no configurada.",
        )

    started = datetime.now(timezone.utc)
    try:
        count = await ingest_mod.ingest(ingest_mod.DEFAULT_DOCS_DIR, reset=True)
    except SystemExit:
        # ingest.ingest() calls sys.exit(1) on missing keys / dir; surface as 500.
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "El reindexado falló (revisa los logs del backend).",
        )
    except Exception as exc:
        logger.exception("Reindex failed: %s", exc)
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            f"El reindexado falló: {exc}",
        )
    duration = (datetime.now(timezone.utc) - started).total_seconds()
    return ReindexResponse(indexed_chunks=count, duration_s=round(duration, 2))


class DeleteMessagesRequest(BaseModel):
    user_id: int | None = None
    session_id: str | None = None


class DeleteMessagesResponse(BaseModel):
    deleted: int


@router.delete("/admin/messages", response_model=DeleteMessagesResponse)
async def admin_delete_messages(
    payload: DeleteMessagesRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Wipe chat history for a user, a session, or the intersection of both.
    Admin-only. Refuses to run with no filters (would wipe everything)."""
    _require_admin(user)
    if not payload.user_id and not payload.session_id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Especifica user_id, session_id, o ambos.",
        )

    stmt = sa_delete(ChatMessage)
    if payload.user_id is not None:
        stmt = stmt.where(ChatMessage.user_id == payload.user_id)
    if payload.session_id is not None:
        stmt = stmt.where(ChatMessage.session_id == payload.session_id)

    result = await db.execute(stmt)
    await db.commit()
    return DeleteMessagesResponse(deleted=result.rowcount or 0)
