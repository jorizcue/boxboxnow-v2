"""WebSocket server for browser clients.
Authenticates via JWT token passed as query parameter.
Routes to the user's RaceStateManager instance (live or replay).
"""

import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from app.api.auth_routes import decode_token

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/ws/race")
async def race_websocket(websocket: WebSocket, token: str = Query("")):
    """WebSocket endpoint for real-time race updates.
    Connect with: ws://host/ws/race?token=<jwt>

    Routing priority:
    1. If user has an active live session (Apex connection) -> use that state
    2. If user has an active replay session -> use that state
    3. Otherwise -> use a blank replay state (so WS stays connected)
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

    # Get user's session from registries
    registry = websocket.app.state.registry
    replay_registry = websocket.app.state.replay_registry

    live_session = registry.get(user_id)
    replay_session = replay_registry.get(user_id)

    if live_session:
        state = live_session.state
    elif replay_session:
        state = replay_session.state
    else:
        # Create a replay session as fallback (empty state, ready for replay)
        replay_session = replay_registry.get_or_create(user_id)
        state = replay_session.state

    state.add_client(websocket)

    try:
        # Send initial snapshot
        snapshot = state.get_snapshot()
        await websocket.send_text(json.dumps(snapshot))

        # Keep connection alive
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                if msg.get("type") == "requestSnapshot":
                    # Re-resolve state in case user switched between live/replay
                    live_s = registry.get(user_id)
                    replay_s = replay_registry.get(user_id)
                    current_state = (live_s.state if live_s
                                     else replay_s.state if replay_s
                                     else state)
                    snapshot = current_state.get_snapshot()
                    await websocket.send_text(json.dumps(snapshot))
            except json.JSONDecodeError:
                pass

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"WebSocket error (user={user_id}): {e}")
    finally:
        state.remove_client(websocket)
