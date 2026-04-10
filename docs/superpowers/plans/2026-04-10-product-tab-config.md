# Dynamic Product/Tab Configuration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hardcoded `PLAN_CONFIG` with a database-backed `product_tab_config` table, admin UI for managing product-to-tab mappings, and a dynamic pricing page fed by a public API.

**Architecture:** New `ProductTabConfig` SQLAlchemy model maps Stripe product IDs to capabilities (tabs, max_devices) and display info (pricing card content). Backend admin CRUD endpoints manage configs; a public `/api/plans` endpoint feeds the landing page. `_apply_plan_to_user` reads from DB with PLAN_CONFIG fallback. Registration reads default/trial tabs from AppSettings.

**Tech Stack:** Python/FastAPI, SQLAlchemy (async SQLite), stripe-python v15, Next.js 14 (App Router), TypeScript, Tailwind CSS, Zustand.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/app/models/schemas.py` | Modify | Add `ProductTabConfig` SQLAlchemy model |
| `backend/app/models/pydantic_models.py` | Modify | Add Pydantic request/response models for product config |
| `backend/app/models/database.py` | Modify | Add table creation + seed new AppSettings defaults |
| `backend/app/api/admin_routes.py` | Modify | Add product config CRUD + Stripe products listing + new platform settings keys |
| `backend/app/api/stripe_routes.py` | Modify | Change `_apply_plan_to_user` to read from DB; update checkout to resolve from config |
| `backend/app/api/auth_routes.py` | Modify | Read default/trial tabs+devices from AppSettings on registration |
| `backend/app/api/public_routes.py` | Create | `GET /api/plans` public endpoint |
| `backend/app/main.py` | Modify | Register new `public_router` |
| `frontend/src/lib/api.ts` | Modify | Add API methods for product config + public plans |
| `frontend/src/components/admin/AdminPanel.tsx` | Modify | Expand `PlatformSettingsManager` with product config UI |
| `frontend/src/components/landing/PricingToggle.tsx` | Modify | Fetch plans dynamically from API |

---

### Task 1: Add `ProductTabConfig` SQLAlchemy Model

**Files:**
- Modify: `backend/app/models/schemas.py` (after `AppSetting` class, ~line 239)

- [ ] **Step 1: Add the ProductTabConfig model to schemas.py**

Add after the `AppSetting` class (line 239):

```python
class ProductTabConfig(Base):
    """Maps a Stripe product to the capabilities it grants and pricing display info."""
    __tablename__ = "product_tab_config"

    id = Column(Integer, primary_key=True, autoincrement=True)
    stripe_product_id = Column(String(255), unique=True, nullable=False, index=True)
    plan_type = Column(String(50), nullable=False)  # basic_monthly, basic_annual, pro_monthly, pro_annual, event
    tabs = Column(Text, nullable=False, default="[]")  # JSON array of tab slugs
    max_devices = Column(Integer, nullable=False, default=1)
    display_name = Column(String(100), nullable=False, default="")
    description = Column(Text, nullable=True)
    features = Column(Text, nullable=True, default="[]")  # JSON array of feature strings
    price_monthly = Column(Float, nullable=True)
    price_annual = Column(Float, nullable=True)
    is_popular = Column(Boolean, default=False, nullable=False)
    is_visible = Column(Boolean, default=True, nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)
```

Make sure the necessary imports are already present at the top of the file: `Column, Integer, String, Boolean, Float, Text, ForeignKey, DateTime` from `sqlalchemy`, and `relationship` from `sqlalchemy.orm`. The file already has these.

- [ ] **Step 2: Add table creation to database.py init_db**

In `backend/app/models/database.py`, the `init_db()` function calls `Base.metadata.create_all` which auto-creates all tables defined on `Base`. Since `ProductTabConfig` extends `Base`, it will be created automatically. However, we need to seed the new AppSettings defaults.

Add at the end of `init_db()` (after the existing seed blocks, before the final closing of the `async with` block):

```python
        # Seed default/trial tab configuration in app_settings
        new_settings_defaults = {
            "default_tabs": '["race","pit","live","config","adjusted","adjusted-beta","driver","driver-config"]',
            "default_max_devices": "2",
            "trial_tabs": '["race","pit","live","config","adjusted","adjusted-beta","driver","driver-config","replay","analytics","insights"]',
            "trial_max_devices": "2",
        }
        for key, default_value in new_settings_defaults.items():
            result = await conn.execute(text(f"SELECT key FROM app_settings WHERE key = '{key}'"))
            if not result.fetchone():
                await conn.execute(
                    text("INSERT INTO app_settings (key, value) VALUES (:key, :value)"),
                    {"key": key, "value": default_value},
                )
```

- [ ] **Step 3: Verify the import of ProductTabConfig is accessible**

Ensure `ProductTabConfig` is importable. Since `schemas.py` is used via `from app.models.schemas import ...`, no `__init__.py` changes are needed — just add the class to the file.

- [ ] **Step 4: Commit**

```bash
git add backend/app/models/schemas.py backend/app/models/database.py
git commit -m "feat: add ProductTabConfig model and seed default/trial AppSettings"
```

---

### Task 2: Add Pydantic Models for Product Config

**Files:**
- Modify: `backend/app/models/pydantic_models.py` (add at end of file, ~line 455)

- [ ] **Step 1: Add Pydantic models for product config CRUD**

Add at the end of `backend/app/models/pydantic_models.py`:

```python
# --- Product Tab Config ---

class ProductTabConfigOut(BaseModel):
    """Response model for product tab config (admin)."""
    id: int
    stripe_product_id: str
    plan_type: str
    tabs: list[str] = []
    max_devices: int = 1
    display_name: str = ""
    description: str | None = None
    features: list[str] = []
    price_monthly: float | None = None
    price_annual: float | None = None
    is_popular: bool = False
    is_visible: bool = True
    sort_order: int = 0

    model_config = {"from_attributes": True}


class ProductTabConfigCreate(BaseModel):
    """Request model for creating a product tab config."""
    stripe_product_id: str
    plan_type: str
    tabs: list[str] = []
    max_devices: int = 1
    display_name: str = ""
    description: str | None = None
    features: list[str] = []
    price_monthly: float | None = None
    price_annual: float | None = None
    is_popular: bool = False
    is_visible: bool = True
    sort_order: int = 0


class ProductTabConfigUpdate(BaseModel):
    """Request model for updating a product tab config."""
    stripe_product_id: str | None = None
    plan_type: str | None = None
    tabs: list[str] | None = None
    max_devices: int | None = None
    display_name: str | None = None
    description: str | None = None
    features: list[str] | None = None
    price_monthly: float | None = None
    price_annual: float | None = None
    is_popular: bool | None = None
    is_visible: bool | None = None
    sort_order: int | None = None


