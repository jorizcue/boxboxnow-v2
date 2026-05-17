"""Regression: init_db() must NOT re-grant tabs a paid plan excludes.

Root cause (2026-05-17): the legacy basic_tabs seed + analytics→insights /
driver→driver-config migrations in init_db() ran on every startup and
re-injected adjusted/replay/insights onto every paid user, clobbering
_apply_config_to_user (the source of truth for paid entitlements).
"""
from __future__ import annotations

import sys
import types

import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

# Stub `resend` before any app import that transitively loads email_service.
sys.modules.setdefault(
    "resend",
    types.SimpleNamespace(
        api_key=None,
        Emails=types.SimpleNamespace(send=lambda *a, **k: None),
    ),
)

import app.models.database as database_mod  # noqa: E402
from app.models.database import init_db  # noqa: E402
from app.models.schemas import Base, User, UserTabAccess  # noqa: E402

# Mirrors the real endurance_pro_monthly plan config (product_tab_config
# id=3): a paid plan that legitimately EXCLUDES adjusted / replay / insights.
PAID_PLAN_TABS = [
    "race", "pit", "live", "config", "driver-config", "analytics",
    "app-config-carrera", "app-config-box", "app-config-visualizacion",
    "app-config-plantillas", "app-config-gps-racebox", "driver", "chat",
]


@pytest_asyncio.fixture
async def test_engine(monkeypatch):
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    # init_db() uses the module-level engine; redirect it to this in-memory DB.
    monkeypatch.setattr(database_mod, "engine", engine)
    yield engine
    await engine.dispose()


async def test_init_db_does_not_readd_tabs_excluded_by_paid_plan(test_engine):
    Session = async_sessionmaker(test_engine, expire_on_commit=False)

    async with Session() as s:
        user = User(
            username="paiduser",
            email="paid@example.com",
            password_hash="x",
            is_admin=False,
            email_verified=True,
        )
        s.add(user)
        await s.flush()
        uid = user.id
        for tab in PAID_PLAN_TABS:
            s.add(UserTabAccess(user_id=uid, tab=tab))
        await s.commit()

    # Run the real startup migration path against the in-memory DB.
    await init_db()

    async with Session() as s:
        rows = await s.execute(
            select(UserTabAccess.tab).where(UserTabAccess.user_id == uid)
        )
        tabs = sorted(t[0] for t in rows.all())

    assert tabs == sorted(PAID_PLAN_TABS), (
        f"init_db() mutated the paid user's tabs.\n"
        f"expected={sorted(PAID_PLAN_TABS)}\nactual={tabs}"
    )
    for leaked in ("adjusted", "replay", "insights"):
        assert leaked not in tabs, f"{leaked!r} was re-added by the init_db backfill"


async def test_init_db_does_not_lock_out_or_overgrant_legacy_user(test_engine):
    """No-lockout guard: a user with a minimal curated tab set keeps
    exactly that set after init_db() — nothing added, nothing removed.
    Pre-fix, the basic_tabs backfill would have added race/pit/live's
    siblings (adjusted, driver, config, replay, analytics) on top."""
    minimal_tabs = ["race", "pit", "live"]
    Session = async_sessionmaker(test_engine, expire_on_commit=False)

    async with Session() as s:
        user = User(
            username="legacyfree",
            email="legacy@example.com",
            password_hash="x",
            is_admin=False,
            email_verified=True,
        )
        s.add(user)
        await s.flush()
        uid = user.id
        for tab in minimal_tabs:
            s.add(UserTabAccess(user_id=uid, tab=tab))
        await s.commit()

    await init_db()

    async with Session() as s:
        rows = await s.execute(
            select(UserTabAccess.tab).where(UserTabAccess.user_id == uid)
        )
        tabs = sorted(t[0] for t in rows.all())

    assert tabs == sorted(minimal_tabs), (
        f"init_db() mutated a minimal-set user's tabs.\n"
        f"expected={sorted(minimal_tabs)}\nactual={tabs}"
    )
