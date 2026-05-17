"""Task 4 acceptance tests — i18n backfill + ?lang= on REAL production plan content.

Seeds the 5 exact current production rows (verbatim Spanish, including the
`·` U+00B7 middle dots, accents and the literal typo `"Acceso a todos los
circuito"`), runs ``backfill_plan_i18n``, then asserts the full acceptance
criteria from the plan spec.

Mirrors the in-memory async-SQLite fixture pattern from ``test_plan_i18n.py``.
"""
from __future__ import annotations

import json

import pytest
import pytest_asyncio
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.models.schemas import Base, ProductTabConfig
from app.models.database import backfill_plan_i18n
from app.services.plan_translations import PLAN_TRANSLATIONS


# ---------------------------------------------------------------------------
# Fixture — in-memory async SQLite (identical to test_plan_i18n.py)
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


# ---------------------------------------------------------------------------
# Exact production row data (verbatim Spanish)
# ---------------------------------------------------------------------------

_ROWS = [
    # id=1
    dict(
        id=1,
        plan_type="endurance_basic_monthly",
        display_name="Endurance Básico",
        description=(
            "Acceso a más de 15 indicadores calculados para que sepas qué ocurre en cada momento. "
            "Pensado para pilotos individuales que corren resistencias y equipos que están empezando."
        ),
        features=json.dumps([
            "1 circuito incluido",
            "App móvil · 2 usuarios",
            "Acceso web · 1 usuario",
            "Módulo carrera + módulo box",
            "Live Apex",
            "Vista de piloto y configuración de carrera",
        ]),
    ),
    # id=3
    dict(
        id=3,
        plan_type="endurance_pro_monthly",
        display_name="Endurance Pro",
        description="Equipos con experiencia este es vuestro plan. Toda la funcionalidad incluida.",
        features=json.dumps([
            "3 circuitos (todos los circuitos en plan anual)",
            "App móvil · 6 usuarios",
            "Acceso web · 2 usuarios (hasta 8 dispositivos)",
            "Todo lo de Endurance Básico",
            "Análisis de karts",
            "Soporte prioritario",
            "Clasificación real (próximamente)",
        ]),
    ),
    # id=4 — empty description
    dict(
        id=4,
        plan_type="endurance_pro_annual",
        display_name="Endurance Pro",
        description="",
        features=json.dumps([
            "3 circuitos (todos los circuitos en plan anual)",
            "App móvil · 6 usuarios · Acceso web · 2 usuarios (hasta 8 dispositivos)",
            "Todo lo de Endurance Básico",
            "Análisis de karts",
            "Soporte prioritario",
            "Clasificación real (próximamente)",
        ]),
    ),
    # id=5
    dict(
        id=5,
        plan_type="individual_monthly",
        display_name="Individual",
        description="Pensado para carreras individuales donde el estado del box no es importante",
        features=json.dumps([
            "1 circuito (todos los circuitos en plan anual)",
            "App móvil · 1 usuario",
            "Acceso web · 1 usuario",
            "Vista de piloto en carrera",
            "Configuración de carrera",
            "Conexión con RaceBox / GPS",
            "GPS Insights (solo plan anual)",
        ]),
    ),
    # id=6 — empty description + the literal typo "Acceso a todos los circuito"
    dict(
        id=6,
        plan_type="individual_annual",
        display_name="Individual",
        description="",
        features=json.dumps([
            "Acceso a todos los circuito",   # deliberate typo — in PLAN_TRANSLATIONS
            "App móvil · 1 usuario",
            "Vista de piloto en carrera",
            "Configuración de carrera",
            "Conexión con RaceBox / GPS",
            "GPS Insights",
        ]),
    ),
]

# Required NOT NULL / non-nullable columns with sane defaults.
_DEFAULTS = dict(
    stripe_product_id="prod_test",
    stripe_price_id="price_placeholder",   # overridden per-row below
    tabs="[]",
    allowed_cards="[]",
    max_devices=1,
    is_popular=False,
    coming_soon=False,
    is_visible=True,
    sort_order=0,
    per_circuit=True,
    circuits_to_select=1,
)


