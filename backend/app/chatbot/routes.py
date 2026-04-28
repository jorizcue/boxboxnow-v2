"""POST /api/chat — single-turn RAG query.

Flow:
    1. Auth check (get_current_user from JWT)
    2. Validate input (length cap, non-empty)
    3. Rate-limit check + consume one message slot
    4. Embed the question (OpenAI)
    5. Top-k cosine search against doc_chunks (numpy)
    6. Call Groq with system prompt + retrieved chunks + question
    7. Persist user + assistant messages to chat_messages
    8. Record token counts to chat_usage
    9. Return { answer, sources, remaining_today }

No streaming in MVP. With Llama 3.1 8B on Groq this typically returns
in ~1s end-to-end, which is acceptable with a "..." spinner.
"""
from __future__ import annotations

import logging
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth_routes import get_current_user
from app.chatbot import embeddings, llm, rate_limit, vectorstore
from app.config import get_settings
from app.models.database import get_db
from app.models.schemas import ChatMessage, User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatRequest(BaseModel):
    question: str = Field(..., min_length=1)
    session_id: str | None = None  # client-generated UUID; created if omitted


class SourceRef(BaseModel):
    source_path: str
    section_title: str | None
    score: float


class ChatResponse(BaseModel):
    answer: str
    session_id: str
    sources: list[SourceRef]
    remaining_today: int


def _check_chat_permission(user: User) -> None:
    """Admins always pass. Everyone else needs the `chat` tab. We check
    against the relationship loaded by `get_current_user`, no extra query.
    """
    if user.is_admin:
        return
    tabs = {access.tab for access in (user.tab_access or [])}
    if "chat" not in tabs:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "No tienes acceso al asistente.",
        )


@router.post("", response_model=ChatResponse)
async def chat(
    payload: ChatRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
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
        # Surface a clear error instead of a 500 from the SDKs.
        logger.error("Chatbot keys not configured (OPENAI_API_KEY or GROQ_API_KEY missing)")
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "El asistente no está configurado en este entorno.",
        )

    # Rate-limit check (and reserve one message slot).
    allowed, remaining = await rate_limit.check_and_consume(db, user.id)
    if not allowed:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"Has alcanzado el límite diario de {settings.chatbot_daily_message_limit} mensajes. Inténtalo mañana.",
        )

    session_id = payload.session_id or str(uuid.uuid4())

    try:
        query_vec = embeddings.embed_text(question)
        retrieved = await vectorstore.search(db, query_vec, top_k=settings.chatbot_top_k)
        chunks_payload = [r.as_dict() for r in retrieved]
        answer, in_tokens, out_tokens = llm.complete(question, chunks_payload)
    except Exception as exc:
        # The reserved message slot still counts toward the daily limit
        # (we committed it above) — that's intentional, it prevents a
        # client retrying through transient errors and burning quota.
        logger.exception("Chat completion failed: %s", exc)
        await db.commit()
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "El asistente no pudo procesar tu pregunta. Inténtalo de nuevo.",
        )

    # Persist both messages.
    db.add(
        ChatMessage(
            user_id=user.id,
            session_id=session_id,
            role="user",
            content=question,
        )
    )
    db.add(
        ChatMessage(
            user_id=user.id,
            session_id=session_id,
            role="assistant",
            content=answer,
        )
    )
    await rate_limit.record_tokens(db, user.id, in_tokens, out_tokens)
    await db.commit()

    return ChatResponse(
        answer=answer,
        session_id=session_id,
        sources=[
            SourceRef(
                source_path=r.source_path,
                section_title=r.section_title,
                score=r.score,
            )
            for r in retrieved
        ],
        remaining_today=remaining,
    )
