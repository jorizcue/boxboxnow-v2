"""RAG-based support chatbot.

Pipeline:
  ingest.py     → splits Markdown docs in `docs/chatbot/` into chunks,
                  embeds them with OpenAI, stores BLOBs in `doc_chunks`.
  routes.py     → POST /api/chat: rate-limit check → embed question →
                  cosine-similarity top-k against `doc_chunks` → call Groq
                  with retrieved chunks as context → return answer.
  rate_limit.py → per-user daily message/token cap to keep costs bounded.

The vector search is done in-memory with numpy: at our scale (~hundreds
of chunks) it's microseconds per query and lets us avoid pgvector or any
extra extension (we run on SQLite).
"""