def _make_row(data: dict) -> ProductTabConfig:
    kwargs = {**_DEFAULTS, **data}
    # Make stripe_price_id unique per row to satisfy the UNIQUE constraint.
    kwargs["stripe_price_id"] = f"price_{data['plan_type']}"
    return ProductTabConfig(**kwargs)


async def _seed_all(db_session) -> None:
    for row_data in _ROWS:
        db_session.add(_make_row(row_data))
    await db_session.flush()


async def _run_backfill(db_session) -> None:
    conn = await db_session.connection()
    await backfill_plan_i18n(conn)
    await db_session.commit()
    # The backfill issues raw SQL UPDATE statements that bypass the ORM identity
    # map. Expire all cached objects so any subsequent select() — including those
    # issued by the ASGI test client through the same session override — re-reads
    # the freshly-written *_i18n columns from the DB.
    db_session.expire_all()


# ---------------------------------------------------------------------------
# Helper: call /api/plans?lang= via ASGI test client
# ---------------------------------------------------------------------------

def _app_with_db(db_session):
    from app.main import app
    from app.models.database import get_db

    async def _override():
        yield db_session

    app.dependency_overrides[get_db] = _override
    return app


# ---------------------------------------------------------------------------
# Assertion 1 — fr localisation: Endurance Basique + translated features list;
#               de spot-check for individual_monthly description
# ---------------------------------------------------------------------------

async def test_assertion_1_fr_and_de_localisation(db_session):
    from httpx import ASGITransport, AsyncClient

    await _seed_all(db_session)
    await _run_backfill(db_session)

    app = _app_with_db(db_session)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://t") as ac:
            r_fr = await ac.get("/api/plans?lang=fr")
            r_de = await ac.get("/api/plans?lang=de")
    finally:
        app.dependency_overrides.clear()

    assert r_fr.status_code == 200
    assert r_de.status_code == 200

    plans_fr = {p["plan_type"]: p for p in r_fr.json()}
    plans_de = {p["plan_type"]: p for p in r_de.json()}

    # id=1 endurance_basic_monthly in French
    basic_fr = plans_fr["endurance_basic_monthly"]
    assert basic_fr["display_name"] == "Endurance Basique", (
        f"Expected 'Endurance Basique', got {basic_fr['display_name']!r}"
    )
    es_features_basic = json.loads(
        next(r["features"] for r in _ROWS if r["plan_type"] == "endurance_basic_monthly")
    )
    assert len(basic_fr["features"]) == len(es_features_basic), (
        f"Feature list length mismatch: got {len(basic_fr['features'])}, "
        f"expected {len(es_features_basic)}"
    )
    assert basic_fr["features"][0] == "1 circuit inclus", (
        f"Expected '1 circuit inclus', got {basic_fr['features'][0]!r}"
    )
    assert basic_fr["features"][4] == "LiveTiming", (
        f"Expected 'LiveTiming' for 'Live Apex', got {basic_fr['features'][4]!r}"
    )
    # Verify order: spot-check index 1
    assert basic_fr["features"][1] == "App mobile · 2 utilisateurs", (
        f"Expected 'App mobile · 2 utilisateurs', got {basic_fr['features'][1]!r}"
    )

    # id=5 individual_monthly in German — description spot-check
    indiv_de = plans_de["individual_monthly"]
    assert indiv_de["description"] == (
        "Für Einzelrennen, bei denen der Box-Status keine Rolle spielt"
    ), f"German description mismatch: {indiv_de['description']!r}"


# ---------------------------------------------------------------------------
# Assertion 2 — ?lang=es, omitted, and unknown ?lang=zz are byte-identical
#               to the raw seeded Spanish for all rows
# ---------------------------------------------------------------------------

