"""Groq chat-completion client.

Groq exposes an OpenAI-compatible API, so we reuse the OpenAI SDK pointed
at `api.groq.com`. Default model is `llama-3.1-8b-instant` — fast, free
tier, good Spanish.
"""
from __future__ import annotations

import logging
from functools import lru_cache

from openai import OpenAI

from app.config import get_settings

logger = logging.getLogger(__name__)

GROQ_BASE_URL = "https://api.groq.com/openai/v1"

# Tuned for the support-agent role: refuse to invent answers, always
# fall back to "no tengo información sobre eso" if the retrieved context
# doesn't cover the question. Spanish, since the app's UI is in Spanish.
SYSTEM_PROMPT = """\
Eres el asistente de soporte de BoxBoxNow, una plataforma de estrategia
en tiempo real para carreras de karts de resistencia.

REGLAS IMPORTANTES:
1. Responde SOLO con la información que aparece en los FRAGMENTOS de
   documentación que se te proporcionan. No inventes datos, números ni
   funcionalidades.
2. Si la respuesta no está en los fragmentos, di exactamente:
   "No tengo información sobre eso en la documentación. Contacta con
   soporte si necesitas ayuda específica."
3. Responde siempre en español, de forma clara y concisa. Usa listas
   y negritas cuando ayude a la legibilidad.
4. No inventes nombres de menús, botones o pantallas que no aparezcan
   en los fragmentos.
5. Si te preguntan algo que no es sobre BoxBoxNow (programación
   general, historia, opiniones personales, etc.), declina amablemente
   y recuérdale al usuario que solo puedes ayudar con dudas de la app.
"""


@lru_cache(maxsize=1)
def _client() -> OpenAI:
    settings = get_settings()
    if not settings.groq_api_key:
        raise RuntimeError(
            "GROQ_API_KEY is not set — required for chatbot LLM calls."
        )
    return OpenAI(api_key=settings.groq_api_key, base_url=GROQ_BASE_URL)


def build_user_message(question: str, chunks: list[dict]) -> str:
    """Build the user-role message: retrieved context + the question."""
    if chunks:
        formatted = "\n\n---\n\n".join(
            f"[{c.get('section_title') or c.get('source_path')}]\n{c['content']}"
            for c in chunks
        )
        context_block = f"FRAGMENTOS DE LA DOCUMENTACIÓN:\n\n{formatted}\n\n---\n\n"
    else:
        context_block = "FRAGMENTOS DE LA DOCUMENTACIÓN: (ninguno relevante encontrado)\n\n---\n\n"
    return f"{context_block}PREGUNTA DEL USUARIO: {question}"


def complete(question: str, chunks: list[dict]) -> tuple[str, int, int]:
    """Run a single chat completion. Returns (answer, input_tokens, output_tokens).

    No streaming in MVP — the frontend just spinners while we wait. With
    Llama 3.1 8B on Groq this typically returns in ~1 second.
    """
    settings = get_settings()
    response = _client().chat.completions.create(
        model=settings.chatbot_llm_model,
        max_tokens=settings.chatbot_max_output_tokens,
        temperature=0.2,  # low — we want grounded answers, not creativity
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": build_user_message(question, chunks)},
        ],
    )
    answer = (response.choices[0].message.content or "").strip()
    usage = response.usage
    in_tokens = usage.prompt_tokens if usage else 0
    out_tokens = usage.completion_tokens if usage else 0
    return answer, in_tokens, out_tokens
