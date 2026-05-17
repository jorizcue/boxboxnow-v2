"""Tests for the google_auth_enabled platform toggle (spec 2026-05-17).

Covers:
- /api/public/site-status returns google_auth_enabled (False when absent/false, True when "true")
- GET /api/auth/google returns 403 when disabled, NOT 403 when enabled
- GET /api/auth/google/ios is NOT affected by the flag (no new 403 from this feature)
- Admin GET/PUT /api/admin/platform-settings round-trips google_auth_enabled
"""
from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import select

from app.models.schemas import Base, AppSetting
from app.models.database import get_db


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def db_session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as s:
        yield s
    await engine.dispose()


class _FakeAdmin:
    id = 1
    username = "test_admin"
    is_admin = True


def _app_with_db(db_session):
    """Override get_db only (public routes)."""
    from app.main import app

    async def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    return app


def _app_with_admin_and_db(db_session):
    """Override both get_db and require_admin (admin routes)."""
    from app.main import app
    from app.api.auth_routes import require_admin

    async def _override_get_db():
        yield db_session

    async def _override_require_admin():
        return _FakeAdmin()

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[require_admin] = _override_require_admin
    return app


# ---------------------------------------------------------------------------
# site-status tests
# ---------------------------------------------------------------------------


async def test_site_status_google_auth_disabled_when_key_absent(db_session):
    """/api/public/site-status: google_auth_enabled=False when key absent."""
    app = _app_with_db(db_session)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/public/site-status")
    finally:
        app.dependency_overrides.clear()

    assert resp.status_code == 200
    data = resp.json()
    assert "google_auth_enabled" in data
    assert data["google_auth_enabled"] is False


async def test_site_status_google_auth_enabled_when_value_true(db_session):
    """/api/public/site-status: google_auth_enabled=True when row value is "true"."""
    db_session.add(AppSetting(key="google_auth_enabled", value="true"))
    await db_session.flush()

    app = _app_with_db(db_session)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/public/site-status")
    finally:
        app.dependency_overrides.clear()

    assert resp.status_code == 200
    data = resp.json()
    assert data["google_auth_enabled"] is True


async def test_site_status_google_auth_disabled_when_value_false(db_session):
    """/api/public/site-status: google_auth_enabled=False when row value is "false"."""
    db_session.add(AppSetting(key="google_auth_enabled", value="false"))
    await db_session.flush()

    app = _app_with_db(db_session)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/public/site-status")
    finally:
        app.dependency_overrides.clear()

    assert resp.status_code == 200
    data = resp.json()
    assert data["google_auth_enabled"] is False


# ---------------------------------------------------------------------------
# Auth /google toggle guard tests
# ---------------------------------------------------------------------------


async def test_google_login_403_when_disabled_absent(db_session):
    """GET /api/auth/google → 403 when google_auth_enabled key is absent."""
    app = _app_with_db(db_session)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/auth/google")
    finally:
        app.dependency_overrides.clear()

    assert resp.status_code == 403
    assert resp.json()["detail"] == "Google login deshabilitado"


async def test_google_login_403_when_disabled_false(db_session):
    """GET /api/auth/google → 403 when google_auth_enabled is explicitly "false"."""
    db_session.add(AppSetting(key="google_auth_enabled", value="false"))
    await db_session.flush()

    app = _app_with_db(db_session)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/auth/google")
    finally:
        app.dependency_overrides.clear()

    assert resp.status_code == 403
    assert resp.json()["detail"] == "Google login deshabilitado"


async def test_google_login_not_403_when_enabled(db_session):
    """GET /api/auth/google → NOT 403 when google_auth_enabled="true" (toggle passed).

    Without a real google_client_id configured, FastAPI returns 501 —
    that means the guard was passed and it reached the next check.
    """
    db_session.add(AppSetting(key="google_auth_enabled", value="true"))
    await db_session.flush()

    app = _app_with_db(db_session)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/auth/google")
    finally:
        app.dependency_overrides.clear()

    # Must NOT be 403 — the toggle guard passed.
    # Without google_client_id it'll be 501 (not configured), which is fine.
    assert resp.status_code != 403, (
        f"Expected NOT 403 when toggle is enabled, got {resp.status_code}: {resp.json()}"
    )


# ---------------------------------------------------------------------------
# Native route NOT affected by toggle
# ---------------------------------------------------------------------------


async def test_google_ios_not_affected_by_toggle(db_session):
    """GET /api/auth/google/ios → NOT 403 from the new toggle (native route is exempt).

    Without google_client_id the native route returns 501 (not configured).
    The point is it must not return the new 403 "Google login deshabilitado".
    """
    # flag is explicitly OFF
    db_session.add(AppSetting(key="google_auth_enabled", value="false"))
    await db_session.flush()

    app = _app_with_db(db_session)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/auth/google/ios")
    finally:
        app.dependency_overrides.clear()

    # Should NOT be 403 from the new guard; may be 501 (no google_client_id configured)
    assert resp.status_code != 403 or resp.json().get("detail") != "Google login deshabilitado", (
        "Native /google/ios must not be affected by the web toggle guard"
    )


# ---------------------------------------------------------------------------
# Admin platform settings round-trip
# ---------------------------------------------------------------------------


async def test_admin_platform_settings_round_trip_google_auth_enabled(db_session):
    """PUT /api/admin/platform-settings with google_auth_enabled=true, then GET returns it."""
    app = _app_with_admin_and_db(db_session)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            # PUT to enable the flag
            put_resp = await client.put(
                "/api/admin/platform-settings",
                json={"google_auth_enabled": "true"},
            )
            assert put_resp.status_code == 200
            put_data = put_resp.json()
            assert put_data.get("google_auth_enabled") == "true"

            # GET to verify persistence
            get_resp = await client.get("/api/admin/platform-settings")
            assert get_resp.status_code == 200
            get_data = get_resp.json()
            assert get_data.get("google_auth_enabled") == "true"
    finally:
        app.dependency_overrides.clear()


async def test_admin_platform_settings_default_google_auth_enabled_is_false(db_session):
    """GET /api/admin/platform-settings returns google_auth_enabled="false" by default."""
    app = _app_with_admin_and_db(db_session)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            get_resp = await client.get("/api/admin/platform-settings")
            assert get_resp.status_code == 200
            get_data = get_resp.json()
            assert "google_auth_enabled" in get_data
            assert get_data["google_auth_enabled"] == "false"
    finally:
        app.dependency_overrides.clear()
