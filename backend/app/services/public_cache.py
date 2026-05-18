"""In-process TTL cache for hot, unauthenticated, rarely-changing
public reads (landing endpoints).

The backend runs a single uvicorn worker (Dockerfile: no ``--workers``),
so a module-level instance is shared by every request — the same model
the in-memory ``RateLimiter`` relies on. Purpose: protect the DB from a
request flood (DDoS on the home). Thousands of concurrent identical
reads collapse to ~1 DB query per key per TTL window, and a per-key
single-flight lock prevents a thundering herd at TTL expiry (only one
coroutine recomputes; the rest await it and read the fresh value).

Values cached are plain JSON-able payloads (dicts/lists), never the
request ``AsyncSession`` — the factory only runs on a miss, with the
current request's db.
"""
from __future__ import annotations

import asyncio
import time
from typing import Any, Awaitable, Callable

# Default TTL for public landing reads, in seconds. These change only
# via admin writes; up to this much staleness on the landing is fine.
PUBLIC_TTL = 120


class TTLCache:
    def __init__(self) -> None:
        # key -> (expires_at_monotonic, value)
        self._store: dict[str, tuple[float, Any]] = {}
        self._locks: dict[str, asyncio.Lock] = {}

    def _lock(self, key: str) -> asyncio.Lock:
        lk = self._locks.get(key)
        if lk is None:
            lk = asyncio.Lock()
            self._locks[key] = lk
        return lk

    async def get_or_set(
        self, key: str, ttl: float, factory: Callable[[], Awaitable[Any]]
    ) -> Any:
        """Return the cached value for ``key`` if fresh, else run
        ``factory()`` (single-flight), cache the result for ``ttl``
        seconds, and return it."""
        hit = self._store.get(key)
        if hit is not None and hit[0] > time.monotonic():
            return hit[1]
        async with self._lock(key):
            # Re-check: another coroutine may have refreshed it while we
            # waited on the lock.
            hit = self._store.get(key)
            if hit is not None and hit[0] > time.monotonic():
                return hit[1]
            value = await factory()
            self._store[key] = (time.monotonic() + ttl, value)
            return value

    def clear(self) -> None:
        """Drop all cached values (used by tests for isolation)."""
        self._store.clear()


# Single shared instance (single worker → one cache for all requests).
public_cache = TTLCache()
