"""Public endpoints — no authentication required."""

import json as _json
import logging
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.database import get_db
from app.models.schemas import ProductTabConfig

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["public"])


@router.get("/plans")
async def list_plans(db: AsyncSession = Depends(get_db)):
    """Return visible product configs for the pricing page. No auth required."""
    result = await db.execute(
        select(ProductTabConfig)
        .where(ProductTabConfig.is_visible == True)
        .order_by(ProductTabConfig.sort_order)
    )
    configs = result.scalars().all()
    return [
        {
            "plan_type": c.plan_type,
            "display_name": c.display_name,
            "description": c.description,
            "features": _json.loads(c.features) if c.features else [],
            "price_monthly": c.price_monthly,
            "price_annual": c.price_annual,
            "is_popular": c.is_popular,
            "sort_order": c.sort_order,
        }
        for c in configs
    ]
