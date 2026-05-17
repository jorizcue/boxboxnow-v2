"""Tests for per-locale plan content (Task 1).

Covers:
- The authored PLAN_TRANSLATIONS dictionary (verbatim spot-checks).
- The pure `localize_plan` resolver and its es-fallback rules.
- The idempotent es-fallback backfill in init_db (no-clobber + no-op rerun).

The `db_session` fixture in tests/ranking/conftest.py is not visible from
this top-level test module, so we replicate the same in-memory async
SQLite engine fixture locally (identical setup).
"""
from __future__ import annotations

import json

import pytest
import pytest_asyncio
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.models.schemas import Base, ProductTabConfig
from app.services.plan_translations import PLAN_TRANSLATIONS, localize_plan


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
# (a) PLAN_TRANSLATIONS dictionary spot-checks (verbatim authored values)
# ---------------------------------------------------------------------------

def test_translation_dict_display_name_fr():
    assert PLAN_TRANSLATIONS["Endurance Básico"]["fr"] == "Endurance Basique"


def test_translation_dict_display_name_all_langs():
    assert PLAN_TRANSLATIONS["Endurance Básico"] == {
        "en": "Endurance Basic",
        "it": "Endurance Base",
        "de": "Endurance Basis",
        "fr": "Endurance Basique",
    }
    assert PLAN_TRANSLATIONS["Individual"]["de"] == "Einzel"
    assert PLAN_TRANSLATIONS["Endurance Pro"]["en"] == "Endurance Pro"


def test_translation_dict_description_spotcheck():
    desc_es = (
        "Equipos con experiencia este es vuestro plan. "
        "Toda la funcionalidad incluida."
    )
    assert PLAN_TRANSLATIONS[desc_es]["en"] == (
        "For experienced teams — this is your plan. All features included."
    )
    assert PLAN_TRANSLATIONS[desc_es]["de"] == (
        "Für erfahrene Teams – das ist euer Plan. Alle Funktionen inklusive."
    )


def test_translation_dict_feature_bullets_spotcheck():
    assert PLAN_TRANSLATIONS["1 circuito incluido"]["de"] == "1 Strecke inklusive"
    assert PLAN_TRANSLATIONS["Live Apex"]["fr"] == "LiveTiming"
    assert PLAN_TRANSLATIONS["GPS Insights"]["it"] == "GPS Insights"
    assert (
        PLAN_TRANSLATIONS["Todo lo de Endurance Básico"]["fr"]
        == "Tout Endurance Basique"
    )


def test_translation_dict_counts():
    """3 display names + 3 descriptions + 22 feature bullets = 28 keys,
    every value has exactly the 4 locale keys."""
    assert len(PLAN_TRANSLATIONS) == 28
    for src, val in PLAN_TRANSLATIONS.items():
        assert set(val.keys()) == {"en", "it", "de", "fr"}, src


# ---------------------------------------------------------------------------
# (b) localize_plan resolver — fallback rules
# ---------------------------------------------------------------------------

_DN = "Endurance Básico"
_DESC = (
    "Acceso a más de 15 indicadores calculados para que sepas qué ocurre en "
    "cada momento. Pensado para pilotos individuales que corren resistencias "
    "y equipos que están empezando."
)
_FEATURES = ["1 circuito incluido", "App móvil · 2 usuarios"]


def _i18n_blobs():
    dn_i18n = json.dumps(
        {lang: PLAN_TRANSLATIONS[_DN][lang] for lang in ("en", "it", "de", "fr")}
    )
    desc_i18n = json.dumps(
        {lang: PLAN_TRANSLATIONS[_DESC][lang] for lang in ("en", "it", "de", "fr")}
    )
    feat_i18n = json.dumps(
        {
            lang: [PLAN_TRANSLATIONS.get(b, {}).get(lang, b) for b in _FEATURES]
            for lang in ("en", "it", "de", "fr")
        }
    )
    return dn_i18n, desc_i18n, feat_i18n


def test_localize_plan_en_translates():
    dn_i18n, desc_i18n, feat_i18n = _i18n_blobs()
    dn, desc, feats = localize_plan(
        display_name=_DN,
        description=_DESC,
        features=_FEATURES,
        dn_i18n=dn_i18n,
        desc_i18n=desc_i18n,
        feat_i18n=feat_i18n,
        lang="en",
    )
    assert dn == "Endurance Basic"
    assert desc == (
        "Access to 15+ calculated metrics so you always know what's "
        "happening. Built for solo endurance drivers and teams just "
        "getting started."
    )
    assert feats == ["1 circuit included", "Mobile app · 2 users"]


def test_localize_plan_es_is_identity():
    dn_i18n, desc_i18n, feat_i18n = _i18n_blobs()
    dn, desc, feats = localize_plan(
        display_name=_DN,
        description=_DESC,
        features=_FEATURES,
        dn_i18n=dn_i18n,
        desc_i18n=desc_i18n,
        feat_i18n=feat_i18n,
        lang="es",
    )
    assert dn == _DN
    assert desc == _DESC
    assert feats == _FEATURES


