"""In-memory vector search over the `doc_chunks` table.

For our scale (a few hundred chunks at most) computing cosine similarity
in numpy at query time is the simplest, fastest, and zero-extra-deps
approach: ~1ms total for 500 chunks. If the doc set ever grows past a
few thousand chunks we'd swap this for sqlite-vec or migrate to Postgres
+ pgvector — same module API, different implementation.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

import numpy as np
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.chatbot.embeddings import bytes_to_vector
from app.models.schemas import DocChunk

logger = logging.getLogger(__name__)


@dataclass
class RetrievedChunk:
    id: int
    source_path: str
    section_title: str | None
    content: str
    score: float

    def as_dict(self) -> dict:
        return {
            "id": self.id,
            "source_path": self.source_path,
            "section_title": self.section_title,
            "content": self.content,
            "score": self.score,
        }


def _cosine_similarity(query: np.ndarray, matrix: np.ndarray) -> np.ndarray:
    """query: (D,), matrix: (N, D). Returns (N,) of cosine similarities.

    Vectors from OpenAI's text-embedding-3-small aren't unit-normalized
    by default, so we normalize both sides.
    """
    q_norm = query / (np.linalg.norm(query) + 1e-12)
    m_norms = np.linalg.norm(matrix, axis=1, keepdims=True) + 1e-12
    m_unit = matrix / m_norms
    return m_unit @ q_norm


async def search(
    db: AsyncSession,
    query_vec: np.ndarray,
    top_k: int = 5,
    min_score: float = 0.2,
) -> list[RetrievedChunk]:
    """Return the top-k most similar chunks above `min_score`."""
    result = await db.execute(select(DocChunk))
    chunks = result.scalars().all()
    if not chunks:
        return []

    dim = chunks[0].embedding_dim
    matrix = np.stack([bytes_to_vector(c.embedding, dim) for c in chunks])
    scores = _cosine_similarity(query_vec, matrix)

    # Argsort descending, then trim to top_k and filter by min_score.
    order = np.argsort(-scores)
    out: list[RetrievedChunk] = []
    for idx in order[:top_k]:
        score = float(scores[idx])
        if score < min_score:
            break
        c = chunks[idx]
        out.append(
            RetrievedChunk(
                id=c.id,
                source_path=c.source_path,
                section_title=c.section_title,
                content=c.content,
                score=score,
            )
        )
    return out
