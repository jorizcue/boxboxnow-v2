"""Public endpoints — no authentication required."""

import json as _json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.database import get_db
from app.models.schemas import AppSetting, ProductTabConfig
from app.services.plan_translations import localize_plan

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["public"])


@router.get("/public/site-status")
async def site_status(db: AsyncSession = Depends(get_db)):
    """Return launch + maintenance flags so the SPA can decide what to
    render on `/` (countdown vs marketing vs maintenance) without an
    auth token. Also returns the server's current time so the
    countdown can interpolate against it instead of the client's
    clock.

    Empty `launch_at` means "already launched" — countdown disabled.
    """
    keys = ("site_launch_at", "site_maintenance")
    result = await db.execute(select(AppSetting).where(AppSetting.key.in_(keys)))
    rows = {s.key: s.value for s in result.scalars().all()}
    raw_launch = (rows.get("site_launch_at") or "").strip()
    return {
        "launch_at": raw_launch or None,
        "maintenance": (rows.get("site_maintenance") or "false").lower() == "true",
        "now": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/plans")
async def list_plans(lang: str = "es", db: AsyncSession = Depends(get_db)):
    """Return visible product configs for the pricing page. No auth required.

    Optional ``?lang=`` (``es|en|it|de|fr``, default ``es``) localizes
    ``display_name`` / ``description`` / ``features`` via the per-row
    ``*_i18n`` columns with per-field/per-bullet Spanish fallback. The
    response SHAPE is unchanged; ``lang=es`` (or any unknown value) is
    byte-identical to the previous Spanish-only output (regression-safe).
    """
    result = await db.execute(
        select(ProductTabConfig)
        .where(ProductTabConfig.is_visible == True)
        .order_by(ProductTabConfig.sort_order)
    )
    configs = result.scalars().all()
    plans = []
    for c in configs:
        es_features = _json.loads(c.features) if c.features else []
        display_name, description, features = localize_plan(
            display_name=c.display_name,
            description=c.description,
            features=es_features,
            dn_i18n=c.display_name_i18n,
            desc_i18n=c.description_i18n,
            feat_i18n=c.features_i18n,
            lang=lang,
        )
        plans.append({
            "plan_type": c.plan_type,
            "display_name": display_name,
            "description": description,
            "features": features,
            "price_amount": c.price_amount,
            "billing_interval": c.billing_interval,
            "is_popular": c.is_popular,
            "coming_soon": bool(c.coming_soon) if c.coming_soon is not None else False,
            "sort_order": c.sort_order,
            "per_circuit": bool(c.per_circuit) if c.per_circuit is not None else True,
            "circuits_to_select": int(c.circuits_to_select) if c.circuits_to_select else 1,
        })
    return plans
