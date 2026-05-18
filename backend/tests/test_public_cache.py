"""TDD — in-process TTL cache for hot public landing reads.

Unit-level: hit/miss, TTL expiry, single-flight (one factory run under a
concurrent stampede). Endpoint-level: the four cached public endpoints
serve a stale cached payload within the TTL (DB is *not* re-queried),
``site-status`` keeps ``now`` fresh per request, and ``/plans`` is keyed
per ``lang``.
"""
from __future__ import annotations

import asyncio
import sys
import types
from unittest.mock import MagicMock

import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

if "resend" not in sys.modules:
    _r = types.ModuleType("resend"); _r.api_key = None; _r.Emails = MagicMock()
    sys.modules["resend"] = _r

from app.services.public_cache import TTLCache  # noqa: E402
from app.api.public_routes import (  # noqa: E402
    list_public_circuits,
    list_plans,
    site_status,
)
from app.api.auth_routes import get_trial_config  # noqa: E402
from app.models.schemas import Base, Circuit, AppSetting, ProductTabConfig  # noqa: E402


@pytest_asyncio.fixture
async def db():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as s:
        yield s
    await engine.dispose()


# ---------------------------------------------------------------- unit

async def test_hit_does_not_rerun_factory():
    cache = TTLCache()
    calls = 0

    async def factory():
        nonlocal calls
        calls += 1
        return calls

    a = await cache.get_or_set("k", 60, factory)
    b = await cache.get_or_set("k", 60, factory)
    assert a == b == 1
    assert calls == 1


async def test_expiry_reruns_factory():
    cache = TTLCache()
    calls = 0

    async def factory():
        nonlocal calls
        calls += 1
        return calls

    assert await cache.get_or_set("k", 0.05, factory) == 1
    await asyncio.sleep(0.06)
    assert await cache.get_or_set("k", 0.05, factory) == 2
    assert calls == 2


async def test_single_flight_under_stampede():
    cache = TTLCache()
    calls = 0

    async def slow_factory():
        nonlocal calls
        calls += 1
        await asyncio.sleep(0.05)
        return "v"

    results = await asyncio.gather(
        *[cache.get_or_set("k", 60, slow_factory) for _ in range(25)]
    )
    assert results == ["v"] * 25
    assert calls == 1  # only one coroutine recomputed; rest awaited it


async def test_different_keys_isolated():
    cache = TTLCache()
    assert await cache.get_or_set("a", 60, _const(1)) == 1
    assert await cache.get_or_set("b", 60, _const(2)) == 2
    assert await cache.get_or_set("a", 60, _const(99)) == 1  # 'a' still cached


def _const(v):
    async def f():
        return v
    return f


# ------------------------------------------------------------ endpoint

async def test_circuits_served_stale_within_ttl(db):
    db.add(Circuit(name="AAA", ws_port=9301, for_sale=True, is_beta=False))
    await db.commit()

    first = await list_public_circuits(db=db)
    assert [c["name"] for c in first] == ["AAA"]

    # Mutate the DB; a cached endpoint must NOT reflect it within the TTL
    # (this is the DDoS protection: the flood never reaches the DB).
    db.add(Circuit(name="BBB", ws_port=9302, for_sale=True, is_beta=False))
    await db.commit()

    second = await list_public_circuits(db=db)
    assert [c["name"] for c in second] == ["AAA"]  # stale, DB not re-queried


async def test_site_status_caches_db_fields_but_now_is_fresh(db):
    from app.services.public_cache import public_cache

    db.add(AppSetting(key="site_launch_at", value="2030-01-01T00:00:00+00:00"))
    await db.commit()

    out1 = await site_status(db=db)
    assert out1["launch_at"] == "2030-01-01T00:00:00+00:00"
    assert "now" in out1

    # The cached object holds ONLY the DB-derived flags — never ``now`` —
    # so the countdown interpolates against real server time each call.
    cached = public_cache._store["site-status"][1]
    assert "now" not in cached
    assert set(cached) == {"launch_at", "maintenance", "google_auth_enabled"}

    # Change the setting in the DB; cached read stays stale, ``now`` moves.
    row = (await db.execute(
        select_app_setting("site_launch_at")
    )).scalar_one()
    row.value = "1999-01-01T00:00:00+00:00"
    await db.commit()

    out2 = await site_status(db=db)
    assert out2["launch_at"] == "2030-01-01T00:00:00+00:00"  # stale (cached)
    assert out2["now"] >= out1["now"]  # recomputed per request


async def test_plans_keyed_per_lang(db):
    from app.services.public_cache import public_cache

    db.add(ProductTabConfig(
        plan_type="pro", display_name="Pro", description="d",
        features="[]", price_amount=10, billing_interval="month",
        is_visible=True, sort_order=1,
        stripe_product_id="prod_test", stripe_price_id="price_pro",
        tabs="[]", allowed_cards="[]", max_devices=1,
        is_popular=False, coming_soon=False,
        per_circuit=True, circuits_to_select=1,
    ))
    await db.commit()

    await list_plans(lang="es", db=db)
    await list_plans(lang="en", db=db)
    assert "plans:es" in public_cache._store
    assert "plans:en" in public_cache._store

    # second es call is a cache hit (no exception, same payload object)
    a = await list_plans(lang="es", db=db)
    b = await list_plans(lang="es", db=db)
    assert a == b


async def test_trial_config_served_stale_within_ttl(db):
    db.add(AppSetting(key="trial_days", value="14"))
    db.add(AppSetting(key="trial_banner_days", value="3"))
    await db.commit()

    out1 = await get_trial_config(db=db)
    assert out1 == {"trial_enabled": True, "trial_days": 14, "trial_banner_days": 3}

    row = (await db.execute(select_app_setting("trial_days"))).scalar_one()
    row.value = "99"
    await db.commit()

    out2 = await get_trial_config(db=db)
    assert out2["trial_days"] == 14  # stale, cached — DB not re-read


def select_app_setting(key: str):
    from sqlalchemy import select
    return select(AppSetting).where(AppSetting.key == key)
