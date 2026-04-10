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

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(circuit, key, value)

    await db.commit()
    await db.refresh(circuit)

    # Restart connection in hub with updated config (ports may have changed)
    circuit_hub = request.app.state.circuit_hub
    await circuit_hub.start_connection(circuit.id)

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
