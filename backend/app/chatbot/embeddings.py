"""OpenAI embeddings client.

We use `text-embedding-3-small` (1536 dims, ~$0.02 per million tokens —
practically free at our volume). The vector is returned as a numpy
float32 array so it can be serialized to bytes for SQLite storage and
loaded back without any conversion overhead at query time.
"""
from __future__ import annotations

import logging
from functools import lru_cache

import numpy as np
from openai import OpenAI

from app.config import get_settings

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _client() -> OpenAI:
    settings = get_settings()
    if not settings.openai_api_key:
        raise RuntimeError(
            "OPENAI_API_KEY is not set — required for chatbot embeddings."
        )
    return OpenAI(api_key=settings.openai_api_key)


def embed_text(text: str) -> np.ndarray:
    """Embed a single string. Returns a 1-D float32 numpy array."""
    return embed_texts([text])[0]


def embed_texts(texts: list[str]) -> list[np.ndarray]:
    """Embed a batch of strings. Returns a list of 1-D float32 numpy
    arrays in the same order as the input."""
    if not texts:
        return []
    settings = get_settings()
    response = _client().embeddings.create(
        model=settings.chatbot_embed_model,
        input=texts,
    )
    return [np.asarray(d.embedding, dtype=np.float32) for d in response.data]


def vector_to_bytes(vec: np.ndarray) -> bytes:
    """Serialize a float32 vector for SQLite BLOB storage."""
    return np.ascontiguousarray(vec, dtype=np.float32).tobytes()


def bytes_to_vector(blob: bytes, dim: int) -> np.ndarray:
    """Inverse of `vector_to_bytes`."""
    return np.frombuffer(blob, dtype=np.float32, count=dim)
