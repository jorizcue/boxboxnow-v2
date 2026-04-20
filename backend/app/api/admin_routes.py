"""Admin routes: manage users, circuits, circuit access, and CircuitHub."""

import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request

logger = logging.getLogger(__name__)
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload

from app.models.database import get_db
from app.models.schemas import User, Circuit, UserCircuitAccess, AppSetting, UserTabAccess, DeviceSession, Subscription, ProductTabConfig
from sqlalchemy.orm import selectinload  # noqa: duplicate import
from app.models.pydantic_models import (
    UserOut, UserCreate, UserUpdate,
    CircuitOut, CircuitCreate, CircuitUpdate,
    CircuitAccessOut, CircuitAccessCreate, CircuitAccessUpdate,
    DeviceSessionOut,
)
from app.api.auth_routes import require_admin, hash_password, _user_out

router = APIRouter(prefix="/api/admin", tags=["admin"])


# --- Users ---

@router.get("/users", response_model=list[UserOut])
async def list_users(admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(User).options(selectinload(User.tab_access), selectinload(User.subscriptions)).order_by(User.username)
    )
    return [_user_out(u) for u in result.scalars().all()]


@router.post("/users", response_model=UserOut)
async def create_user(data: UserCreate, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    # Check uniqueness
    existing = await db.execute(select(User).where(User.username == data.username))
    if existing.scalar_one_or_none():
        raise HTTPException(409, "Username already exists")

    user = User(
        username=data.username,
        password_hash=hash_password(data.password),
        is_admin=data.is_admin,
        max_devices=data.max_devices,
    )
    db.add(user)
    await db.flush()  # get user.id

    # Assign all default tabs to the new user
    from app.api.auth_routes import ALL_TABS
    for tab in ALL_TABS:
        db.add(UserTabAccess(user_id=user.id, tab=tab))
    await db.commit()

    # Reload with tab_access relationship
    result = await db.execute(
        select(User).options(selectinload(User.tab_access), selectinload(User.subscriptions)).where(User.id == user.id)
    )
    user = result.scalar_one()
    return _user_out(user)


@router.patch("/users/{user_id}", response_model=UserOut)
async def update_user(user_id: int, data: UserUpdate, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(404, "User not found")

    if data.username is not None:
        user.username = data.username
    if data.password is not None:
        user.password_hash = hash_password(data.password)
    if data.max_devices is not None:
        user.max_devices = data.max_devices
    if data.is_admin is not None:
        user.is_admin = data.is_admin
    if data.mfa_required is not None:
        user.mfa_required = data.mfa_required
    # For the concurrency overrides, we intentionally use model_fields_set
    # (not `is not None`) so sending `null` explicitly CLEARS the override
    # (falls back to plan). Omitting the field leaves it untouched.
    fields_set = data.model_fields_set
    if "concurrency_web" in fields_set:
        val = data.concurrency_web
        user.concurrency_web = val if (val is not None and val > 0) else None
    if "concurrency_mobile" in fields_set:
        val = data.concurrency_mobile
        user.concurrency_mobile = val if (val is not None and val > 0) else None

    await db.commit()

    # Reload with tab_access relationship (required for UserOut serialization)
    result = await db.execute(
        select(User).options(selectinload(User.tab_access), selectinload(User.subscriptions)).where(User.id == user_id)
    )
    user = result.scalar_one()
    return _user_out(user)


@router.post("/users/{user_id}/mfa/reset")
async def admin_reset_mfa(user_id: int, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    """Admin: Force-disable MFA for a user."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(404, "User not found")
    user.mfa_enabled = False
    user.mfa_secret = None
    await db.commit()
    return {"ok": True}


@router.delete("/users/{user_id}")
async def delete_user(user_id: int, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(404, "User not found")
    if user.id == admin.id:
        raise HTTPException(400, "Cannot delete yourself")

    await db.delete(user)
    await db.commit()
    return {"deleted": True}


# --- User Device Sessions (admin) ---

@router.get("/users/{user_id}/sessions", response_model=list[DeviceSessionOut])
async def list_user_sessions(user_id: int, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    """List all active device sessions for a specific user."""
    result = await db.execute(
        select(DeviceSession)
        .where(DeviceSession.user_id == user_id)
        .order_by(DeviceSession.last_active.desc())
    )
    sessions = result.scalars().all()
    return [
        DeviceSessionOut(
            id=s.id,
            session_token=s.session_token[:8] + "...",
            device_name=s.device_name,
            ip_address=s.ip_address,
            client_kind=s.client_kind or "",
            app_platform=s.app_platform or "",
            app_version=s.app_version or "",
            created_at=s.created_at,
            last_active=s.last_active,
            is_current=False,
        )
        for s in sessions
    ]


@router.delete("/users/{user_id}/sessions/{session_id}")
async def admin_kill_session(user_id: int, session_id: int, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    """Admin: kill a specific device session for any user."""
    result = await db.execute(
        select(DeviceSession).where(
            DeviceSession.id == session_id,
            DeviceSession.user_id == user_id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(404, "Session not found")
    session_token = session.session_token
    await db.delete(session)
    await db.commit()

    from app.ws.server import close_ws_for_session
    await close_ws_for_session(session_token)

    return {"killed": True, "device": session.device_name}


@router.delete("/users/{user_id}/sessions")
async def admin_kill_all_sessions(user_id: int, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    """Admin: kill all device sessions for a user."""
    # Get session tokens first to close WS
    result2 = await db.execute(
        select(DeviceSession.session_token).where(DeviceSession.user_id == user_id)
    )
    tokens_to_kill = [row[0] for row in result2.all()]

    await db.execute(
        delete(DeviceSession).where(DeviceSession.user_id == user_id)
    )
    await db.commit()

    from app.ws.server import close_ws_for_session
    for tk in tokens_to_kill:
        await close_ws_for_session(tk)

    return {"killed_all": True}


# --- Circuits ---

@router.get("/circuits", response_model=list[CircuitOut])
async def list_all_circuits(admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Circuit).order_by(Circuit.name))
    return result.scalars().all()


@router.post("/circuits", response_model=CircuitOut)
async def create_circuit(data: CircuitCreate, request: Request, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    circuit = Circuit(**data.model_dump())
    db.add(circuit)
    await db.commit()
    await db.refresh(circuit)

    # Auto-register in CircuitHub so it connects immediately
    circuit_hub = request.app.state.circuit_hub
    await circuit_hub.start_connection(circuit.id)

    return circuit


@router.patch("/circuits/{circuit_id}", response_model=CircuitOut)
async def update_circuit(circuit_id: int, data: CircuitUpdate, request: Request, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Circuit).where(Circuit.id == circuit_id))
    circuit = result.scalar_one_or_none()
    if not circuit:
        raise HTTPException(404, "Circuit not found")

    updates = data.model_dump(exclude_unset=True)
    gps_fields = {"finish_lat1", "finish_lon1", "finish_lat2", "finish_lon2"}
    gps_changed = any(f in updates for f in gps_fields)

    for key, value in updates.items():
        setattr(circuit, key, value)

    await db.commit()
    await db.refresh(circuit)

    # Restart connection in hub with updated config (ports may have changed)
    circuit_hub = request.app.state.circuit_hub
    await circuit_hub.start_connection(circuit.id)

    # If the admin touched any of the GPS finish-line coords, push a
    # `circuit_updated` event over every active WebSocket of every user
    # whose session is on this circuit. Mobile driver apps listen for it
    # and re-run `applyCircuitFinishLine()` so lap detection picks up the
    # new line without needing a foreground / restart cycle.
    if gps_changed:
        from app.ws.server import broadcast_to_circuit
        await broadcast_to_circuit(circuit.id, {
            "type": "circuit_updated",
            "data": {
                "circuit_id": circuit.id,
                "finish_lat_1": circuit.finish_lat1,
                "finish_lon_1": circuit.finish_lon1,
                "finish_lat_2": circuit.finish_lat2,
                "finish_lon_2": circuit.finish_lon2,
            },
        })

    return circuit


@router.delete("/circuits/{circuit_id}")
async def delete_circuit(circuit_id: int, request: Request, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Circuit).where(Circuit.id == circuit_id))
    circuit = result.scalar_one_or_none()
    if not circuit:
        raise HTTPException(404, "Circuit not found")

    # Stop hub connection before deleting
    circuit_hub = request.app.state.circuit_hub
    await circuit_hub.stop_connection(circuit.id)

    await db.delete(circuit)
    await db.commit()
    return {"deleted": True}


# --- Circuit Access ---

@router.get("/access", response_model=list[CircuitAccessOut])
async def list_all_access(admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(UserCircuitAccess)
        .options(selectinload(UserCircuitAccess.circuit))
        .order_by(UserCircuitAccess.user_id)
    )
    rows = result.scalars().all()
    return [
        CircuitAccessOut(
            id=a.id,
            user_id=a.user_id,
            circuit_id=a.circuit_id,
            circuit_name=a.circuit.name if a.circuit else None,
            valid_from=a.valid_from,
            valid_until=a.valid_until,
        )
        for a in rows
    ]


@router.get("/access/user/{user_id}", response_model=list[CircuitAccessOut])
async def list_user_access(user_id: int, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(UserCircuitAccess)
        .options(selectinload(UserCircuitAccess.circuit))
        .where(UserCircuitAccess.user_id == user_id)
    )
    rows = result.scalars().all()
    return [
        CircuitAccessOut(
            id=a.id,
            user_id=a.user_id,
            circuit_id=a.circuit_id,
            circuit_name=a.circuit.name if a.circuit else None,
            valid_from=a.valid_from,
            valid_until=a.valid_until,
        )
        for a in rows
    ]


@router.post("/access", response_model=CircuitAccessOut)
async def grant_access(data: CircuitAccessCreate, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    access = UserCircuitAccess(**data.model_dump())
    db.add(access)
    await db.commit()
    await db.refresh(access)
    # Load circuit name
    circuit = await db.execute(select(Circuit).where(Circuit.id == access.circuit_id))
    c = circuit.scalar_one_or_none()
    return CircuitAccessOut(
        id=access.id,
        user_id=access.user_id,
        circuit_id=access.circuit_id,
        circuit_name=c.name if c else None,
        valid_from=access.valid_from,
        valid_until=access.valid_until,
    )


@router.patch("/access/{access_id}", response_model=CircuitAccessOut)
async def update_access(access_id: int, data: CircuitAccessUpdate, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(UserCircuitAccess).where(UserCircuitAccess.id == access_id))
    access = result.scalar_one_or_none()
    if not access:
        raise HTTPException(404, "Access record not found")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(access, key, value)

    await db.commit()
    await db.refresh(access)
    return access


@router.delete("/access/{access_id}")
async def revoke_access(access_id: int, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(UserCircuitAccess).where(UserCircuitAccess.id == access_id))
    access = result.scalar_one_or_none()
    if not access:
        raise HTTPException(404, "Access record not found")

    await db.delete(access)
    await db.commit()
    return {"deleted": True}


# --- CircuitHub Management ---

@router.get("/hub/status")
async def hub_status(request: Request, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    """Get real-time status of all CircuitHub connections."""
    from app.ws.server import get_connected_users, get_user_circuit_map

    circuit_hub = request.app.state.circuit_hub
    statuses = circuit_hub.get_status()

    # Get connected users per circuit from WS tracker
    user_circuit_map = get_user_circuit_map()
    circuit_users: dict[int, list[int]] = {}
    for uid, cid in user_circuit_map.items():
        circuit_users.setdefault(cid, []).append(uid)

    # Resolve usernames
    all_user_ids = set(user_circuit_map.keys())
    if all_user_ids:
        result = await db.execute(select(User.id, User.username).where(User.id.in_(all_user_ids)))
        username_map = {row[0]: row[1] for row in result.all()}
    else:
        username_map = {}

    # Enrich each circuit status with connected user info
    for s in statuses:
        cid = s["circuit_id"]
        s["connected_users"] = [
            {"id": uid, "username": username_map.get(uid, f"User {uid}")}
            for uid in circuit_users.get(cid, [])
        ]

    return {"circuits": statuses}


@router.post("/hub/{circuit_id}/start")
async def hub_start_circuit(circuit_id: int, request: Request, admin: User = Depends(require_admin)):
    """Start or restart a circuit connection."""
    circuit_hub = request.app.state.circuit_hub
    ok = await circuit_hub.start_connection(circuit_id)
    if not ok:
        raise HTTPException(404, "Circuit not found")
    return {"status": "started", "circuit_id": circuit_id}


@router.post("/hub/{circuit_id}/stop")
async def hub_stop_circuit(circuit_id: int, request: Request, admin: User = Depends(require_admin)):
    """Stop a circuit connection."""
    circuit_hub = request.app.state.circuit_hub
    ok = await circuit_hub.stop_connection(circuit_id)
    if not ok:
        raise HTTPException(404, "Circuit connection not found")
    return {"status": "stopped", "circuit_id": circuit_id}


# --- User Tab Access ---

@router.put("/users/{user_id}/tabs")
async def update_user_tabs(user_id: int, request: Request, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    body = await request.json()
    tabs = body.get("tabs", [])
    # Delete existing
    await db.execute(delete(UserTabAccess).where(UserTabAccess.user_id == user_id))
    # Insert new
    from app.api.auth_routes import ALL_TABS
    for tab in tabs:
        if tab in ALL_TABS:
            db.add(UserTabAccess(user_id=user_id, tab=tab))
    await db.commit()
    return {"tabs": tabs}


# --- App Settings ---

@router.get("/settings/{key}")
async def get_setting(key: str, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AppSetting).where(AppSetting.key == key))
    setting = result.scalar_one_or_none()
    if not setting:
        raise HTTPException(404, "Setting not found")
    return {"key": setting.key, "value": setting.value}


@router.patch("/settings/{key}")
async def update_setting(key: str, request: Request, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    body = await request.json()
    value = body.get("value")
    if value is None:
        raise HTTPException(400, "Missing 'value'")

    result = await db.execute(select(AppSetting).where(AppSetting.key == key))
    setting = result.scalar_one_or_none()
    if not setting:
        setting = AppSetting(key=key, value=str(value))
        db.add(setting)
    else:
        setting.value = str(value)

    await db.commit()
    return {"key": key, "value": str(value)}


# --- Platform Settings (batch) ---

PLATFORM_SETTINGS_KEYS = [
    "trial_days",           # 0 = trial disabled
    "trial_banner_days",    # Show banner when N days or less remain
    "trial_email_days",     # Send reminder email N days before expiry
    "default_tabs",         # JSON array: tabs for new users (no purchase)
    "default_max_devices",  # Max devices for new users
    "trial_tabs",           # JSON array: tabs granted during trial
    "trial_max_devices",    # Max devices during trial
    # Mobile app version gating. Empty string = no minimum enforced.
    # Format: semver-style "MAJOR.MINOR.PATCH" (e.g. "1.4.0"). Login
    # endpoints compare the `X-App-Version` header against these and
    # return HTTP 426 when the client is below the minimum — iOS /
    # Android apps trap that and show an "update required" screen.
    "min_ios_version",
    "min_android_version",
    # Informational: the current latest version in each store. Displayed
    # in the app for nice "update available" prompts (non-blocking).
    "latest_ios_version",
    "latest_android_version",
]

PLATFORM_DEFAULTS = {
    "trial_days": "14",
    "trial_banner_days": "7",
    "trial_email_days": "3",
    "default_tabs": '["race","pit","live","config","adjusted","adjusted-beta","driver","driver-config"]',
    "default_max_devices": "2",
    "trial_tabs": '["race","pit","live","config","adjusted","adjusted-beta","driver","driver-config","replay","analytics","insights"]',
    "trial_max_devices": "2",
    "min_ios_version": "",
    "min_android_version": "",
    "latest_ios_version": "",
    "latest_android_version": "",
}


@router.get("/platform-settings")
async def get_platform_settings(admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    """Get all platform settings as a dict."""
    result = await db.execute(
        select(AppSetting).where(AppSetting.key.in_(PLATFORM_SETTINGS_KEYS))
    )
    settings = {s.key: s.value for s in result.scalars().all()}
    # Fill defaults for missing keys
    for key in PLATFORM_SETTINGS_KEYS:
        if key not in settings:
            settings[key] = PLATFORM_DEFAULTS.get(key, "")
    return settings


@router.put("/platform-settings")
async def update_platform_settings(request: Request, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    """Update multiple platform settings at once."""
    body = await request.json()
    updated = {}
    for key in PLATFORM_SETTINGS_KEYS:
        if key in body:
            value = str(body[key])
            result = await db.execute(select(AppSetting).where(AppSetting.key == key))
            setting = result.scalar_one_or_none()
            if not setting:
                db.add(AppSetting(key=key, value=value))
            else:
                setting.value = value
            updated[key] = value
    await db.commit()
    return updated


# --- Product Tab Config ---


def _serialize_config(c, _json) -> dict:
    """Serialize a ProductTabConfig row to dict."""
    return {
        "id": c.id,
        "stripe_product_id": c.stripe_product_id,
        "stripe_price_id": c.stripe_price_id,
        "plan_type": c.plan_type,
        "tabs": _json.loads(c.tabs) if c.tabs else [],
        "max_devices": c.max_devices,
        "concurrency_web": c.concurrency_web,
        "concurrency_mobile": c.concurrency_mobile,
        "per_circuit": bool(c.per_circuit) if c.per_circuit is not None else True,
        "display_name": c.display_name,
        "description": c.description,
        "features": _json.loads(c.features) if c.features else [],
        "price_amount": c.price_amount,
        "billing_interval": c.billing_interval,
        "is_popular": c.is_popular,
        "is_visible": c.is_visible,
        "sort_order": c.sort_order,
    }


@router.get("/product-config")
async def list_product_configs(admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    """List all product-to-tab configurations."""
    import json as _json
    result = await db.execute(select(ProductTabConfig).order_by(ProductTabConfig.sort_order))
    return [_serialize_config(c, _json) for c in result.scalars().all()]


@router.post("/product-config")
async def create_product_config(request: Request, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    """Create a product-to-tab configuration (one per Stripe price)."""
    import json as _json
    body = await request.json()

    # stripe_price_id is the canonical unique identifier for a row —
    # plan_type is just a label and can be reused across products.
    price_id = body.get("stripe_price_id", "")
    if price_id:
        existing = await db.execute(
            select(ProductTabConfig).where(ProductTabConfig.stripe_price_id == price_id)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(409, "Ya existe una configuracion para este precio de Stripe")

    plan_type = body.get("plan_type", "")

    config = ProductTabConfig(
        stripe_product_id=body.get("stripe_product_id", ""),
        stripe_price_id=price_id,
        plan_type=plan_type,
        tabs=_json.dumps(body.get("tabs", [])),
        max_devices=body.get("max_devices", 1),
        concurrency_web=body.get("concurrency_web"),
        concurrency_mobile=body.get("concurrency_mobile"),
        per_circuit=body.get("per_circuit", True),
        display_name=body.get("display_name", ""),
        description=body.get("description"),
        features=_json.dumps(body.get("features", [])),
        price_amount=body.get("price_amount"),
        billing_interval=body.get("billing_interval"),
        is_popular=body.get("is_popular", False),
        is_visible=body.get("is_visible", True),
        sort_order=body.get("sort_order", 0),
    )
    db.add(config)
    await db.commit()
    await db.refresh(config)
    return _serialize_config(config, _json)


@router.put("/product-config/{config_id}")
async def update_product_config(config_id: int, request: Request, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    """Update a product-to-tab configuration."""
    import json as _json
    result = await db.execute(select(ProductTabConfig).where(ProductTabConfig.id == config_id))
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(404, "Product config not found")

    body = await request.json()

    # Defensive 409: if stripe_price_id is being changed, make sure the
    # target value isn't already claimed by another row. SQLite would raise
    # a cryptic IntegrityError otherwise.
    new_price_id = body.get("stripe_price_id")
    if new_price_id and new_price_id != config.stripe_price_id:
        dup = await db.execute(
            select(ProductTabConfig.id).where(
                ProductTabConfig.stripe_price_id == new_price_id,
                ProductTabConfig.id != config_id,
            )
        )
        if dup.scalar_one_or_none():
            raise HTTPException(
                409, "Ya existe otra configuracion con ese precio de Stripe"
            )

    for field in ("stripe_product_id", "stripe_price_id", "plan_type", "display_name", "description", "billing_interval"):
        if field in body:
            setattr(config, field, body[field])
    if "tabs" in body:
        config.tabs = _json.dumps(body["tabs"])
    if "features" in body:
        config.features = _json.dumps(body["features"])
    for field in ("max_devices", "concurrency_web", "concurrency_mobile", "sort_order"):
        if field in body:
            setattr(config, field, body[field])
    if "per_circuit" in body:
        config.per_circuit = bool(body["per_circuit"])
    for field in ("price_amount",):
        if field in body:
            setattr(config, field, body[field])
    for field in ("is_popular", "is_visible"):
        if field in body:
            setattr(config, field, body[field])

    await db.commit()
    return _serialize_config(config, _json)


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
    """List active products from Stripe API with their prices."""
    import stripe as _stripe
    from app.config import get_settings
    settings = get_settings()
    _stripe.api_key = settings.stripe_secret_key

    try:
        products = _stripe.Product.list(active=True, limit=100)
        # Fetch prices for each product
        result = []
        for p in products.data:
            prices = _stripe.Price.list(product=p.id, active=True, limit=20)
            result.append({
                "id": p.id,
                "name": p.name,
                "description": p.description,
                "prices": [
                    {
                        "id": pr.id,
                        "unit_amount": pr.unit_amount,  # in cents
                        "currency": pr.currency,
                        "recurring": {
                            "interval": pr.recurring.interval if pr.recurring else None,
                        } if pr.recurring else None,
                        "type": pr.type,  # "recurring" or "one_time"
                    }
                    for pr in prices.data
                ],
            })
        return result
    except Exception as e:
        logger.error(f"Failed to list Stripe products: {e}")
        raise HTTPException(500, "Failed to fetch Stripe products")
