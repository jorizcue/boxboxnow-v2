"""Regression test: reset_password handler must not crash with a naive
password_reset_expires datetime (SQLite stores them naive, but the handler
was comparing them to tz-aware datetime.now(timezone.utc) → TypeError → 500).

The test seeds a User with a NAIVE future expires, calls the handler via
the in-memory DB fixture, and asserts it returns success (ok=True) and that
the password was actually updated.

This test FAILS before the timezone-normalization fix and PASSES after it.
"""
from __future__ import annotations

import pytest
import pytest_asyncio
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import select

from app.models.schemas import Base, User
from app.models.database import get_db
from app.api.auth_routes import reset_password, hash_password


# ---------------------------------------------------------------------------
# In-memory DB fixture (mirrors ranking/conftest.py pattern)
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def db():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as s:
        yield s
    await engine.dispose()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

class _FakeRequest:
    """Minimal Request stand-in whose .json() returns a fixed body."""
    def __init__(self, body: dict):
        self._body = body

    async def json(self):
        return self._body


# ---------------------------------------------------------------------------
# Test
# ---------------------------------------------------------------------------

async def test_reset_password_naive_expires_does_not_raise(db):
    """Regression: naive password_reset_expires must not cause a 500.

    Before fix: comparing naive datetime to tz-aware raises TypeError.
    After fix:  the naive datetime is normalized to UTC first → works.
    """
    token = "validtoken123"

    # Seed a User with a NAIVE future expiry (simulates SQLite round-trip).
    user = User(
        username="testuser_tz",
        email="tz@example.com",
        password_hash=hash_password("oldpassword"),
        is_admin=False,
        max_devices=1,
        password_reset_token=token,
        # Intentionally NAIVE — no tzinfo — as SQLite returns it.
        password_reset_expires=datetime.utcnow() + timedelta(hours=1),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    # Verify the seeded datetime is indeed naive (no tzinfo).
    assert user.password_reset_expires.tzinfo is None, \
        "Test setup error: expires should be naive for this regression to be meaningful"

    # Call the handler directly, overriding get_db with our in-memory session.
    request = _FakeRequest({"token": token, "password": "newpassword99"})

    async def _override_get_db():
        yield db

    # Patch dependency: we call the handler function directly with db injected.
    result = await reset_password(request, db=db)

    assert result == {"ok": True, "message": "Contrasena actualizada correctamente"}

    # Verify the password was actually changed in the DB.
    refreshed = (await db.execute(select(User).where(User.id == user.id))).scalar_one()
    assert refreshed.password_reset_token is None
    assert refreshed.password_reset_expires is None
    # The old hash must no longer match the new password (changed).
    import bcrypt
    assert bcrypt.checkpw(b"newpassword99", refreshed.password_hash.encode()), \
        "Password hash should match new password after reset"