async def test_assertion_2_es_byte_identical(db_session):
    from httpx import ASGITransport, AsyncClient

    await _seed_all(db_session)
    await _run_backfill(db_session)

    app = _app_with_db(db_session)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://t") as ac:
            r_default = await ac.get("/api/plans")
            r_es = await ac.get("/api/plans?lang=es")
            r_zz = await ac.get("/api/plans?lang=zz")
    finally:
        app.dependency_overrides.clear()

    default_plans = r_default.json()
    es_plans = r_es.json()
    zz_plans = r_zz.json()

    assert default_plans == es_plans == zz_plans, (
        "lang=es / omitted / lang=zz must be byte-identical"
    )

    # Build a lookup by plan_type from seeded row data
    seeded = {r["plan_type"]: r for r in _ROWS}
    for plan in default_plans:
        pt = plan["plan_type"]
        row = seeded[pt]
        assert plan["display_name"] == row["display_name"], (
            f"{pt}: display_name {plan['display_name']!r} != {row['display_name']!r}"
        )
        assert plan["description"] == row["description"], (
            f"{pt}: description {plan['description']!r} != {row['description']!r}"
        )
        assert plan["features"] == json.loads(row["features"]), (
            f"{pt}: features mismatch"
        )

    # Response shape must be exactly these keys — unchanged
    expected_keys = {
        "plan_type", "display_name", "description", "features",
        "price_amount", "billing_interval", "is_popular", "coming_soon",
        "sort_order", "per_circuit", "circuits_to_select",
    }
    for plan in default_plans:
        assert set(plan.keys()) == expected_keys, (
            f"Response shape changed for {plan['plan_type']}: {set(plan.keys())}"
        )


# ---------------------------------------------------------------------------
# Assertion 3 — Empty-description rows (id=4, id=6) → "" in every locale,
#               no crash, no None
# ---------------------------------------------------------------------------

async def test_assertion_3_empty_description_all_locales(db_session):
    from httpx import ASGITransport, AsyncClient

    await _seed_all(db_session)
    await _run_backfill(db_session)

    app = _app_with_db(db_session)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://t") as ac:
            for lang in ("es", "en", "fr", "de", "it"):
                r = await ac.get(f"/api/plans?lang={lang}")
                assert r.status_code == 200, f"lang={lang} returned {r.status_code}"
                plans = {p["plan_type"]: p for p in r.json()}

                for empty_pt in ("endurance_pro_annual", "individual_annual"):
                    desc = plans[empty_pt]["description"]
                    assert desc == "" or desc is None, (
                        f"lang={lang} {empty_pt}: expected empty description, got {desc!r}"
                    )
                    # Crucially must NOT be None — the API returns "" not null
                    # (the es column value is ""; resolver returns it as-is)
                    assert desc == "", (
                        f"lang={lang} {empty_pt}: description must be '' not None/other, got {desc!r}"
                    )
    finally:
        app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Assertion 4 — Unknown bullet falls back to es at its index; known bullets
#               around it are translated
# ---------------------------------------------------------------------------

async def test_assertion_4_unknown_bullet_fallback(db_session):
    from httpx import ASGITransport, AsyncClient

    # Seed only the basic_monthly row with a custom features list that
    # includes an unknown bullet at index 2.
    unknown_bullet = "Bullet inventado XYZ"
    custom_features = [
        "1 circuito incluido",       # idx 0 — in PLAN_TRANSLATIONS
        "App móvil · 2 usuarios",    # idx 1 — in PLAN_TRANSLATIONS
        unknown_bullet,              # idx 2 — NOT in PLAN_TRANSLATIONS
        "Live Apex",                 # idx 3 — in PLAN_TRANSLATIONS → LiveTiming
    ]
    row = _make_row({
        "id": 1,
        "plan_type": "endurance_basic_monthly",
        "display_name": "Endurance Básico",
        "description": (
            "Acceso a más de 15 indicadores calculados para que sepas qué ocurre en cada momento. "
            "Pensado para pilotos individuales que corren resistencias y equipos que están empezando."
        ),
        "features": json.dumps(custom_features),
    })
    # Ensure features_i18n is NULL so backfill fills it
    row.features_i18n = None
    db_session.add(row)
    await db_session.flush()
    await _run_backfill(db_session)

    app = _app_with_db(db_session)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://t") as ac:
            r = await ac.get("/api/plans?lang=fr")
    finally:
        app.dependency_overrides.clear()

    plans = r.json()
    assert len(plans) == 1
    feats = plans[0]["features"]

    assert len(feats) == len(custom_features), (
        f"Feature count {len(feats)} != {len(custom_features)}"
    )
    # Known bullet at idx 0 is translated
    assert feats[0] == "1 circuit inclus", f"idx 0: {feats[0]!r}"
    # Known bullet at idx 1 is translated
    assert feats[1] == "App mobile · 2 utilisateurs", f"idx 1: {feats[1]!r}"
    # Unknown bullet at idx 2 falls back to es verbatim
    assert feats[2] == unknown_bullet, (
        f"Unknown bullet must fall back to es text. Got {feats[2]!r}"
    )
    # Known bullet at idx 3 is translated
    assert feats[3] == "LiveTiming", f"idx 3: {feats[3]!r}"


