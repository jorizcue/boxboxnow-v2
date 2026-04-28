"""Ingest CLI: walk `docs/chatbot/`, split into chunks, embed, insert.

Usage from project root:
    python -m app.chatbot.ingest                     # uses default ./docs/chatbot
    python -m app.chatbot.ingest --docs path/to/dir  # custom path
    python -m app.chatbot.ingest --reset             # wipe existing chunks first

Chunking strategy: split on Markdown headers (## and ###). Each chunk
keeps its surrounding section title for both display ("which doc is
this?") and as a hint to the embedder ("this chunk is about X"). Files
in the docs directory should be self-contained — assume the user lands
on a chunk in isolation, no surrounding context.
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import re
import sys
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import delete

from app.chatbot.embeddings import embed_texts, vector_to_bytes
from app.config import get_settings
from app.models.database import async_session, init_db
from app.models.schemas import DocChunk

logger = logging.getLogger(__name__)

# Default docs location. Two layouts to support:
#   - Local dev: <repo_root>/docs/chatbot, with the backend living at
#     <repo_root>/backend/app/chatbot/ingest.py (parents[3] = repo root).
#   - Docker container: docs/ is mounted at /app/docs (see docker-compose.yml),
#     and ingest.py lives at /app/app/chatbot/ingest.py (parents[2] = /app).
# We try both and use whichever exists.
def _resolve_default_docs_dir() -> Path:
    here = Path(__file__).resolve()
    candidates = [
        here.parents[2] / "docs" / "chatbot",   # container layout
        here.parents[3] / "docs" / "chatbot",   # local dev layout
    ]
    for c in candidates:
        if c.exists():
            return c
    return candidates[0]  # fall back so the error message is informative


DEFAULT_DOCS_DIR = _resolve_default_docs_dir()

# Target chunk size in characters. ~500 tokens for Spanish. Small enough
# to fit several chunks in the LLM context, big enough that the chunk
# is self-explanatory.
TARGET_CHUNK_CHARS = 1500


@dataclass
class Chunk:
    source_path: str
    section_title: str | None
    content: str


def _split_markdown(text: str) -> list[tuple[str | None, str]]:
    """Split markdown on H2/H3 headers. Returns [(section_title, body), ...]."""
    lines = text.splitlines()
    sections: list[tuple[str | None, list[str]]] = [(None, [])]

    header_re = re.compile(r"^(#{1,3})\s+(.+?)\s*$")
    for line in lines:
        m = header_re.match(line)
        if m and len(m.group(1)) <= 3:
            # Start a new section. The first H1 becomes the title for
            # the leading body too if there's nothing above it.
            title = m.group(2).strip()
            if sections[0][0] is None and not "".join(sections[0][1]).strip():
                sections[0] = (title, sections[0][1])
            else:
                sections.append((title, []))
            continue
        sections[-1][1].append(line)

    return [(title, "\n".join(body).strip()) for title, body in sections if "\n".join(body).strip()]


def _split_long_section(title: str | None, body: str) -> list[tuple[str | None, str]]:
    """If a single section is bigger than TARGET_CHUNK_CHARS, split it on
    blank lines (paragraph boundary)."""
    if len(body) <= TARGET_CHUNK_CHARS:
        return [(title, body)]

    out: list[tuple[str | None, str]] = []
    current = ""
    for paragraph in re.split(r"\n\s*\n", body):
        if not paragraph.strip():
            continue
        if len(current) + len(paragraph) + 2 > TARGET_CHUNK_CHARS and current:
            out.append((title, current.strip()))
            current = paragraph
        else:
            current = f"{current}\n\n{paragraph}" if current else paragraph
    if current.strip():
        out.append((title, current.strip()))
    return out


def chunk_file(path: Path, repo_root: Path) -> list[Chunk]:
    """Read a Markdown file and return its chunks."""
    text = path.read_text(encoding="utf-8")
    rel = path.relative_to(repo_root).as_posix()
    chunks: list[Chunk] = []
    for title, body in _split_markdown(text):
        for sub_title, sub_body in _split_long_section(title, body):
            chunks.append(Chunk(source_path=rel, section_title=sub_title, content=sub_body))
    return chunks


async def ingest(docs_dir: Path, reset: bool = False) -> int:
    """Index all .md files under `docs_dir`. Returns total chunks indexed."""
    settings = get_settings()
    if not settings.openai_api_key:
        print("ERROR: OPENAI_API_KEY is not set in .env — required for embedding.")
        sys.exit(1)

    if not docs_dir.exists():
        print(f"ERROR: docs directory not found: {docs_dir}")
        sys.exit(1)

    md_files = sorted(p for p in docs_dir.rglob("*.md") if p.name != "README.md")
    if not md_files:
        print(f"WARN: no .md files found in {docs_dir} (other than README.md)")
        return 0

    repo_root = docs_dir.parent.parent
    all_chunks: list[Chunk] = []
    for path in md_files:
        file_chunks = chunk_file(path, repo_root)
        print(f"  {path.relative_to(repo_root)}: {len(file_chunks)} chunks")
        all_chunks.extend(file_chunks)

    if not all_chunks:
        print("No chunks extracted (empty files?). Aborting.")
        return 0

    print(f"\nEmbedding {len(all_chunks)} chunks with {settings.chatbot_embed_model}...")
    # OpenAI accepts batches; embed in groups of 64 to avoid request size limits.
    BATCH = 64
    vectors = []
    for i in range(0, len(all_chunks), BATCH):
        batch = all_chunks[i : i + BATCH]
        vectors.extend(embed_texts([c.content for c in batch]))
        print(f"  embedded {min(i + BATCH, len(all_chunks))}/{len(all_chunks)}")

    dim = int(vectors[0].shape[0])

    await init_db()
    async with async_session() as db:
        if reset:
            await db.execute(delete(DocChunk))
            print("Wiped existing doc_chunks rows.")

        for chunk, vec in zip(all_chunks, vectors):
            db.add(
                DocChunk(
                    source_path=chunk.source_path,
                    section_title=chunk.section_title,
                    content=chunk.content,
                    token_count=len(chunk.content) // 4,  # rough estimate
                    embedding=vector_to_bytes(vec),
                    embedding_dim=dim,
                    embedding_model=settings.chatbot_embed_model,
                )
            )
        await db.commit()

    print(f"\nDone. Indexed {len(all_chunks)} chunks.")
    return len(all_chunks)


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest chatbot docs into doc_chunks.")
    parser.add_argument(
        "--docs",
        type=Path,
        default=DEFAULT_DOCS_DIR,
        help=f"Docs directory (default: {DEFAULT_DOCS_DIR})",
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Delete all existing chunks before indexing.",
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    asyncio.run(ingest(args.docs, reset=args.reset))


if __name__ == "__main__":
    main()
