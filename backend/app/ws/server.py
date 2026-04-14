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
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from sqlalchemy import select
from app.api.auth_routes import decode_token
from app.models.database import async_session
from app.models.schemas import DeviceSession, ProductTabConfig, Subscription, User

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

    # Enforce max concurrent WS connections per user, split by device type.
    # Driver view gets +1 extra slot on top of the per-kind limit (mobile only).
    async with async_session() as db:
        u_row = await db.execute(
            select(User.max_devices, User.is_admin).where(User.id == user_id)
        )
        u_val = u_row.first()
        fallback_max = (u_val[0] if u_val else 1) or 1
        is_admin_user = bool(u_val[1]) if u_val else False

        # Resolve per-kind limits from the user's active subscription product config.
        kind_limit: int | None = None
        if not is_admin_user:
            sub_row = await db.execute(
                select(Subscription.plan_type).where(
                    Subscription.user_id == user_id,
                    Subscription.status.in_(("active", "trialing")),
                )
            )
            plan_types = [r[0] for r in sub_row.all() if r[0]]
            for pt in plan_types:
                cfg_row = await db.execute(
                    select(
                        ProductTabConfig.concurrency_web,
                        ProductTabConfig.concurrency_mobile,
                    ).where(ProductTabConfig.plan_type == pt)
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