# ---------------------------------------------------------------------------
# Assertion 5 — Idempotency: second run is a no-op; admin-set value is NOT
#               overwritten
# ---------------------------------------------------------------------------

async def test_assertion_5_idempotency_and_no_clobber(db_session):
    await _seed_all(db_session)
    await _run_backfill(db_session)

    # Snapshot after first run
    rows_after_1 = (
        await db_session.execute(
            select(
                ProductTabConfig.id,
                ProductTabConfig.display_name_i18n,
                ProductTabConfig.description_i18n,
                ProductTabConfig.features_i18n,
            )
        )
    ).all()
    snap = {r[0]: (r[1], r[2], r[3]) for r in rows_after_1}

    # Second run
    await _run_backfill(db_session)

    rows_after_2 = (
        await db_session.execute(
            select(
                ProductTabConfig.id,
                ProductTabConfig.display_name_i18n,
                ProductTabConfig.description_i18n,
                ProductTabConfig.features_i18n,
            )
        )
    ).all()

    for r in rows_after_2:
        rid = r[0]
        assert (r[1], r[2], r[3]) == snap[rid], (
            f"Row id={rid}: backfill changed columns on 2nd run. "
            f"Before: {snap[rid]!r}, After: {(r[1], r[2], r[3])!r}"
        )

    # Admin-set value must NOT be overwritten ─────────────────────────────
    # Add a fresh row with a pre-populated features_i18n (admin value)
    admin_feats_i18n = json.dumps({"en": ["admin bullet A", "admin bullet B"]})
    admin_row = _make_row({
        "id": 99,
        "plan_type": "admin_override_plan",
        "display_name": "Endurance Básico",
        "description": "",
        "features": json.dumps(["1 circuito incluido", "App móvil · 2 usuarios"]),
    })
    admin_row.features_i18n = admin_feats_i18n
    # display_name_i18n stays NULL — backfill should fill it (description empty → skip)
    admin_row.display_name_i18n = None
    admin_row.description_i18n = None
    db_session.add(admin_row)
    await db_session.flush()

    await _run_backfill(db_session)

    refreshed = (
        await db_session.execute(
            select(ProductTabConfig).where(ProductTabConfig.id == 99)
        )
    ).scalars().one()

    # Admin-set features_i18n must be preserved verbatim
    assert refreshed.features_i18n == admin_feats_i18n, (
        f"Admin features_i18n was overwritten! Got {refreshed.features_i18n!r}"
    )
    # The NULL display_name_i18n was filled by backfill (not an admin value)
    assert refreshed.display_name_i18n is not None, (
        "display_name_i18n should have been filled for the NULL column"
    )
    dn_map = json.loads(refreshed.display_name_i18n)
    assert dn_map.get("fr") == "Endurance Basique", (
        f"Expected 'Endurance Basique' in fr, got {dn_map.get('fr')!r}"
    )
    # Empty description → description_i18n still NULL/empty (no crash)
    assert not refreshed.description_i18n, (
        f"Empty description should leave description_i18n NULL, got {refreshed.description_i18n!r}"
    )
