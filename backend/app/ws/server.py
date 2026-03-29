"""WebSocket server for browser clients.
Authenticates via JWT token passed as query parameter.
Routes to the user's RaceStateManager instance (live or replay).
Auto-starts monitoring via CircuitHub if user has an active session.
"""

import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from app.api.auth_routes import decode_token

logger = logging.getLogger(__name__)

router = APIRouter()


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
async def race_websocket(websocket: WebSocket, token: str = Query("")):
    """WebSocket endpoint for real-time race updates.
    Connect with: ws://host/ws/race?token=<jwt>

    Auto-starts monitoring if user has an active session but no
    in-memory UserSession (e.g. after server restart).
    """
    # Authenticate
    if not token:
        await websocket.close(code=4001, reason="Missing token")
        return

    try:
        payload = decode_token(token)
        user_id = payload.get("sub")
    except Exception:
        await websocket.close(code=4001, reason="Invalid token")
        return

    await websocket.accept()

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
