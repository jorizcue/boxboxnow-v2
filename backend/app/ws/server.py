"""WebSocket server for browser clients.
Authenticates via JWT token passed as query parameter.
Routes to the user's RaceStateManager instance.
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

    # Get user's session from registry
    registry = websocket.app.state.registry
    session = registry.get(user_id)

    if not session:
        # No active session - use replay state as fallback
        state = websocket.app.state.replay_state
    else:
        state = session.state

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
                    snapshot = state.get_snapshot()
                    await websocket.send_text(json.dumps(snapshot))
            except json.JSONDecodeError:
                pass

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"WebSocket error (user={user_id}): {e}")
    finally:
        state.remove_client(websocket)