def test_localize_plan_none_and_unknown_lang_fall_back_to_es():
    dn_i18n, desc_i18n, feat_i18n = _i18n_blobs()
    for lang in (None, "xx", "pt", ""):
        dn, desc, feats = localize_plan(
            display_name=_DN,
            description=_DESC,
            features=_FEATURES,
            dn_i18n=dn_i18n,
            desc_i18n=desc_i18n,
            feat_i18n=feat_i18n,
            lang=lang,
        )
        assert dn == _DN
        assert desc == _DESC
        assert feats == _FEATURES


def test_localize_plan_missing_i18n_falls_back_to_es():
    """No stored i18n blobs at all → es for every field/lang."""
    dn, desc, feats = localize_plan(
        display_name=_DN,
        description=_DESC,
        features=_FEATURES,
        dn_i18n=None,
        desc_i18n=None,
        feat_i18n=None,
        lang="en",
    )
    assert dn == _DN
    assert desc == _DESC
    assert feats == _FEATURES


def test_localize_plan_per_field_fallback():
    """display_name has no en entry → es; description does → translated."""
    desc_i18n = json.dumps({"en": "ENGLISH DESC"})
    dn, desc, feats = localize_plan(
        display_name=_DN,
        description=_DESC,
        features=_FEATURES,
        dn_i18n=None,
        desc_i18n=desc_i18n,
        feat_i18n=None,
        lang="en",
    )
    assert dn == _DN  # per-field fallback to es
    assert desc == "ENGLISH DESC"
    assert feats == _FEATURES  # no feat_i18n → es list


def test_localize_plan_features_per_bullet_fallback_same_length_order():
    """The localized list is index-aligned to es (same length/order, as
    the backfill always produces). An empty entry at an index falls back
    to the es bullet at that same index; a short list pads with es."""
    features = ["1 circuito incluido", "BULLET SIN TRADUCIR", "GPS Insights"]
    # Same-length list with a blank middle entry (untranslated bullet)
    # plus a separate shorter-list case to prove tail padding.
    feat_i18n = json.dumps({"en": ["1 circuit included", "", "GPS Insights"]})
    dn, desc, feats = localize_plan(
        display_name=_DN,
        description="",
        features=features,
        dn_i18n=None,
        desc_i18n=None,
        feat_i18n=feat_i18n,
        lang="en",
    )
    assert len(feats) == len(features)
    # index 0 translated, index 1 blank → es bullet, index 2 translated
    assert feats == ["1 circuit included", "BULLET SIN TRADUCIR", "GPS Insights"]

    # Short localized list → missing trailing indices fall back to es.
    short_i18n = json.dumps({"en": ["1 circuit included"]})
    _, _, feats2 = localize_plan(
        display_name=_DN,
        description="",
        features=features,
        dn_i18n=None,
        desc_i18n=None,
        feat_i18n=short_i18n,
        lang="en",
    )
    assert feats2 == ["1 circuit included", "BULLET SIN TRADUCIR", "GPS Insights"]


def test_localize_plan_empty_description_stays_empty():
    dn, desc, feats = localize_plan(
        display_name=_DN,
        description="",
        features=_FEATURES,
        dn_i18n=None,
        desc_i18n=None,
        feat_i18n=None,
        lang="en",
    )
    assert desc == ""


def test_localize_plan_unknown_string_not_in_dict_falls_back():
    dn, desc, feats = localize_plan(
        display_name="Plan Inventado",
        description="Descripción que nadie tradujo",
        features=["bullet desconocido"],
        dn_i18n=None,
        desc_i18n=None,
        feat_i18n=None,
        lang="fr",
    )
    assert dn == "Plan Inventado"
    assert desc == "Descripción que nadie tradujo"
    assert feats == ["bullet desconocido"]


# ---------------------------------------------------------------------------
# (c) Backfill — idempotency + no-clobber
# ---------------------------------------------------------------------------

# Known prod-shaped row content (verbatim Spanish).
_PROD_DN = "Endurance Básico"
_PROD_DESC = (
    "Acceso a más de 15 indicadores calculados para que sepas qué ocurre en "
    "cada momento. Pensado para pilotos individuales que corren resistencias "
    "y equipos que están empezando."
)
_PROD_FEATURES = [
    "1 circuito incluido",
    "App móvil · 2 usuarios",
    "Acceso web · 1 usuario",
    "Live Apex",  # known es data value (translates to LiveTiming)
]


async def _run_backfill(db_session):
    """Run only the i18n backfill block against the test session's bind."""
    from app.models.database import backfill_plan_i18n

    conn = await db_session.connection()
    await backfill_plan_i18n(conn)
    await db_session.commit()


