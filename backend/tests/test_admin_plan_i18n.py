"""Admin product-config i18n round-trip tests (Task 3).

The admin product CRUD in `app/api/admin_routes.py` does NOT use the
pydantic ProductTabConfig models — it hand-rolls raw `request.json()` /
dicts. These tests prove the 3 i18n columns
(`display_name_i18n`/`description_i18n`/`features_i18n`) survive a
POST → GET → PATCH → GET round-trip through `admin_routes`, with the
same partial-update / no-clobber semantics as the existing `features`
column.

Auth is bypassed by overriding `require_admin`; the DB is overridden by
`get_db` to the in-memory async SQLite fixture (same `db_session`
pattern as tests/test_plan_i18n.py / tests/ranking/test_admin_session_type_api.py).
"""
from __future__ import annotations

import json

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.api.auth_routes import require_admin
from app.models.database import get_db
from app.models.schemas import Base, ProductTabConfig


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


def _app_with_overrides(db_session):
    from app.main import app

    async def _override_require_admin():
        return _FakeAdmin()

    async def _override_get_db():
        yield db_session

    app.dependency_overrides[require_admin] = _override_require_admin
    app.dependency_overrides[get_db] = _override_get_db
    return app


_DN_I18N = {
    "en": "Endurance Basic",
    "it": "Endurance Base",
    "de": "Endurance Basis",
    "fr": "Endurance Basique",
}
_DESC_I18N = {
    "en": "Access to 15+ calculated metrics.",
    "it": "Accesso a oltre 15 indicatori.",
    "de": "Zugriff auf über 15 Kennzahlen.",
    "fr": "Accès à plus de 15 indicateurs.",
}
_FEAT_I18N = {
    "en": ["1 circuit included", "Mobile app · 2 users"],
    "it": ["1 circuito incluso", "App mobile · 2 utenti"],
    "de": ["1 Strecke inklusive", "Mobile App · 2 Nutzer"],
    "fr": ["1 circuit inclus", "App mobile · 2 utilisateurs"],
}


def _create_body(**over):
    body = dict(
        stripe_product_id="prod_x",
        stripe_price_id="price_x",
        plan_type="basic_monthly",
        display_name="Endurance Básico",
        description="Acceso a más de 15 indicadores calculados.",
        features=["1 circuito incluido", "App móvil · 2 usuarios"],
        display_name_i18n=_DN_I18N,
        description_i18n=_DESC_I18N,
        features_i18n=_FEAT_I18N,
    )
    body.update(over)
    return body


async def test_create_then_get_round_trips_i18n(db_session):
    app = _app_with_overrides(db_session)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://t"
        ) as client:
            resp = await client.post(
                "/api/admin/product-config", json=_create_body()
            )
            assert resp.status_code == 200, resp.text
            created = resp.json()
            # POST response is serialized via _serialize_config → decoded objects
            assert created["display_name_i18n"] == _DN_I18N
            assert created["description_i18n"] == _DESC_I18N
            assert created["features_i18n"] == _FEAT_I18N

            list_resp = await client.get("/api/admin/product-config")
        assert list_resp.status_code == 200
        row = list_resp.json()[0]
        assert row["display_name_i18n"] == _DN_I18N
        assert row["description_i18n"] == _DESC_I18N
        assert row["features_i18n"] == _FEAT_I18N

        # stored JSON-encoded in the DB (mirrors how `features` is stored)
        db_row = (
            await db_session.execute(select(ProductTabConfig))
        ).scalars().one()
        assert json.loads(db_row.display_name_i18n) == _DN_I18N
        assert json.loads(db_row.description_i18n) == _DESC_I18N
        assert json.loads(db_row.features_i18n) == _FEAT_I18N
    finally:
        app.dependency_overrides.clear()


async def test_create_without_i18n_stores_null(db_session):
    app = _app_with_overrides(db_session)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://t"
        ) as client:
            body = _create_body()
            del body["display_name_i18n"]
            del body["description_i18n"]
            del body["features_i18n"]
            resp = await client.post("/api/admin/product-config", json=body)
        assert resp.status_code == 200, resp.text
        created = resp.json()
        assert created["display_name_i18n"] is None
        assert created["description_i18n"] is None
        assert created["features_i18n"] is None

        db_row = (
            await db_session.execute(select(ProductTabConfig))
        ).scalars().one()
        assert db_row.display_name_i18n is None
        assert db_row.description_i18n is None
        assert db_row.features_i18n is None
    finally:
        app.dependency_overrides.clear()


async def test_patch_updates_one_locale(db_session):
    app = _app_with_overrides(db_session)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://t"
        ) as client:
            create = await client.post(
                "/api/admin/product-config", json=_create_body()
            )
            cid = create.json()["id"]

            new_dn = dict(_DN_I18N)
            new_dn["fr"] = "Endurance Basique CORRIGÉ"
            patch = await client.put(
                f"/api/admin/product-config/{cid}",
                json={"display_name_i18n": new_dn},
            )
            assert patch.status_code == 200, patch.text
            assert patch.json()["display_name_i18n"]["fr"] == (
                "Endurance Basique CORRIGÉ"
            )

            get = await client.get("/api/admin/product-config")
        row = get.json()[0]
        assert row["display_name_i18n"]["fr"] == "Endurance Basique CORRIGÉ"
        assert row["display_name_i18n"]["en"] == "Endurance Basic"
        # untouched i18n fields preserved
        assert row["description_i18n"] == _DESC_I18N
        assert row["features_i18n"] == _FEAT_I18N
    finally:
        app.dependency_overrides.clear()


async def test_patch_omitting_i18n_does_not_wipe_existing(db_session):
    """Partial-update semantics: a PATCH that does NOT mention the i18n
    fields must leave the previously stored values intact (same as how
    `features` is only rewritten when present in the body)."""
    app = _app_with_overrides(db_session)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://t"
        ) as client:
            create = await client.post(
                "/api/admin/product-config", json=_create_body()
            )
            cid = create.json()["id"]

            # PATCH something unrelated, no i18n keys at all
            patch = await client.put(
                f"/api/admin/product-config/{cid}",
                json={"display_name": "Endurance Básico v2"},
            )
            assert patch.status_code == 200, patch.text

            get = await client.get("/api/admin/product-config")
        row = get.json()[0]
        assert row["display_name"] == "Endurance Básico v2"
        # i18n values NOT wiped
        assert row["display_name_i18n"] == _DN_I18N
        assert row["description_i18n"] == _DESC_I18N
        assert row["features_i18n"] == _FEAT_I18N
    finally:
        app.dependency_overrides.clear()
