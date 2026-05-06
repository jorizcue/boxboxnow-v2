"""WebSocket server for browser clients.
Authenticates via JWT token passed as query parameter.
Routes to the user's RaceStateManager instance (live or replay).
Auto-starts monitoring via CircuitHub if user has an active session.

Security:
- JWT token required as query parameter
- Device session validated against DB (killed sessions are rejected)
- Token expiration enforced
"""

import json
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from sqlalchemy import select
from app.api.auth_routes import decode_token
from app.models.database import async_session
from app.models.schemas import DeviceSession, ProductTabConfig, Subscription, User, UserCircuitAccess

logger = logging.getLogger(__name__)

router = APIRouter()

# Track active WebSocket connections per user
# user_id -> set of WebSocket objects
_ws_connections: dict[int, set] = {}

# Track which circuit each user is connected to
# user_id -> circuit_id
_user_circuits: dict[int, int] = {}

# Track session_token -> set of WebSocket objects (for killing sessions)
_ws_by_session: dict[str, set[WebSocket]] = {}


def get_connected_users() -> dict[int, int]:
    """Return {user_id: connection_count} for all connected users."""
    return {uid: len(conns) for uid, conns in _ws_connections.items() if conns}


def get_user_circuit_map() -> dict[int, int]:
    """Return {user_id: circuit_id} for connected users."""
    return dict(_user_circuits)


async def broadcast_to_user(user_id: int, message: dict):
    """Send a JSON message to every active WebSocket for a given user.

    Used for cross-device sync (e.g. web sets a new default driver preset →
    iOS driver view picks it up live). Failures on individual sockets are
    swallowed — the disconnect handler will clean them up.
    """
    ws_set = _ws_connections.get(user_id)
    if not ws_set:
        return
    payload = json.dumps(message)
    for ws in list(ws_set):
        try:
            await ws.send_text(payload)
        except Exception as e:
            logger.warning(f"broadcast_to_user failed (user={user_id}): {e}")


async def broadcast_to_circuit(circuit_id: int, message: dict):
    """Send a JSON message to every connected user whose active session is
    on the given circuit. Used to push admin-driven circuit changes (e.g.
    finish-line GPS coords updated) so mobile driver apps can re-apply
    them without waiting for the next app restart / foreground refresh.
    """
    targets = [uid for uid, cid in _user_circuits.items() if cid == circuit_id]
    if not targets:
        return
    for uid in targets:
        await broadcast_to_user(uid, message)


async def close_ws_for_session(session_token: str):
    """Close all WebSocket connections for a killed session."""
    ws_set = _ws_by_session.get(session_token)
    if not ws_set:
        return
    for ws in list(ws_set):
        try:
            await ws.close(code=4001, reason="Session terminated")
        except Exception:
            pass


async def close_ws_for_user(user_id: int, except_session: str | None = None):
    """Close all WebSocket connections for a user, optionally except one session."""
    ws_set = _ws_connections.get(user_id)
    if not ws_set:
        return
    for ws in list(ws_set):
        # Find the session_token for this ws
        ws_sid = getattr(ws, "_bbn_session_token", None)
        if except_session and ws_sid == except_session:
            continue
        try:
            await ws.close(code=4001, reason="Session terminated")
        except Exception:
            pass


async def _validate_session_token(session_token: str) -> bool:
    """Check that the device session hasn't been killed."""
    async with async_session() as db:
        result = await db.execute(
            select(DeviceSession.id).where(DeviceSession.session_token == session_token)
        )
        return result.scalar_one_or_none() is not None


def _resolve_state(registry, replay_registry, user_id):
    """Resolve which state to use for a user.

    Priority:
    1. Active replay (engine running) -> replay state
    2. Live session (monitoring) -> live state
    3. Replay session (idle) -> replay state (acts as blank)
    4. New blank replay state
    """
    replay_session = replay_registry.get(user_id)
    if replay_session and replay_session.engine._active:
        return replay_session.state

    live_session = registry.get(user_id)
    if live_session:
        return live_session.state

    if replay_session:
        return replay_session.state

    blank = replay_registry.get_or_create(user_id)
    return blank.state