class PlanPublicOut(BaseModel):
    """Public response model for pricing page — no sensitive fields."""
    plan_type: str
    display_name: str
    description: str | None = None
    features: list[str] = []
    price_monthly: float | None = None
    price_annual: float | None = None
    is_popular: bool = False
    sort_order: int = 0
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/models/pydantic_models.py
git commit -m "feat: add Pydantic models for product tab config CRUD and public plans"
```

---

### Task 3: Add Admin CRUD Endpoints for Product Config

**Files:**
- Modify: `backend/app/api/admin_routes.py` (add after platform-settings section, ~line 482)

- [ ] **Step 1: Add product config CRUD endpoints**

Add the following imports at the top of `admin_routes.py` (alongside existing imports). The file already imports `select` from sqlalchemy and `User`, `AppSetting` etc from schemas. Add `ProductTabConfig` to the schemas import:

```python
from app.models.schemas import User, ..., ProductTabConfig
```

Then add the following endpoints at the end of `admin_routes.py` (after line 482):

```python
# --- Product Tab Config ---

@router.get("/product-config")
async def list_product_configs(admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    """List all product-to-tab configurations."""
    import json as _json
    result = await db.execute(select(ProductTabConfig).order_by(ProductTabConfig.sort_order))
    configs = result.scalars().all()
    return [
        {
            "id": c.id,
            "stripe_product_id": c.stripe_product_id,
            "plan_type": c.plan_type,
            "tabs": _json.loads(c.tabs) if c.tabs else [],
            "max_devices": c.max_devices,
            "display_name": c.display_name,
            "description": c.description,
            "features": _json.loads(c.features) if c.features else [],
            "price_monthly": c.price_monthly,
            "price_annual": c.price_annual,
            "is_popular": c.is_popular,
            "is_visible": c.is_visible,
            "sort_order": c.sort_order,
        }
        for c in configs
    ]


@router.post("/product-config")
async def create_product_config(request: Request, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    """Create a product-to-tab configuration."""
    import json as _json
    body = await request.json()

    # Check unique stripe_product_id
    existing = await db.execute(
        select(ProductTabConfig).where(ProductTabConfig.stripe_product_id == body.get("stripe_product_id", ""))
    )
    if existing.scalar_one_or_none():
        raise HTTPException(409, "Product config already exists for this Stripe product")

    config = ProductTabConfig(
        stripe_product_id=body["stripe_product_id"],
        plan_type=body.get("plan_type", ""),
        tabs=_json.dumps(body.get("tabs", [])),
        max_devices=body.get("max_devices", 1),
        display_name=body.get("display_name", ""),
        description=body.get("description"),
        features=_json.dumps(body.get("features", [])),
        price_monthly=body.get("price_monthly"),
        price_annual=body.get("price_annual"),
        is_popular=body.get("is_popular", False),
        is_visible=body.get("is_visible", True),
        sort_order=body.get("sort_order", 0),
    )
    db.add(config)
    await db.commit()
    await db.refresh(config)

    return {
        "id": config.id,
        "stripe_product_id": config.stripe_product_id,
        "plan_type": config.plan_type,
        "tabs": _json.loads(config.tabs) if config.tabs else [],
        "max_devices": config.max_devices,
        "display_name": config.display_name,
        "description": config.description,
        "features": _json.loads(config.features) if config.features else [],
        "price_monthly": config.price_monthly,
        "price_annual": config.price_annual,
        "is_popular": config.is_popular,
        "is_visible": config.is_visible,
        "sort_order": config.sort_order,
    }


@router.put("/product-config/{config_id}")
async def update_product_config(config_id: int, request: Request, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    """Update a product-to-tab configuration."""
    import json as _json
    result = await db.execute(select(ProductTabConfig).where(ProductTabConfig.id == config_id))
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(404, "Product config not found")

    body = await request.json()

    if "stripe_product_id" in body:
        config.stripe_product_id = body["stripe_product_id"]
    if "plan_type" in body:
        config.plan_type = body["plan_type"]
    if "tabs" in body:
        config.tabs = _json.dumps(body["tabs"])
    if "max_devices" in body:
        config.max_devices = body["max_devices"]
    if "display_name" in body:
        config.display_name = body["display_name"]
    if "description" in body:
        config.description = body["description"]
    if "features" in body:
        config.features = _json.dumps(body["features"])
    if "price_monthly" in body:
        config.price_monthly = body["price_monthly"]
    if "price_annual" in body:
        config.price_annual = body["price_annual"]
    if "is_popular" in body:
        config.is_popular = body["is_popular"]
    if "is_visible" in body:
        config.is_visible = body["is_visible"]
    if "sort_order" in body:
        config.sort_order = body["sort_order"]

    await db.commit()
    return {
        "id": config.id,
        "stripe_product_id": config.stripe_product_id,
        "plan_type": config.plan_type,
        "tabs": _json.loads(config.tabs) if config.tabs else [],
        "max_devices": config.max_devices,
        "display_name": config.display_name,
        "description": config.description,
        "features": _json.loads(config.features) if config.features else [],
        "price_monthly": config.price_monthly,
        "price_annual": config.price_annual,
        "is_popular": config.is_popular,
        "is_visible": config.is_visible,
        "sort_order": config.sort_order,
    }


@router.delete("/product-config/{config_id}")
async def delete_product_config(config_id: int, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    """Delete a product-to-tab configuration."""
    result = await db.execute(select(ProductTabConfig).where(ProductTabConfig.id == config_id))
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(404, "Product config not found")
    await db.delete(config)
    await db.commit()
    return {"ok": True}


@router.get("/stripe-products")
async def list_stripe_products(admin: User = Depends(require_admin)):
    """List active products from Stripe API for the admin dropdown."""
    import stripe as _stripe
    from app.config import get_settings
    settings = get_settings()
    _stripe.api_key = settings.stripe_secret_key

    try:
        products = _stripe.Product.list(active=True, limit=100)
        return [
            {
                "id": p.id,
                "name": p.name,
                "description": p.description,
            }
            for p in products.data
        ]
    except Exception as e:
        logger.error(f"Failed to list Stripe products: {e}")
        raise HTTPException(500, "Failed to fetch Stripe products")
```

- [ ] **Step 2: Extend PLATFORM_SETTINGS_KEYS with new keys**

In the same file, update `PLATFORM_SETTINGS_KEYS` and `PLATFORM_DEFAULTS` (around line 438-448):

Replace:
```python
PLATFORM_SETTINGS_KEYS = [
    "trial_days",           # 0 = trial disabled
    "trial_banner_days",    # Show banner when N days or less remain
    "trial_email_days",     # Send reminder email N days before expiry
]

PLATFORM_DEFAULTS = {
    "trial_days": "14",
    "trial_banner_days": "7",
    "trial_email_days": "3",
}
```

With:
```python
PLATFORM_SETTINGS_KEYS = [
    "trial_days",           # 0 = trial disabled
    "trial_banner_days",    # Show banner when N days or less remain
    "trial_email_days",     # Send reminder email N days before expiry
    "default_tabs",         # JSON array: tabs for new users (no purchase)
    "default_max_devices",  # Max devices for new users
    "trial_tabs",           # JSON array: tabs granted during trial
    "trial_max_devices",    # Max devices during trial
]

PLATFORM_DEFAULTS = {
    "trial_days": "14",
    "trial_banner_days": "7",
    "trial_email_days": "3",
    "default_tabs": '["race","pit","live","config","adjusted","adjusted-beta","driver","driver-config"]',
    "default_max_devices": "2",
    "trial_tabs": '["race","pit","live","config","adjusted","adjusted-beta","driver","driver-config","replay","analytics","insights"]',
    "trial_max_devices": "2",
}
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/admin_routes.py
git commit -m "feat: add product config CRUD endpoints and extended platform settings"
```

---

### Task 4: Create Public Plans Endpoint

**Files:**
- Create: `backend/app/api/public_routes.py`
- Modify: `backend/app/main.py` (register new router, ~line 103)

- [ ] **Step 1: Create public_routes.py**

Create `backend/app/api/public_routes.py`:

```python
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
```

- [ ] **Step 2: Register the public router in main.py**

In `backend/app/main.py`, add the import alongside the existing router imports (look for the block that imports routers, around lines 20-30):

```python
from app.api.public_routes import router as public_router
```

Then add after the existing `app.include_router(stripe_router)` line (~line 110):

```python
app.include_router(public_router)
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/public_routes.py backend/app/main.py
git commit -m "feat: add public /api/plans endpoint for dynamic pricing page"
```

---

### Task 5: Update `_apply_plan_to_user` to Read from DB

**Files:**
- Modify: `backend/app/api/stripe_routes.py` (lines 404-429 and callers)

- [ ] **Step 1: Rewrite `_apply_plan_to_user` to query DB first, fall back to PLAN_CONFIG**

Replace the existing `_apply_plan_to_user` function (lines 404-429) with:

```python
async def _apply_plan_to_user(user_id: int, plan_type: str, db: AsyncSession, stripe_product_id: str | None = None):
    """Apply plan capabilities to user (max_devices, tab access).
    
    Reads from product_tab_config table if stripe_product_id is provided.
    Falls back to PLAN_CONFIG dict for backwards compatibility.
    """
    import json as _json
    from app.models.schemas import UserTabAccess, ProductTabConfig

    tabs: list[str] = []
    max_devices: int = 1

    # Try DB config first (by stripe_product_id)
    if stripe_product_id:
        result = await db.execute(
            select(ProductTabConfig).where(ProductTabConfig.stripe_product_id == stripe_product_id)
        )
        config_row = result.scalar_one_or_none()
        if config_row:
            tabs = _json.loads(config_row.tabs) if config_row.tabs else []
            max_devices = config_row.max_devices
        else:
            logger.warning(f"No product_tab_config for stripe_product_id={stripe_product_id}, falling back to PLAN_CONFIG")

    # Fallback to hardcoded PLAN_CONFIG if DB didn't match
    if not tabs:
        config = PLAN_CONFIG.get(plan_type)
        if not config:
            logger.warning(f"No config found for plan_type={plan_type}")
            return
        tabs = config["tabs"]
        max_devices = config["max_devices"]

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        return

    user.max_devices = max(user.max_devices, max_devices)

    # Add tabs (don't remove existing)
    for tab in tabs:
        existing = await db.execute(
            select(UserTabAccess).where(
                UserTabAccess.user_id == user_id,
                UserTabAccess.tab == tab,
            )
        )
        if not existing.scalar_one_or_none():
            db.add(UserTabAccess(user_id=user_id, tab=tab))
```

- [ ] **Step 2: Update `_handle_checkout_completed` to extract and pass `stripe_product_id`**

In `_handle_checkout_completed` (line 228), we need to extract the Stripe product ID from the session/subscription and pass it to `_apply_plan_to_user`.

For subscription mode (around line 266), change:
```python
            await _apply_plan_to_user(user_id, plan_type, db)
```
to:
```python
            # Extract stripe_product_id from subscription items
            stripe_product_id = None
            if sub_id:
                try:
                    sub_obj = s.Subscription.retrieve(sub_id, expand=["items.data"])
                    if sub_obj.items and sub_obj.items.data:
                        stripe_product_id = sub_obj.items.data[0].price.product
                except Exception as e:
                    logger.warning(f"Could not retrieve subscription product_id: {e}")

            await _apply_plan_to_user(user_id, plan_type, db, stripe_product_id=stripe_product_id)
```

For payment mode (around line 300), change:
```python
        await _apply_plan_to_user(user_id, plan_type, db)
```
to:
```python
        # Extract product_id from checkout session line items
        stripe_product_id = None
        checkout_id = session_data.get("id")
        if checkout_id:
            try:
                line_items = s.checkout.Session.list_line_items(checkout_id)
                if line_items.data:
                    stripe_product_id = line_items.data[0].price.product
            except Exception as e:
                logger.warning(f"Could not retrieve checkout product_id: {e}")

        await _apply_plan_to_user(user_id, plan_type, db, stripe_product_id=stripe_product_id)
```

Note: The `s` (stripe module) parameter is already available in `_handle_checkout_completed`. For the payment mode block, `s` is not passed — we need to get it. Add at the top of the payment block (around line 285):

Actually, looking at the code again, `_handle_checkout_completed` receives `s` as a parameter. But inside the payment block we need to use `s`. The `s` param is already in scope. No extra work needed.

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/stripe_routes.py
git commit -m "feat: _apply_plan_to_user reads from product_tab_config with PLAN_CONFIG fallback"
```

---

### Task 6: Update Registration to Read Default/Trial Tabs from AppSettings

**Files:**
- Modify: `backend/app/api/auth_routes.py` (registration ~lines 312-345, and Google OAuth registration ~lines 596-630)

- [ ] **Step 1: Create a helper function to read tab/device config from AppSettings**

Add this helper near the top of `auth_routes.py` (after the existing `_get_platform_setting` function, around line 55):

```python
async def _get_registration_config(db) -> dict:
    """Read default and trial tab/device configuration from AppSettings."""
    import json as _json

    trial_days = int(await _get_platform_setting(db, "trial_days"))

    if trial_days > 0:
        tabs_json = await _get_platform_setting(db, "trial_tabs")
        max_devices_str = await _get_platform_setting(db, "trial_max_devices")
        # Parse with fallbacks
        try:
            tabs = _json.loads(tabs_json) if tabs_json else []
        except (ValueError, TypeError):
            tabs = ["race", "pit", "live", "config", "adjusted", "adjusted-beta", "driver", "driver-config", "replay", "analytics", "insights"]
        try:
            max_devices = int(max_devices_str) if max_devices_str else 2
        except (ValueError, TypeError):
            max_devices = 2
    else:
        tabs_json = await _get_platform_setting(db, "default_tabs")
        max_devices_str = await _get_platform_setting(db, "default_max_devices")
        try:
            tabs = _json.loads(tabs_json) if tabs_json else []
        except (ValueError, TypeError):
            tabs = ["race", "pit", "live", "config", "adjusted", "adjusted-beta", "driver", "driver-config"]
        try:
            max_devices = int(max_devices_str) if max_devices_str else 2
        except (ValueError, TypeError):
            max_devices = 2

    return {"trial_days": trial_days, "tabs": tabs, "max_devices": max_devices}
```

Also ensure the existing `_get_platform_setting` returns empty string (not None) for missing keys so parsing works. Check the existing implementation — if it returns `None` for missing keys, we handle it in the try/except above.

- [ ] **Step 2: Update registration to use the helper**

In the `register` endpoint (line 286), replace the trial/default tab assignment block (lines 312-345):

Replace:
```python
    # Check trial configuration
    trial_days = int(await _get_platform_setting(db, "trial_days"))

    if trial_days > 0:
        # Assign all tabs for trial users (full access during trial)
        trial_tabs = ["race", "pit", "live", "config", "adjusted", "adjusted-beta", "driver", "driver-config", "replay", "analytics", "insights"]
        for tab in trial_tabs:
            db.add(UserTabAccess(user_id=user.id, tab=tab))

        # Create trial subscription with configurable duration
        trial_end = datetime.now(timezone.utc) + timedelta(days=trial_days)
        trial_sub = Subscription(
            user_id=user.id,
            plan_type="trial",
            status="trialing",
            current_period_start=datetime.now(timezone.utc),
            current_period_end=trial_end,
        )
        db.add(trial_sub)

        # Grant circuit access to all circuits for trial period
        circuits_result = await db.execute(select(Circuit))
        for circuit in circuits_result.scalars().all():
            db.add(UserCircuitAccess(
                user_id=user.id,
                circuit_id=circuit.id,
                valid_from=datetime.now(timezone.utc),
                valid_until=trial_end,
            ))
    else:
        # No trial: assign basic tabs only
        basic_tabs = ["race", "pit", "live", "config", "adjusted", "adjusted-beta", "driver", "driver-config"]
        for tab in basic_tabs:
            db.add(UserTabAccess(user_id=user.id, tab=tab))
```

With:
```python
    # Read registration config from AppSettings
    reg_config = await _get_registration_config(db)
    trial_days = reg_config["trial_days"]

    # Set max_devices from config
    user.max_devices = reg_config["max_devices"]

    # Assign tabs from config
    for tab in reg_config["tabs"]:
        db.add(UserTabAccess(user_id=user.id, tab=tab))

    if trial_days > 0:
        # Create trial subscription with configurable duration
        trial_end = datetime.now(timezone.utc) + timedelta(days=trial_days)
        trial_sub = Subscription(
            user_id=user.id,
            plan_type="trial",
            status="trialing",
            current_period_start=datetime.now(timezone.utc),
            current_period_end=trial_end,
        )
        db.add(trial_sub)

        # Grant circuit access to all circuits for trial period
        circuits_result = await db.execute(select(Circuit))
        for circuit in circuits_result.scalars().all():
            db.add(UserCircuitAccess(
                user_id=user.id,
                circuit_id=circuit.id,
                valid_from=datetime.now(timezone.utc),
                valid_until=trial_end,
            ))
```

- [ ] **Step 3: Apply the same change to Google OAuth registration**

The Google OAuth callback (around lines 596-630 in `auth_routes.py`) has the same hardcoded trial/default tab logic. Apply the exact same replacement pattern:

Find the block that starts with:
```python
        trial_days = int(await _get_platform_setting(db, "trial_days"))
```
and ends with assigning basic_tabs. Replace with the same `_get_registration_config` pattern:

```python
        # Read registration config from AppSettings
        reg_config = await _get_registration_config(db)
        trial_days = reg_config["trial_days"]

        # Set max_devices from config
        user.max_devices = reg_config["max_devices"]

        # Assign tabs from config
        for tab in reg_config["tabs"]:
            db.add(UserTabAccess(user_id=user.id, tab=tab))

        if trial_days > 0:
            trial_end = datetime.now(timezone.utc) + timedelta(days=trial_days)
            trial_sub = Subscription(
                user_id=user.id,
                plan_type="trial",
                status="trialing",
                current_period_start=datetime.now(timezone.utc),
                current_period_end=trial_end,
            )
            db.add(trial_sub)

            circuits_result = await db.execute(select(Circuit))
            for circuit in circuits_result.scalars().all():
                db.add(UserCircuitAccess(
                    user_id=user.id,
                    circuit_id=circuit.id,
                    valid_from=datetime.now(timezone.utc),
                    valid_until=trial_end,
                ))
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/auth_routes.py
git commit -m "feat: registration reads default/trial tabs and max_devices from AppSettings"
```

---

### Task 7: Add Frontend API Methods

**Files:**
- Modify: `frontend/src/lib/api.ts` (add new methods, ~line 298)

- [ ] **Step 1: Add API methods for product config and public plans**

Add these methods inside the `api` object in `frontend/src/lib/api.ts`, after the `updatePlatformSettings` method (around line 298):

```typescript
  // Product tab config (admin)
  getProductConfigs: () =>
    fetchApi<any[]>("/api/admin/product-config"),
  createProductConfig: (data: any) =>
    fetchApi<any>("/api/admin/product-config", { method: "POST", body: JSON.stringify(data) }),
  updateProductConfig: (id: number, data: any) =>
    fetchApi<any>(`/api/admin/product-config/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteProductConfig: (id: number) =>
    fetchApi<any>(`/api/admin/product-config/${id}`, { method: "DELETE" }),
  getStripeProducts: () =>
    fetchApi<{ id: string; name: string; description: string | null }[]>("/api/admin/stripe-products"),

  // Public plans (no auth)
  getPlans: () =>
    fetchRaw<{
      plan_type: string;
      display_name: string;
      description: string | null;
      features: string[];
      price_monthly: number | null;
      price_annual: number | null;
      is_popular: boolean;
      sort_order: number;
    }[]>("/api/plans"),
```

Note: `getPlans` uses `fetchRaw` (no auth) since it's a public endpoint. This is the same pattern used by `getTrialConfig`.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat: add API methods for product config CRUD and public plans"
```

---

### Task 8: Expand Admin PlatformSettingsManager with Product Config UI

**Files:**
- Modify: `frontend/src/components/admin/AdminPanel.tsx` (PlatformSettingsManager function, lines 1094-1237)

- [ ] **Step 1: Add state and data loading for product configs and registration/trial tab settings**

Replace the entire `PlatformSettingsManager` function (lines 1094-1237) with the expanded version below. The new version adds three sections: Registration Defaults, Trial Config, and Products/Plans.

```typescript
function PlatformSettingsManager() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Product configs
  const [configs, setConfigs] = useState<any[]>([]);
  const [stripeProducts, setStripeProducts] = useState<{ id: string; name: string; description: string | null }[]>([]);
  const [editingConfig, setEditingConfig] = useState<any | null>(null);
  const [showConfigForm, setShowConfigForm] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const confirm = useConfirm();

  // Collapsible sections
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    registration: true,
    trial: true,
    products: true,
  });

  const toggleSection = (key: string) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    try {
      const [settingsData, configsData] = await Promise.all([
        api.getPlatformSettings(),
        api.getProductConfigs(),
      ]);
      setSettings(settingsData);
      setConfigs(configsData);
    } catch (e) {
      console.error("Failed to load platform settings", e);
    }
    setLoading(false);
  };

  const loadStripeProducts = async () => {
    if (stripeProducts.length > 0) return; // Already loaded
    try {
      const data = await api.getStripeProducts();
      setStripeProducts(data);
    } catch (e) {
      console.error("Failed to load Stripe products", e);
    }
  };

  const handleChange = (key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleTabToggle = (settingKey: string, tab: string) => {
    const current: string[] = (() => {
      try { return JSON.parse(settings[settingKey] || "[]"); } catch { return []; }
    })();
    const updated = current.includes(tab)
      ? current.filter((t) => t !== tab)
      : [...current, tab];
    handleChange(settingKey, JSON.stringify(updated));
  };

  const getTabsFromSetting = (key: string): string[] => {
    try { return JSON.parse(settings[key] || "[]"); } catch { return []; }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updatePlatformSettings(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      console.error("Failed to save platform settings", e);
    }
    setSaving(false);
  };

  // --- Product config form ---
  const emptyConfig = {
    stripe_product_id: "",
    plan_type: "",
    tabs: [] as string[],
    max_devices: 1,
    display_name: "",
    description: "",
    features: [] as string[],
    price_monthly: null as number | null,
    price_annual: null as number | null,
    is_popular: false,
    is_visible: true,
    sort_order: 0,
  };

  const [configForm, setConfigForm] = useState(emptyConfig);
  const [featuresText, setFeaturesText] = useState("");

  const openNewConfig = () => {
    setEditingConfig(null);
    setConfigForm(emptyConfig);
    setFeaturesText("");
    setShowConfigForm(true);
    loadStripeProducts();
  };

  const openEditConfig = (c: any) => {
    setEditingConfig(c);
    setConfigForm({
      stripe_product_id: c.stripe_product_id,
      plan_type: c.plan_type,
      tabs: c.tabs || [],
      max_devices: c.max_devices,
      display_name: c.display_name || "",
      description: c.description || "",
      features: c.features || [],
      price_monthly: c.price_monthly,
      price_annual: c.price_annual,
      is_popular: c.is_popular,
      is_visible: c.is_visible,
      sort_order: c.sort_order,
    });
    setFeaturesText((c.features || []).join("\n"));
    setShowConfigForm(true);
    loadStripeProducts();
  };

  const handleConfigTabToggle = (tab: string) => {
    setConfigForm((prev) => ({
      ...prev,
      tabs: prev.tabs.includes(tab)
        ? prev.tabs.filter((t) => t !== tab)
        : [...prev.tabs, tab],
    }));
  };

  const saveConfig = async () => {
    setConfigSaving(true);
    const data = {
      ...configForm,
      features: featuresText.split("\n").map((f) => f.trim()).filter(Boolean),
    };
    try {
      if (editingConfig) {
        await api.updateProductConfig(editingConfig.id, data);
      } else {
        await api.createProductConfig(data);
      }
      setShowConfigForm(false);
      const refreshed = await api.getProductConfigs();
      setConfigs(refreshed);
    } catch (e: any) {
      console.error("Failed to save product config", e);
      alert(e.message || "Error saving config");
    }
    setConfigSaving(false);
  };

  const deleteConfig = async (id: number) => {
    const ok = await confirm("Eliminar esta configuracion de producto?");
    if (!ok) return;
    try {
      await api.deleteProductConfig(id);
      setConfigs((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      console.error("Failed to delete config", e);
    }
  };

  const trialEnabled = parseInt(settings.trial_days || "0") > 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-accent" />
      </div>
    );
  }

  const PLAN_TYPES = ["basic_monthly", "basic_annual", "pro_monthly", "pro_annual", "event"];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h2 className="text-lg font-bold text-white mb-2">Configuracion de Plataforma</h2>

      {/* ── Section: Registration Defaults ── */}
      <div className="bg-surface rounded-xl border border-border">
        <button
          onClick={() => toggleSection("registration")}
          className="w-full flex items-center justify-between p-5 text-left"
        >
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
            Registro — Tabs por Defecto
          </h3>
          <span className="text-neutral-500 text-xs">{openSections.registration ? "▲" : "▼"}</span>
        </button>
        {openSections.registration && (
          <div className="px-5 pb-5 space-y-4">
            <div>
              <label className="block text-xs text-neutral-400 mb-2 uppercase tracking-wider">
                Tabs para nuevos usuarios (sin compra)
              </label>
              <div className="flex flex-wrap gap-2">
                {STANDARD_TAB_OPTIONS.map(([key, label]) => {
                  const active = getTabsFromSetting("default_tabs").includes(key);
                  return (
                    <button
                      key={key}
                      onClick={() => handleTabToggle("default_tabs", key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        active
                          ? "bg-accent/20 border-accent/50 text-accent"
                          : "bg-black border-border text-neutral-500 hover:border-neutral-600"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="block text-xs text-neutral-400 mb-1.5 uppercase tracking-wider">
                Max dispositivos (registro)
              </label>
              <input
                type="number"
                min="1"
                max="50"
                value={settings.default_max_devices || "2"}
                onChange={(e) => handleChange("default_max_devices", e.target.value)}
                className="w-24 bg-black border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent/50 transition-colors"
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Section: Trial ── */}
      <div className="bg-surface rounded-xl border border-border">
        <button
          onClick={() => toggleSection("trial")}
          className="w-full flex items-center justify-between p-5 text-left"
        >
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
            Prueba Gratuita (Trial)
          </h3>
          <span className="text-neutral-500 text-xs">{openSections.trial ? "▲" : "▼"}</span>
        </button>
        {openSections.trial && (
          <div className="px-5 pb-5 space-y-4">
            {/* Trial Days */}
            <div>
              <label className="block text-xs text-neutral-400 mb-1.5 uppercase tracking-wider">
                Dias de prueba gratuita
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min="0"
                  max="365"
                  value={settings.trial_days || "0"}
                  onChange={(e) => handleChange("trial_days", e.target.value)}
                  className="w-24 bg-black border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent/50 transition-colors"
                />
                <span className="text-xs text-neutral-500">
                  {trialEnabled
                    ? `Los nuevos usuarios tendran ${settings.trial_days} dias de acceso completo`
                    : "Trial desactivado — los usuarios deben comprar via Stripe"}
                </span>
              </div>
              <p className="text-[11px] text-neutral-600 mt-1">
                Pon 0 para desactivar el trial.
              </p>
            </div>

            {/* Trial Tabs */}
            <div className={!trialEnabled ? "opacity-40 pointer-events-none" : ""}>
              <label className="block text-xs text-neutral-400 mb-2 uppercase tracking-wider">
                Tabs durante el trial
              </label>
              <div className="flex flex-wrap gap-2">
                {STANDARD_TAB_OPTIONS.map(([key, label]) => {
                  const active = getTabsFromSetting("trial_tabs").includes(key);
                  return (
                    <button
                      key={key}
                      onClick={() => handleTabToggle("trial_tabs", key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        active
                          ? "bg-accent/20 border-accent/50 text-accent"
                          : "bg-black border-border text-neutral-500 hover:border-neutral-600"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Trial Max Devices */}
            <div className={!trialEnabled ? "opacity-40 pointer-events-none" : ""}>
              <label className="block text-xs text-neutral-400 mb-1.5 uppercase tracking-wider">
                Max dispositivos (trial)
              </label>
              <input
                type="number"
                min="1"
                max="50"
                value={settings.trial_max_devices || "2"}
                onChange={(e) => handleChange("trial_max_devices", e.target.value)}
                className="w-24 bg-black border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent/50 transition-colors"
              />
            </div>

            {/* Trial Banner Days */}
            <div className={!trialEnabled ? "opacity-40 pointer-events-none" : ""}>
              <label className="block text-xs text-neutral-400 mb-1.5 uppercase tracking-wider">
                Mostrar banner de trial
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min="0"
                  max="365"
                  value={settings.trial_banner_days || "0"}
                  onChange={(e) => handleChange("trial_banner_days", e.target.value)}
                  className="w-24 bg-black border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent/50 transition-colors"
                />
                <span className="text-xs text-neutral-500">
                  dias antes de expirar
                </span>
              </div>
            </div>

            {/* Trial Email Days */}
            <div className={!trialEnabled ? "opacity-40 pointer-events-none" : ""}>
              <label className="block text-xs text-neutral-400 mb-1.5 uppercase tracking-wider">
                Email de aviso
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min="0"
                  max="365"
                  value={settings.trial_email_days || "0"}
                  onChange={(e) => handleChange("trial_email_days", e.target.value)}
                  className="w-24 bg-black border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent/50 transition-colors"
                />
                <span className="text-xs text-neutral-500">
                  dias antes de expirar
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Save Settings Button ── */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-accent hover:bg-accent-hover disabled:opacity-40 text-black font-semibold px-6 py-2.5 rounded-lg transition-colors text-sm"
        >
          {saving ? "Guardando..." : "Guardar configuracion"}
        </button>
        {saved && (
          <span className="text-accent text-sm animate-fade-in">Guardado</span>
        )}
      </div>

      {/* ── Section: Products / Plans ── */}
      <div className="bg-surface rounded-xl border border-border">
        <button
          onClick={() => toggleSection("products")}
          className="w-full flex items-center justify-between p-5 text-left"
        >
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
            Productos / Planes (Stripe)
          </h3>
          <span className="text-neutral-500 text-xs">{openSections.products ? "▲" : "▼"}</span>
        </button>
        {openSections.products && (
          <div className="px-5 pb-5">
            {/* Product table */}
            {configs.length === 0 ? (
              <p className="text-sm text-neutral-500 mb-4">
                No hay productos configurados. Agrega uno para activar los planes dinamicos.
              </p>
            ) : (
              <div className="overflow-x-auto mb-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-neutral-500 text-xs uppercase border-b border-border">
                      <th className="text-left py-2 pr-4">Nombre</th>
                      <th className="text-left py-2 pr-4">Tipo</th>
                      <th className="text-left py-2 pr-4">Tabs</th>
                      <th className="text-center py-2 pr-4">Disp.</th>
                      <th className="text-center py-2 pr-4">Visible</th>
                      <th className="text-right py-2">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {configs.map((c) => (
                      <tr key={c.id} className="border-b border-border/50">
                        <td className="py-2.5 pr-4 text-white font-medium">{c.display_name || c.plan_type}</td>
                        <td className="py-2.5 pr-4 text-neutral-400">{c.plan_type}</td>
                        <td className="py-2.5 pr-4">
                          <div className="flex flex-wrap gap-1">
                            {(c.tabs || []).slice(0, 4).map((t: string) => (
                              <span key={t} className="bg-accent/10 text-accent text-[10px] px-1.5 py-0.5 rounded">
                                {t}
                              </span>
                            ))}
                            {(c.tabs || []).length > 4 && (
                              <span className="text-neutral-500 text-[10px]">+{c.tabs.length - 4}</span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 pr-4 text-center text-neutral-400">{c.max_devices}</td>
                        <td className="py-2.5 pr-4 text-center">
                          <span className={c.is_visible ? "text-accent" : "text-neutral-600"}>
                            {c.is_visible ? "Si" : "No"}
                          </span>
                        </td>
                        <td className="py-2.5 text-right space-x-2">
                          <button
                            onClick={() => openEditConfig(c)}
                            className="text-accent hover:underline text-xs"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => deleteConfig(c.id)}
                            className="text-red-400 hover:underline text-xs"
                          >
                            Eliminar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <button
              onClick={openNewConfig}
              className="bg-accent/10 hover:bg-accent/20 text-accent border border-accent/30 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              + Agregar producto
            </button>

            {/* Config form modal */}
            {showConfigForm && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
                <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
                  <h3 className="text-white font-bold mb-4">
                    {editingConfig ? "Editar producto" : "Nuevo producto"}
                  </h3>
                  <div className="space-y-4">
                    {/* Stripe Product */}
                    <div>
                      <label className="block text-xs text-neutral-400 mb-1 uppercase">Producto Stripe</label>
                      {stripeProducts.length > 0 ? (
                        <select
                          value={configForm.stripe_product_id}
                          onChange={(e) => setConfigForm((p) => ({ ...p, stripe_product_id: e.target.value }))}
                          className="w-full bg-black border border-border rounded-lg px-3 py-2 text-sm text-white"
                        >
                          <option value="">Seleccionar...</option>
                          {stripeProducts.map((sp) => (
                            <option key={sp.id} value={sp.id}>
                              {sp.name} ({sp.id})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          value={configForm.stripe_product_id}
                          onChange={(e) => setConfigForm((p) => ({ ...p, stripe_product_id: e.target.value }))}
                          placeholder="prod_xxx"
                          className="w-full bg-black border border-border rounded-lg px-3 py-2 text-sm text-white"
                        />
                      )}
                    </div>

                    {/* Plan Type */}
                    <div>
                      <label className="block text-xs text-neutral-400 mb-1 uppercase">Tipo de plan</label>
                      <select
                        value={configForm.plan_type}
                        onChange={(e) => setConfigForm((p) => ({ ...p, plan_type: e.target.value }))}
                        className="w-full bg-black border border-border rounded-lg px-3 py-2 text-sm text-white"
                      >
                        <option value="">Seleccionar...</option>
                        {PLAN_TYPES.map((pt) => (
                          <option key={pt} value={pt}>{pt}</option>
                        ))}
                      </select>
                    </div>

                    {/* Tabs */}
                    <div>
                      <label className="block text-xs text-neutral-400 mb-2 uppercase">Tabs que otorga</label>
                      <div className="flex flex-wrap gap-2">
                        {STANDARD_TAB_OPTIONS.map(([key, label]) => {
                          const active = configForm.tabs.includes(key);
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => handleConfigTabToggle(key)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                                active
                                  ? "bg-accent/20 border-accent/50 text-accent"
                                  : "bg-black border-border text-neutral-500 hover:border-neutral-600"
                              }`}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Max Devices */}
                    <div>
                      <label className="block text-xs text-neutral-400 mb-1 uppercase">Max dispositivos</label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={configForm.max_devices}
                        onChange={(e) => setConfigForm((p) => ({ ...p, max_devices: parseInt(e.target.value) || 1 }))}
                        className="w-24 bg-black border border-border rounded-lg px-3 py-2 text-sm text-white"
                      />
                    </div>

                    {/* Display Name */}
                    <div>
                      <label className="block text-xs text-neutral-400 mb-1 uppercase">Nombre (pricing)</label>
                      <input
                        value={configForm.display_name}
                        onChange={(e) => setConfigForm((p) => ({ ...p, display_name: e.target.value }))}
                        placeholder="Plan Basico"
                        className="w-full bg-black border border-border rounded-lg px-3 py-2 text-sm text-white"
                      />
                    </div>

                    {/* Description */}
                    <div>
                      <label className="block text-xs text-neutral-400 mb-1 uppercase">Descripcion</label>
                      <input
                        value={configForm.description}
                        onChange={(e) => setConfigForm((p) => ({ ...p, description: e.target.value }))}
                        placeholder="Para equipos pequenos"
                        className="w-full bg-black border border-border rounded-lg px-3 py-2 text-sm text-white"
                      />
                    </div>

                    {/* Features */}
                    <div>
                      <label className="block text-xs text-neutral-400 mb-1 uppercase">
                        Caracteristicas (una por linea)
                      </label>
                      <textarea
                        value={featuresText}
                        onChange={(e) => setFeaturesText(e.target.value)}
                        rows={4}
                        placeholder={"1 circuito incluido\nHasta 2 dispositivos\nSoporte basico"}
                        className="w-full bg-black border border-border rounded-lg px-3 py-2 text-sm text-white resize-none"
                      />
                    </div>

                    {/* Prices */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-neutral-400 mb-1 uppercase">Precio mensual</label>
                        <input
                          type="number"
                          step="0.01"
                          value={configForm.price_monthly ?? ""}
                          onChange={(e) => setConfigForm((p) => ({ ...p, price_monthly: e.target.value ? parseFloat(e.target.value) : null }))}
                          placeholder="49.00"
                          className="w-full bg-black border border-border rounded-lg px-3 py-2 text-sm text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-neutral-400 mb-1 uppercase">Precio anual</label>
                        <input
                          type="number"
                          step="0.01"
                          value={configForm.price_annual ?? ""}
                          onChange={(e) => setConfigForm((p) => ({ ...p, price_annual: e.target.value ? parseFloat(e.target.value) : null }))}
                          placeholder="490.00"
                          className="w-full bg-black border border-border rounded-lg px-3 py-2 text-sm text-white"
                        />
                      </div>
                    </div>

                    {/* Flags */}
                    <div className="flex gap-6">
                      <label className="flex items-center gap-2 text-sm text-neutral-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={configForm.is_popular}
                          onChange={(e) => setConfigForm((p) => ({ ...p, is_popular: e.target.checked }))}
                          className="accent-accent"
                        />
                        Popular
                      </label>
                      <label className="flex items-center gap-2 text-sm text-neutral-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={configForm.is_visible}
                          onChange={(e) => setConfigForm((p) => ({ ...p, is_visible: e.target.checked }))}
                          className="accent-accent"
                        />
                        Visible en pricing
                      </label>
                    </div>

                    {/* Sort Order */}
                    <div>
                      <label className="block text-xs text-neutral-400 mb-1 uppercase">Orden</label>
                      <input
                        type="number"
                        min="0"
                        value={configForm.sort_order}
                        onChange={(e) => setConfigForm((p) => ({ ...p, sort_order: parseInt(e.target.value) || 0 }))}
                        className="w-24 bg-black border border-border rounded-lg px-3 py-2 text-sm text-white"
                      />
                    </div>
                  </div>

                  {/* Buttons */}
                  <div className="flex gap-3 mt-6">
                    <button
                      onClick={saveConfig}
                      disabled={configSaving || !configForm.stripe_product_id || !configForm.plan_type}
                      className="bg-accent hover:bg-accent-hover disabled:opacity-40 text-black font-semibold px-5 py-2 rounded-lg text-sm transition-colors"
                    >
                      {configSaving ? "Guardando..." : editingConfig ? "Actualizar" : "Crear"}
                    </button>
                    <button
                      onClick={() => setShowConfigForm(false)}
                      className="border border-border text-neutral-400 hover:text-white px-5 py-2 rounded-lg text-sm transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/admin/AdminPanel.tsx
git commit -m "feat: expand PlatformSettingsManager with product config admin UI"
```

---

### Task 9: Make PricingToggle Dynamic

**Files:**
- Modify: `frontend/src/components/landing/PricingToggle.tsx` (full rewrite)

- [ ] **Step 1: Rewrite PricingToggle to fetch plans from API with hardcoded fallback**

Replace the entire content of `frontend/src/components/landing/PricingToggle.tsx`:

```tsx
"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";

interface PlanData {
  plan_type: string;
  display_name: string;
  description: string | null;
  features: string[];
  price_monthly: number | null;
  price_annual: number | null;
  is_popular: boolean;
  sort_order: number;
}

// Hardcoded fallback if API is unavailable
const FALLBACK_PLANS: PlanData[] = [
  {
    plan_type: "basic_monthly",
    display_name: "Basico",
    description: null,
    features: [
      "1 circuito incluido",
      "Posiciones en tiempo real",
      "Gestion de boxes",
      "Clasificacion real",
      "Vista de piloto",
      "Hasta 2 dispositivos",
    ],
    price_monthly: 49,
    price_annual: 490,
    is_popular: false,
    sort_order: 1,
  },
  {
    plan_type: "pro_monthly",
    display_name: "Pro",
    description: null,
    features: [
      "1 circuito incluido",
      "Todo en Basico +",
      "Analitica de karts",
      "GPS Insights",
      "Replay de carreras",
      "Hasta 5 dispositivos",
      "Soporte prioritario",
    ],
    price_monthly: 79,
    price_annual: 790,
    is_popular: true,
    sort_order: 2,
  },
  {
    plan_type: "event",
    display_name: "Evento",
    description: null,
    features: [
      "Acceso completo 48h",
      "1 circuito",
      "Todas las funcionalidades",
      "Hasta 3 dispositivos",
      "Sin compromiso",
    ],
    price_monthly: 50,
    price_annual: 50,
    is_popular: false,
    sort_order: 3,
  },
];

/**
 * Group plans by base type for the pricing toggle.
 * Monthly/annual variants of the same base plan show as one card.
 * Event plans have no annual variant.
 */
function groupPlans(raw: PlanData[]): PlanData[] {
  const map = new Map<string, PlanData>();

  for (const p of raw) {
    // Derive base key: "basic_monthly" and "basic_annual" → "basic"
    const base = p.plan_type.replace(/_monthly$/, "").replace(/_annual$/, "");

    if (!map.has(base)) {
      map.set(base, { ...p });
    } else {
      const existing = map.get(base)!;
      // Merge prices: prefer the one that has each price
      if (p.price_monthly != null && existing.price_monthly == null)
        existing.price_monthly = p.price_monthly;
      if (p.price_annual != null && existing.price_annual == null)
        existing.price_annual = p.price_annual;
      // Keep the more popular one's display info
      if (p.is_popular) existing.is_popular = true;
      // Keep features from the entry with more features
      if (p.features.length > existing.features.length) existing.features = p.features;
    }
  }

  return Array.from(map.values()).sort((a, b) => a.sort_order - b.sort_order);
}

export function PricingToggle() {
  const [annual, setAnnual] = useState(false);
  const [plans, setPlans] = useState<PlanData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getPlans()
      .then((data) => {
        if (data && data.length > 0) {
          setPlans(groupPlans(data));
        } else {
          setPlans(groupPlans(FALLBACK_PLANS));
        }
      })
      .catch(() => {
        setPlans(groupPlans(FALLBACK_PLANS));
      })
      .finally(() => setLoading(false));
  }, []);

  const isEvent = (p: PlanData) => p.plan_type === "event";

  const planLink = (p: PlanData) => {
    const base = p.plan_type.replace(/_monthly$/, "").replace(/_annual$/, "");
    if (isEvent(p)) return `/register?plan=event`;
    return `/register?plan=${base}${annual ? "_annual" : "_monthly"}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
      </div>
    );
  }

  return (
    <div>
      {/* Toggle */}
      <div className="flex items-center justify-center gap-4 mb-16">
        <span
          className={`text-sm font-medium transition-colors ${
            !annual ? "text-white" : "text-muted/50"
          }`}
        >
          Mensual
        </span>
        <button
          onClick={() => setAnnual(!annual)}
          className={`relative h-7 w-14 rounded-full transition-colors ${
            annual ? "bg-accent" : "bg-border"
          }`}
          aria-label="Cambiar entre mensual y anual"
        >
          <span
            className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white transition-transform shadow-md ${
              annual ? "translate-x-7" : ""
            }`}
          />
        </button>
        <span
          className={`text-sm font-medium transition-colors ${
            annual ? "text-white" : "text-muted/50"
          }`}
        >
          Anual
        </span>
        {annual && (
          <span className="rounded-full bg-accent/20 px-3 py-1 text-xs font-semibold text-accent">
            -17%
          </span>
        )}
      </div>

      {/* Cards */}
      <div className={`grid gap-6 max-w-5xl mx-auto ${
        plans.length === 1 ? "md:grid-cols-1 max-w-sm" :
        plans.length === 2 ? "md:grid-cols-2 max-w-3xl" :
        "md:grid-cols-3"
      }`}>
        {plans.map((plan) => (
          <div
            key={plan.plan_type}
            className={`relative rounded-2xl border p-8 transition-all duration-300 hover:-translate-y-1 ${
              plan.is_popular
                ? "border-accent bg-surface shadow-[0_0_40px_rgba(159,229,86,0.1)]"
                : "border-border bg-surface hover:border-border/80"
            }`}
          >
            {plan.is_popular && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent px-4 py-1 text-xs font-bold text-black">
                Popular
              </div>
            )}
            <h3 className="text-lg font-semibold text-white mb-2">
              {plan.display_name}
            </h3>
            {plan.description && (
              <p className="text-sm text-muted/50 mb-2">{plan.description}</p>
            )}
            <div className="mb-6">
              <span className="text-4xl font-bold text-white">
                {isEvent(plan)
                  ? `${plan.price_monthly ?? 0}\u20AC`
                  : annual
                  ? `${plan.price_annual ?? 0}\u20AC`
                  : `${plan.price_monthly ?? 0}\u20AC`}
              </span>
              <span className="text-muted/50 ml-1">
                {isEvent(plan) ? "/evento" : annual ? "/ano" : "/mes"}
              </span>
            </div>
            <ul className="mb-8 space-y-3">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-3 text-sm text-muted/70">
                  <svg
                    className="mt-0.5 h-4 w-4 shrink-0 text-accent"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  {f}
                </li>
              ))}
            </ul>
            <a
              href={planLink(plan)}
              className={`block w-full rounded-lg py-3 text-center text-sm font-semibold transition-colors ${
                plan.is_popular
                  ? "bg-accent text-black hover:bg-accent-hover"
                  : "border border-border text-white hover:border-accent hover:text-accent"
              }`}
            >
              {isEvent(plan) ? "Comprar evento" : "Empezar ahora"}
            </a>
          </div>
        ))}
      </div>

      {/* Extra notes */}
      <div className="mt-12 text-center space-y-2">
        <p className="text-sm text-muted/50">
          Circuitos adicionales desde 15\u20AC/mes
        </p>
        <p className="text-sm text-muted/50">
          {"\u00BF"}Eres un circuito?{" "}
          <a
            href="mailto:contacto@boxboxnow.com"
            className="text-accent hover:underline"
          >
            Contacta para planes Enterprise
          </a>
          .
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/landing/PricingToggle.tsx
git commit -m "feat: PricingToggle fetches plans from API with hardcoded fallback"
```

---

### Task 10: Final Integration Verification

- [ ] **Step 1: Verify backend starts without errors**

```bash
cd /Users/jizcue/boxboxnow-v2/backend && python -c "from app.models.schemas import ProductTabConfig; print('OK')"
```

Expected: `OK`

- [ ] **Step 2: Verify frontend compiles**

```bash
cd /Users/jizcue/boxboxnow-v2/frontend && npx next build 2>&1 | tail -20
```

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 3: Verify all new endpoints are registered**

```bash
cd /Users/jizcue/boxboxnow-v2/backend && python -c "
from app.main import app
routes = [r.path for r in app.routes if hasattr(r, 'path')]
needed = ['/api/plans', '/api/admin/product-config', '/api/admin/stripe-products']
for n in needed:
    found = any(n in r for r in routes)
    print(f'{n}: {\"OK\" if found else \"MISSING\"}')"
```

Expected: All three show `OK`.

- [ ] **Step 4: Final commit with any fixes**

If any fixes were needed:
```bash
git add -u
git commit -m "fix: integration fixes for product tab config feature"
```
