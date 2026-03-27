"""WebSocket server for browser clients."""

import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/ws/race")
async def race_websocket(websocket: WebSocket):
    """WebSocket endpoint for real-time race updates."""
    await websocket.accept()

    state = websocket.app.state.race_state
    state.add_client(websocket)

    try:
        # Send initial snapshot
        snapshot = state.get_snapshot()
        await websocket.send_text(json.dumps(snapshot))

        # Keep connection alive, listen for client messages
        while True:
            data = await websocket.receive_text()
            # Client can send commands (e.g., request snapshot)
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
        logger.error(f"WebSocket error: {e}")
    finally:
        state.remove_client(websocket)