@router.websocket("/ws/race")
async def race_websocket(
    websocket: WebSocket,
    token: str = Query(""),
    view: str = Query(""),
    device: str = Query(""),
):
    """WebSocket endpoint for real-time race updates.
    Connect with: ws://host/ws/race?token=<jwt>
    Driver view:  ws://host/ws/race?token=<jwt>&view=driver

    Auto-starts monitoring if user has an active session but no
    in-memory UserSession (e.g. after server restart).

    The `view=driver` parameter allows one extra connection beyond
    max_devices for the driver steering-wheel display.
    """
    is_driver_view = view == "driver"
    client_kind = "mobile" if device == "mobile" else "web"

    # Authenticate
    if not token:
        await websocket.close(code=4001, reason="Missing token")
        return

    try:
        payload = decode_token(token)
        user_id = payload.get("sub")
        session_token = payload.get("sid")
    except Exception:
        await websocket.close(code=4001, reason="Invalid token")
        return

    if not user_id or not session_token:
        await websocket.close(code=4001, reason="Invalid token payload")
        return

    # Verify device session is still active (not killed by admin or user)
    if not await _validate_session_token(session_token):
        await websocket.close(code=4001, reason="Session terminated")
        return

    # Active subscription + circuit-access gate. Race telemetry is paid
    # content AND circuit-bound; reject any client whose subscription
    # has expired/been cancelled, OR who has no currently-valid
    # UserCircuitAccess row, before we accept the WS handshake. Admins
    # bypass both checks. Mirrors the `require_active_subscription` +
    # `require_active_circuit_access` HTTP dependencies. Close code
    # 4003 ("policy violation"-ish) is what we already use for
    # max-devices; reason text differs so the client can tell apart
    # which gate fired.
    async with async_session() as db:
        u_row = await db.execute(
            select(User.is_admin).where(User.id == user_id)
        )
        is_admin_check = bool(u_row.scalar() or False)
        if not is_admin_check:
            now = datetime.now(timezone.utc)

            # 1. Subscription
            sub_q = await db.execute(
                select(Subscription.status, Subscription.current_period_end).where(
                    Subscription.user_id == user_id,
                    Subscription.status.in_(("active", "trialing")),
                )
            )
            has_active_sub = False
            for status_, period_end in sub_q.all():
                if period_end is not None and period_end.tzinfo is None:
                    period_end = period_end.replace(tzinfo=timezone.utc)
                if period_end is None or period_end > now:
                    has_active_sub = True
                    break
            if not has_active_sub:
                logger.warning(f"WS rejected: no active subscription (user={user_id})")
                await websocket.close(code=4003, reason="Active subscription required")
                return

            # 2. Circuit access — at least one row must cover `now`. We
            # could fold this into a single SQL with EXISTS, but the
            # round-trip cost is negligible at handshake time and the
            # split makes the close-code reason actionable for the
            # client (the SPA already differentiates these on the HTTP
            # side via /auth/me's `has_active_circuit_access` flag).
            ca_q = await db.execute(
                select(UserCircuitAccess.valid_from, UserCircuitAccess.valid_until).where(
                    UserCircuitAccess.user_id == user_id,
                )
            )
            has_circuit = False
            for vf, vu in ca_q.all():
                if vf is not None and vf.tzinfo is None:
                    vf = vf.replace(tzinfo=timezone.utc)
                if vu is not None and vu.tzinfo is None:
                    vu = vu.replace(tzinfo=timezone.utc)
                if (vf is None or vf <= now) and (vu is None or vu > now):
                    has_circuit = True
                    break
            if not has_circuit:
                logger.warning(f"WS rejected: no active circuit access (user={user_id})")
                await websocket.close(code=4003, reason="No active circuit access")
                return

    # Enforce max concurrent WS connections per user, split by device type.
    # Driver view gets +1 extra slot on top of the per-kind limit (mobile only).
    async with async_session() as db:
        u_row = await db.execute(
            select(
                User.max_devices,
                User.is_admin,
                User.concurrency_web,
                User.concurrency_mobile,
            ).where(User.id == user_id)
        )
        u_val = u_row.first()
        fallback_max = (u_val[0] if u_val else 1) or 1
        is_admin_user = bool(u_val[1]) if u_val else False
        user_c_web = u_val[2] if u_val else None
        user_c_mobile = u_val[3] if u_val else None

        # Priority: (1) per-user override, (2) subscription plan config,
        # (3) fallback_max (legacy user.max_devices).
        kind_limit: int | None = None
        if not is_admin_user:
            override = user_c_mobile if client_kind == "mobile" else user_c_web
            if override is not None and override > 0:
                kind_limit = override
        if kind_limit is None and not is_admin_user:
            sub_row = await db.execute(
                select(Subscription.stripe_price_id, Subscription.plan_type).where(
                    Subscription.user_id == user_id,
                    Subscription.status.in_(("active", "trialing")),
                )
            )
            for price_id, plan_type in sub_row.all():
                cfg = None
                if price_id:
                    cfg_row = await db.execute(
                        select(
                            ProductTabConfig.concurrency_web,
                            ProductTabConfig.concurrency_mobile,
                        ).where(ProductTabConfig.stripe_price_id == price_id)
                    )
                    cfg = cfg_row.first()
                if not cfg and plan_type:
                    cfg_row = await db.execute(
                        select(
                            ProductTabConfig.concurrency_web,
                            ProductTabConfig.concurrency_mobile,
                        ).where(ProductTabConfig.plan_type == plan_type)
                        .order_by(ProductTabConfig.id)
                        .limit(1)
                    )
                    cfg = cfg_row.first()
                if not cfg:
                    continue
                cw, cm = cfg
                val = cm if client_kind == "mobile" else cw
                if val is not None:
                    kind_limit = val if kind_limit is None else max(kind_limit, val)

    # Count only connections of the same kind for enforcement.
    same_kind_count = sum(
        1
        for ws in _ws_connections.get(user_id, set())
        if getattr(ws, "_bbn_client_kind", "web") == client_kind
    )
    base_limit = kind_limit if kind_limit is not None else fallback_max
    effective_max = base_limit + 1 if (is_driver_view and client_kind == "mobile") else base_limit
    if same_kind_count >= effective_max:
        logger.warning(
            f"WS rejected: max {client_kind} devices "
            f"(user={user_id}, current={same_kind_count}, max={effective_max})"
        )
        await websocket.close(code=4003, reason="Max devices reached")
        return

    await websocket.accept()

    # Register connection
    if user_id not in _ws_connections:
        _ws_connections[user_id] = set()
    _ws_connections[user_id].add(websocket)
    logger.info(
        f"WS connected: user={user_id}, view={view}, device={client_kind}, "
        f"total_connections={len(_ws_connections[user_id])}"
    )

    # Track session_token -> ws for session killing
    websocket._bbn_session_token = session_token  # type: ignore[attr-defined]
    websocket._bbn_client_kind = client_kind  # type: ignore[attr-defined]
    if session_token not in _ws_by_session:
        _ws_by_session[session_token] = set()
    _ws_by_session[session_token].add(websocket)

    # Get registries
    registry = websocket.app.state.registry
    replay_registry = websocket.app.state.replay_registry

    # Auto-start monitoring if needed (user has DB session but no in-memory session)
    if not registry.get(user_id):
        try:
            from app.api.race_routes import ensure_monitoring
            await ensure_monitoring(websocket.app.state, user_id)
        except Exception as e:
            logger.warning(f"Auto-start monitoring failed for user {user_id}: {e}")

    # Track user's circuit for hub display
    session = registry.get(user_id)
    if session:
        _user_circuits[user_id] = session.circuit_id

    # Resolve initial state
    current_state = _resolve_state(registry, replay_registry, user_id)
    current_state.add_client(websocket)

    try:
        # Send initial snapshot
        snapshot = current_state.get_snapshot()
        await websocket.send_text(json.dumps(snapshot))

        # Keep connection alive
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                if msg.get("type") == "requestSnapshot":
                    # Re-resolve state (may have switched between live/replay)
                    new_state = _resolve_state(registry, replay_registry, user_id)
                    if new_state != current_state:
                        current_state.remove_client(websocket)
                        new_state.add_client(websocket)
                        current_state = new_state
                    snapshot = current_state.get_snapshot()
                    await websocket.send_text(json.dumps(snapshot))

                elif msg.get("type") == "box_call":
                    # Broadcast box call to all other connections of the same user
                    relay_msg = json.dumps({"type": "box_call"})
                    others = _ws_connections.get(user_id, set()) - {websocket}
                    logger.info(f"BOX CALL from user={user_id}, relaying to {len(others)} other connection(s)")
                    for ws in list(others):
                        try:
                            await ws.send_text(relay_msg)
                        except Exception as e:
                            logger.warning(f"BOX CALL relay failed: {e}")
            except json.JSONDecodeError:
                pass

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"WebSocket error (user={user_id}): {e}")
    finally:
        current_state.remove_client(websocket)
        # Unregister WS connection
        _ws_connections.get(user_id, set()).discard(websocket)
        if user_id in _ws_connections and not _ws_connections[user_id]:
            del _ws_connections[user_id]
        _user_circuits.pop(user_id, None)
        # Unregister session_token -> ws
        if session_token in _ws_by_session:
            _ws_by_session[session_token].discard(websocket)
            if not _ws_by_session[session_token]:
                del _ws_by_session[session_token]
