"""Admin API tests for session-type listing and override management.

Tests hit the FastAPI app directly via httpx.AsyncClient + ASGITransport.
Admin auth is bypassed by overriding `require_admin` to return a mock User.
The DB is overridden by `get_db` to use the in-memory SQLite fixture from
conftest.py (same `db_session` fixture used by other ranking DB tests).
"""
from __future__ import annotations

import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from app.api.auth_routes import require_admin
from app.models.database import get_db
from app.models.schemas import Base, Driver, SessionResult, RankingSessionOverride, User


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

class _FakeAdmin:
    """Minimal stand-in for a User that satisfies the admin guard return."""
    id = 1
    username = "test_admin"
    is_admin = True


def _fake_admin():
    return _FakeAdmin()


def _app_with_overrides(db_session):
    """Return the FastAPI app with auth + DB dependencies overridden."""
    from app.main import app

    async def _override_require_admin():
        return _fake_admin()

    async def _override_get_db():
        yield db_session

    app.dependency_overrides[require_admin] = _override_require_admin
    app.dependency_overrides[get_db] = _override_get_db
    return app


async def _seed_session(db_session):
    """Insert two minimal SessionResult rows for one session."""
    # SessionResult requires a driver_id FK → insert a driver first.
    driver_a = Driver(canonical_name="DRIVER_A", normalized_key="DRIVER_A")
    driver_b = Driver(canonical_name="DRIVER_B", normalized_key="DRIVER_B")
    db_session.add_all([driver_a, driver_b])
    await db_session.flush()

    rows = [
        SessionResult(
            circuit_name="Santos",
            log_date="2026-04-25",
            session_seq=1,
            title1="12H LOS SANTOS",
            title2="Clasificación",
            driver_id=driver_a.id,
            total_laps=5,
            best_lap_ms=64000,
            avg_lap_ms=64500.0,
            median_lap_ms=64300,
            kart_bias_ms=0.0,
            corrected_avg_ms=64500.0,
            team_name="",
            duration_s=600,
            session_type="pace",
            team_mode="individual",
        ),
        SessionResult(
            circuit_name="Santos",
            log_date="2026-04-25",
            session_seq=1,
            title1="12H LOS SANTOS",
            title2="Clasificación",
            driver_id=driver_b.id,
            total_laps=5,
            best_lap_ms=65000,
            avg_lap_ms=65500.0,
            median_lap_ms=65200,
            kart_bias_ms=0.0,
            corrected_avg_ms=65500.0,
            team_name="",
            duration_s=600,
            session_type="pace",
            team_mode="individual",
        ),
    ]
    db_session.add_all(rows)
    await db_session.flush()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


async def test_get_sessions_returns_session_with_no_forced_type(db_session):
    await _seed_session(db_session)
    app = _app_with_overrides(db_session)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/admin/ranking/sessions")
        assert resp.status_code == 200
        sessions = resp.json()
        assert len(sessions) == 1
        s = sessions[0]
        assert s["circuit_name"] == "Santos"
        assert s["log_date"] == "2026-04-25"
        assert s["session_seq"] == 1
        assert s["title1"] == "12H LOS SANTOS"
        assert s["title2"] == "Clasificación"
        assert s["session_type"] == "pace"
        assert s["driver_count"] == 2
        assert s["forced_type"] is None
    finally:
        app.dependency_overrides.clear()


async def test_post_session_type_creates_override(db_session):
    await _seed_session(db_session)
    app = _app_with_overrides(db_session)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/admin/ranking/session-type",
                json={
                    "circuit_name": "Santos",
                    "log_date": "2026-04-25",
                    "session_seq": 1,
                    "forced_type": "pace",
                },
            )
        assert resp.status_code == 200
        body = resp.json()
        assert body["forced_type"] == "pace"

        # Confirm row in DB
        rows = (await db_session.execute(select(RankingSessionOverride))).scalars().all()
        assert len(rows) == 1
        assert rows[0].forced_type == "pace"
    finally:
        app.dependency_overrides.clear()


async def test_get_sessions_after_override_shows_forced_type(db_session):
    await _seed_session(db_session)
    db_session.add(
        RankingSessionOverride(
            circuit_name="Santos",
            log_date="2026-04-25",
            session_seq=1,
            forced_type="pace",
            title1="12H LOS SANTOS",
            title2="Clasificación",
        )
    )
    await db_session.flush()

    app = _app_with_overrides(db_session)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/admin/ranking/sessions")
        assert resp.status_code == 200
        s = resp.json()[0]
        assert s["forced_type"] == "pace"
    finally:
        app.dependency_overrides.clear()


async def test_post_session_type_upsert_changes_type(db_session):
    """Second POST with different forced_type → still one row, updated value."""
    await _seed_session(db_session)
    app = _app_with_overrides(db_session)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            await client.post(
                "/api/admin/ranking/session-type",
                json={"circuit_name": "Santos", "log_date": "2026-04-25",
                      "session_seq": 1, "forced_type": "pace"},
            )
            resp = await client.post(
                "/api/admin/ranking/session-type",
                json={"circuit_name": "Santos", "log_date": "2026-04-25",
                      "session_seq": 1, "forced_type": "race"},
            )
        assert resp.status_code == 200
        assert resp.json()["forced_type"] == "race"

        rows = (await db_session.execute(select(RankingSessionOverride))).scalars().all()
        assert len(rows) == 1
        assert rows[0].forced_type == "race"
    finally:
        app.dependency_overrides.clear()