def _new_row(**over):
    base = dict(
        stripe_product_id="prod_x",
        stripe_price_id="price_x",
        plan_type="basic_monthly",
        display_name=_PROD_DN,
        description=_PROD_DESC,
        features=json.dumps(_PROD_FEATURES),
    )
    base.update(over)
    return ProductTabConfig(**base)


async def test_backfill_populates_from_dict(db_session):
    db_session.add(_new_row())
    await db_session.flush()

    await _run_backfill(db_session)

    row = (await db_session.execute(select(ProductTabConfig))).scalars().one()
    dn = json.loads(row.display_name_i18n)
    assert dn["fr"] == "Endurance Basique"
    assert dn["en"] == "Endurance Basic"

    desc = json.loads(row.description_i18n)
    assert desc["de"] == (
        "Zugriff auf über 15 berechnete Kennzahlen, damit du jederzeit "
        "weißt, was passiert. Für einzelne Endurance-Fahrer und Teams, "
        "die gerade starten."
    )

    feats = json.loads(row.features_i18n)
    assert set(feats.keys()) == {"en", "it", "de", "fr"}
    # same length/order as es features, per-bullet translation w/ fallback
    assert feats["en"] == [
        "1 circuit included",
        "Mobile app · 2 users",
        "Web access · 1 user",
        "LiveTiming",
    ]
    assert len(feats["fr"]) == len(_PROD_FEATURES)


async def test_backfill_is_idempotent(db_session):
    db_session.add(_new_row())
    await db_session.flush()

    await _run_backfill(db_session)
    row1 = (await db_session.execute(select(ProductTabConfig))).scalars().one()
    snap = (row1.display_name_i18n, row1.description_i18n, row1.features_i18n)

    # second run must be a no-op (byte-identical blobs)
    await _run_backfill(db_session)
    row2 = (await db_session.execute(select(ProductTabConfig))).scalars().one()
    assert (row2.display_name_i18n, row2.description_i18n, row2.features_i18n) == snap


async def test_backfill_does_not_clobber_admin_values(db_session):
    admin_dn = json.dumps({"en": "ADMIN OVERRIDE", "fr": "ADMIN FR"})
    admin_feats = json.dumps({"en": ["admin bullet"]})
    db_session.add(_new_row(display_name_i18n=admin_dn, features_i18n=admin_feats))
    await db_session.flush()

    await _run_backfill(db_session)

    row = (await db_session.execute(select(ProductTabConfig))).scalars().one()
    # already-set columns preserved verbatim
    assert row.display_name_i18n == admin_dn
    assert row.features_i18n == admin_feats
    # the NULL column (description_i18n) still got filled
    assert row.description_i18n is not None
    assert json.loads(row.description_i18n)["en"].startswith("Access to 15+")


async def test_backfill_skips_empty_description(db_session):
    db_session.add(_new_row(description=""))
    await db_session.flush()

    await _run_backfill(db_session)

    row = (await db_session.execute(select(ProductTabConfig))).scalars().one()
    # empty es description → leave description_i18n NULL/empty
    assert not row.description_i18n
    # other fields still backfilled
    assert row.display_name_i18n is not None


# ---------------------------------------------------------------------------
# /api/plans ?lang= regression + localization
# ---------------------------------------------------------------------------

def _app_with_db(db_session):
    from app.main import app
    from app.models.database import get_db

    async def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    return app


async def test_api_plans_lang_es_is_byte_identical_to_default(db_session):
    from httpx import ASGITransport, AsyncClient

    row = _new_row(is_visible=True)
    db_session.add(row)
    await db_session.flush()
    await _run_backfill(db_session)

    app = _app_with_db(db_session)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://t") as ac:
            r_default = await ac.get("/api/plans")
            r_es = await ac.get("/api/plans?lang=es")
            r_unknown = await ac.get("/api/plans?lang=zz")
    finally:
        app.dependency_overrides.clear()

    assert r_default.status_code == 200
    assert r_default.json() == r_es.json() == r_unknown.json()
    plan = r_default.json()[0]
    assert plan["display_name"] == _PROD_DN
    assert plan["features"] == _PROD_FEATURES
    # response shape unchanged
    assert set(plan.keys()) == {
        "plan_type", "display_name", "description", "features",
        "price_amount", "billing_interval", "is_popular", "coming_soon",
        "sort_order", "per_circuit", "circuits_to_select",
    }


async def test_api_plans_lang_fr_localizes(db_session):
    from httpx import ASGITransport, AsyncClient

    db_session.add(_new_row(is_visible=True))
    await db_session.flush()
    await _run_backfill(db_session)

    app = _app_with_db(db_session)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://t") as ac:
            r = await ac.get("/api/plans?lang=fr")
    finally:
        app.dependency_overrides.clear()

    plan = r.json()[0]
    assert plan["display_name"] == "Endurance Basique"
    assert len(plan["features"]) == len(_PROD_FEATURES)
    assert plan["features"][0] == "1 circuit inclus"
    assert plan["features"][3] == "LiveTiming"
