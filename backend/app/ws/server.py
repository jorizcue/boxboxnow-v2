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
from app.models.schemas import DeviceSession, User

logger = logging.getLogger(__name__)

router = APIRouter()

# Track active WebSocket connections per user
# user_id -> set of WebSocket objects
_ws_connections: dict[int, set] = {}

# Track which circuit each user is connected to
# user_id -> circuit_id
_user_circuits: dict[int, int] = {}


def get_connected_users() -> dict[int, int]:
    """Return {user_id: connection_count} for all connected users."""
    return {uid: len(conns) for uid, conns in _ws_connections.items() if conns}


def get_user_circuit_map() -> dict[int, int]:
    """Return {user_id: circuit_id} for connected users."""
    return dict(_user_circuits)


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

    # Enforce max concurrent WS connections per user
    # Driver view gets +1 extra slot on top of max_devices
    async with async_session() as db:
        result = await db.execute(select(User.max_devices).where(User.id == user_id))
        max_devices = result.scalar_one_or_none() or 1
    effective_max = max_devices + 1 if is_driver_view else max_devices
    current_ws_count = len(_ws_connections.get(user_id, set()))
    if current_ws_count >= effective_max:
        logger.warning(f"WS rejected: max devices (user={user_id}, current={current_ws_count}, max={effective_max})")
        await websocket.close(code=4003, reason="Max devices reached")
        return

    await websocket.accept()

    # Register connection
    if user_id not in _ws_connections:
        _ws_connections[user_id] = set()
    _ws_connections[user_id].add(websocket)

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
