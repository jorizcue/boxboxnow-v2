"""WebSocket endpoint that replays raw Apex Timing messages.

Used by the Apex Timing HTML viewer to display replays in the
original Apex interface without connecting to their WebSocket.
"""

import asyncio
import logging
from pathlib import Path
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from fastapi.responses import FileResponse, HTMLResponse

from app.apex.replay import ReplayEngine

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/apex-replay", tags=["apex-replay"])

RECORDINGS_BASE_DIR = "data/recordings"
LOGS_BASE_DIR = "data/logs"
STATIC_DIR = Path(__file__).parent.parent.parent / "static" / "apex-timing"

MIME_TYPES = {
    ".js": "application/javascript",
    ".css": "text/css",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".html": "text/html",
}


@router.get("/viewer")
async def apex_viewer():
    """Serve the Apex Timing HTML viewer."""
    html_path = STATIC_DIR / "index.html"
    if not html_path.exists():
        return HTMLResponse("<h1>Apex viewer not found</h1>", status_code=404)
    return FileResponse(html_path, media_type="text/html")


@router.get("/static/{filename}")
async def apex_static(filename: str):
    """Serve static assets (JS, CSS, images)."""
    # Prevent path traversal
    safe_name = Path(filename).name
    file_path = STATIC_DIR / safe_name
    if not file_path.exists():
        return HTMLResponse("Not found", status_code=404)
    suffix = file_path.suffix.lower()
    media_type = MIME_TYPES.get(suffix, "application/octet-stream")
    return FileResponse(file_path, media_type=media_type)


def _resolve_log_path(filename: str, circuit_dir: str | None = None) -> str | None:
    """Find the log file path."""
    if circuit_dir:
        path = Path(RECORDINGS_BASE_DIR) / circuit_dir / filename
        if path.exists():
            return str(path)
        # Try .gz
        gz_path = Path(RECORDINGS_BASE_DIR) / circuit_dir / f"{filename}.gz"
        if gz_path.exists():
            return str(gz_path)
    # Try root logs
    path = Path(LOGS_BASE_DIR) / filename
    if path.exists():
        return str(path)
    return None


@router.websocket("/ws")
async def apex_replay_ws(
    websocket: WebSocket,
    filename: str = Query(...),
    circuit_dir: str = Query(None),
    start_block: int = Query(0),
    speed: float = Query(1.0),
):
    """WebSocket that sends raw Apex Timing messages from a replay log.

    The Apex Timing JS connects here instead of the real Apex server.
    Messages are sent as-is (pipe-delimited text) with timing preserved.
    """
    await websocket.accept()

    filepath = _resolve_log_path(filename, circuit_dir)
    if not filepath:
        await websocket.send_text("msg||Log file not found")
        await websocket.close()
        return

    logger.info(f"Apex replay WS: {filepath} from block {start_block} at {speed}x")

    # Parse the log file
    engine = ReplayEngine()
    blocks = engine._parse_log_file(filepath)

    if not blocks:
        await websocket.send_text("msg||No data in log file")
        await websocket.close()
        return

    total = len(blocks)
    current_speed = speed
    paused = False
    active = True

    # Listen for control messages in background
    async def listen_controls():
        nonlocal current_speed, paused, active
        try:
            while active:
                msg = await websocket.receive_text()
                if msg.startswith("speed:"):
                    try:
                        current_speed = max(0.1, min(100, float(msg[6:])))
                        logger.info(f"Apex replay speed: {current_speed}x")
                    except ValueError:
                        pass
                elif msg == "pause":
                    paused = not paused
                elif msg == "stop":
                    active = False
        except WebSocketDisconnect:
            active = False
        except Exception:
            active = False

    control_task = asyncio.create_task(listen_controls())

    try:
        # If start_block > 0, find nearest init block and send init silently
        actual_start = max(0, min(start_block, total - 1))

        if actual_start > 0:
            # Find nearest preceding init block
            init_block = 0
            for i in range(actual_start, -1, -1):
                if "grid||" in blocks[i][1] and "init|" in blocks[i][1]:
                    init_block = i
                    break
            # Send init blocks without delay to rebuild state
            for i in range(init_block, min(actual_start, total)):
                if not active:
                    break
                await websocket.send_text(blocks[i][1])

        # Replay from start_block with timing
        prev_time = blocks[actual_start][0] if actual_start < total else None

        for i in range(actual_start, total):
            if not active:
                break

            while paused and active:
                await asyncio.sleep(0.1)

            if not active:
                break

            timestamp, message = blocks[i]

            # Delay based on timestamp difference
            if prev_time and i > actual_start:
                delta = (timestamp - prev_time).total_seconds()
                if delta > 0:
                    # Split long delays into small chunks to stay responsive
                    remaining = delta / current_speed
                    while remaining > 0 and active:
                        while paused and active:
                            await asyncio.sleep(0.1)
                        chunk = min(remaining, 0.5)
                        await asyncio.sleep(chunk)
                        remaining -= chunk

            if not active:
                break

            prev_time = timestamp
            await websocket.send_text(message)

        # Send end marker
        if active:
            await websocket.send_text("msg||Replay finalizado")

    except WebSocketDisconnect:
        logger.info("Apex replay WS disconnected")
    except Exception as e:
        logger.error(f"Apex replay WS error: {e}")
    finally:
        active = False
        control_task.cancel()
        try:
            await websocket.close()
        except Exception:
            pass