async def test_post_session_type_invalid_forced_type_returns_422(db_session):
    await _seed_session(db_session)
    app = _app_with_overrides(db_session)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/admin/ranking/session-type",
                json={"circuit_name": "Santos", "log_date": "2026-04-25",
                      "session_seq": 1, "forced_type": "bogus"},
            )
        assert resp.status_code == 422
    finally:
        app.dependency_overrides.clear()


async def test_delete_session_type_removes_override(db_session):
    await _seed_session(db_session)
    db_session.add(
        RankingSessionOverride(
            circuit_name="Santos",
            log_date="2026-04-25",
            session_seq=1,
            forced_type="pace",
            title1="12H LOS SANTOS",
            title2="Clasificación",
        )
    )
    await db_session.flush()

    app = _app_with_overrides(db_session)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.delete(
                "/api/admin/ranking/session-type",
                params={
                    "circuit_name": "Santos",
                    "log_date": "2026-04-25",
                    "session_seq": 1,
                },
            )
        assert resp.status_code == 200

        rows = (await db_session.execute(select(RankingSessionOverride))).scalars().all()
        assert rows == []
    finally:
        app.dependency_overrides.clear()


async def test_delete_session_type_idempotent(db_session):
    """DELETE when no override exists still returns 200."""
    await _seed_session(db_session)
    app = _app_with_overrides(db_session)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.delete(
                "/api/admin/ranking/session-type",
                params={
                    "circuit_name": "Santos",
                    "log_date": "2026-04-25",
                    "session_seq": 1,
                },
            )
        assert resp.status_code == 200
    finally:
        app.dependency_overrides.clear()


async def test_delete_then_get_shows_no_forced_type(db_session):
    await _seed_session(db_session)
    db_session.add(
        RankingSessionOverride(
            circuit_name="Santos",
            log_date="2026-04-25",
            session_seq=1,
            forced_type="race",
            title1="12H LOS SANTOS",
            title2="Clasificación",
        )
    )
    await db_session.flush()

    app = _app_with_overrides(db_session)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            await client.delete(
                "/api/admin/ranking/session-type",
                params={"circuit_name": "Santos", "log_date": "2026-04-25", "session_seq": 1},
            )
            resp = await client.get("/api/admin/ranking/sessions")
        assert resp.status_code == 200
        s = resp.json()[0]
        assert s["forced_type"] is None
    finally:
        app.dependency_overrides.clear()


async def test_post_session_type_persists_across_separate_session():
    """Cross-session persistence: proves commit() actually wrote to the DB.

    Uses a fresh engine + per-call session approach (prod-like), then opens a
    SECOND independent session on the SAME engine and asserts the row is
    visible — something a shared-session test with only flush() cannot catch.
    This test will FAIL if flush() is used instead of commit().
    """
    from app.main import app

    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

    class _FakeAdmin2:
        id = 1
        username = "test_admin"
        is_admin = True

    async def _override_require_admin():
        return _FakeAdmin2()

    async def _override_get_db_fresh():
        """Yield a brand-new session per call — mirrors production get_db."""
        async with SessionLocal() as session:
            yield session

    app.dependency_overrides[require_admin] = _override_require_admin
    app.dependency_overrides[get_db] = _override_get_db_fresh

    try:
        # Seed a driver + session result so the endpoint can snapshot titles.
        async with SessionLocal() as seed_session:
            driver = Driver(canonical_name="DRIVER_X", normalized_key="DRIVER_X")
            seed_session.add(driver)
            await seed_session.flush()
            sr = SessionResult(
                circuit_name="CrossTest",
                log_date="2026-05-01",
                session_seq=1,
                title1="CROSS TITLE",
                title2="Q1",
                driver_id=driver.id,
                total_laps=3,
                best_lap_ms=60000,
                avg_lap_ms=61000.0,
                median_lap_ms=60500,
                kart_bias_ms=0.0,
                corrected_avg_ms=61000.0,
                team_name="",
                duration_s=300,
                session_type="pace",
                team_mode="individual",
            )
            seed_session.add(sr)
            await seed_session.commit()

        # Issue the POST using the prod-like per-call session override.
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/admin/ranking/session-type",
                json={
                    "circuit_name": "CrossTest",
                    "log_date": "2026-05-01",
                    "session_seq": 1,
                    "forced_type": "race",
                },
            )
        assert resp.status_code == 200, resp.text
        assert resp.json()["forced_type"] == "race"

        # Open a completely separate session on the same engine and assert
        # the row is there.  A missing commit() makes this assertion fail.
        async with SessionLocal() as verify_session:
            rows = (
                await verify_session.execute(select(RankingSessionOverride))
            ).scalars().all()
            assert len(rows) == 1, (
                "RankingSessionOverride row not visible in a separate session — "
                "endpoint used flush() instead of commit()"
            )
            assert rows[0].forced_type == "race"
    finally:
        app.dependency_overrides.clear()
        await engine.dispose()
