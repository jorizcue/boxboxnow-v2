"""WebSocket endpoint that replays raw Apex Timing messages.

Used by the Apex Timing HTML viewer to display replays in the
original Apex interface without connecting to their WebSocket.
"""

import asyncio
import logging
from datetime import datetime, timezone
from pathlib import Path
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from fastapi.responses import FileResponse, HTMLResponse
from sqlalchemy import select

from app.apex.replay import parse_log_file
from app.api.auth_routes import decode_token
from app.models.database import async_session
from app.models.schemas import DeviceSession, Subscription, User, UserCircuitAccess

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
    ".ttf": "font/ttf",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".eot": "application/vnd.ms-fontobject",
    ".svg": "image/svg+xml",
}


@router.get("/viewer")
async def apex_viewer():
    """Serve the Apex Timing HTML viewer."""
    html_path = STATIC_DIR / "index.html"
    if not html_path.exists():
        return HTMLResponse("<h1>Apex viewer not found</h1>", status_code=404)
    return FileResponse(html_path, media_type="text/html")


@router.get("/static/{filepath:path}")
async def apex_static(filepath: str):
    """Serve static assets (JS, CSS, images, fonts)."""
    clean = Path(filepath)
    if ".." in clean.parts:
        return HTMLResponse("Forbidden", status_code=403)
    file_path = STATIC_DIR / clean
    if not file_path.exists() or not file_path.is_file():
        return HTMLResponse("Not found", status_code=404)
    suffix = file_path.suffix.lower()
    media_type = MIME_TYPES.get(suffix, "application/octet-stream")
    return FileResponse(file_path, media_type=media_type)


@router.get("/fonts/{filename}")
async def apex_fonts(filename: str):
    """Serve font files (CSS references ../fonts/ relative to static/)."""
    safe_name = Path(filename).name
    file_path = STATIC_DIR / "fonts" / safe_name
    if not file_path.exists():
        return HTMLResponse("Not found", status_code=404)
    suffix = file_path.suffix.lower()
    media_type = MIME_TYPES.get(suffix, "application/octet-stream")
    return FileResponse(file_path, media_type=media_type)


@router.get("/images/{filename}")
async def apex_images(filename: str):
    """Serve image files (CSS references ../images/ relative to static/)."""
    safe_name = Path(filename).name
    file_path = STATIC_DIR / "images" / safe_name
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


async def _ws_authenticate(token: str | None) -> int | None:
    """Validate the JWT, alive device session, active subscription (unless
    internal), AND at least one currently-valid UserCircuitAccess row for
    an Apex-replay WS handshake. Returns user_id on success, None on any
    failure. Mirrors `/ws/race`'s checks so this endpoint can't be used
    as a back-door to read race data without proper access. Admins bypass
    every gate; internal users bypass only the subscription check.
    """
    if not token:
        return None
    try:
        payload = decode_token(token)
    except Exception:
        return None
    user_id = payload.get("sub")
    session_token = payload.get("sid")
    if not user_id or not session_token:
        return None

    async with async_session() as db:
        # Device session must still exist (logout / admin kill revokes).
        ds_q = await db.execute(
            select(DeviceSession.id).where(DeviceSession.session_token == session_token)
        )
        if not ds_q.scalar_one_or_none():
            return None

        # Admins bypass every gate.
        u_q = await db.execute(
            select(User.is_admin, User.is_internal).where(User.id == user_id)
        )
        u_row = u_q.first()
        is_admin_user = bool(u_row[0]) if u_row else False
        is_internal_user = bool(u_row[1]) if u_row else False
        if is_admin_user:
            return user_id

        now = datetime.now(timezone.utc)

        # Active/trialing subscription required — except for internal users,
        # who don't pay but still need a current circuit grant below.
        if not is_internal_user:
            sub_q = await db.execute(
                select(Subscription.current_period_end).where(
                    Subscription.user_id == user_id,
                    Subscription.status.in_(("active", "trialing")),
                )
            )
            has_active_sub = False
            for (period_end,) in sub_q.all():
                if period_end is not None and period_end.tzinfo is None:
                    period_end = period_end.replace(tzinfo=timezone.utc)
                if period_end is None or period_end > now:
                    has_active_sub = True
                    break
            if not has_active_sub:
                return None

        # At least one currently-valid circuit grant required (paying AND
        # internal users alike).
        ca_q = await db.execute(
            select(UserCircuitAccess.valid_from, UserCircuitAccess.valid_until).where(
                UserCircuitAccess.user_id == user_id,
            )
        )
        for vf, vu in ca_q.all():
            if vf is not None and vf.tzinfo is None:
                vf = vf.replace(tzinfo=timezone.utc)
            if vu is not None and vu.tzinfo is None:
                vu = vu.replace(tzinfo=timezone.utc)
            if (vf is None or vf <= now) and (vu is None or vu > now):
                return user_id
        return None


@router.websocket("/ws")
async def apex_replay_ws(
    websocket: WebSocket,
    token: str = Query(""),
    filename: str = Query(...),
    circuit_dir: str = Query(None),
    start_block: int = Query(0),
    speed: float = Query(1.0),
):
    """WebSocket that sends raw Apex Timing messages from a replay log.

    The Apex Timing JS connects here instead of the real Apex server.
    Messages are sent as-is (pipe-delimited text) with timing preserved.

    Auth: requires a valid JWT (`?token=…`) plus an alive device session
    plus an active/trialing subscription, same surface as `/ws/race`. The
    Apex Timing viewer page passes the user's token into the `wsConfig`
    URL it builds for this endpoint.
    """
    user_id = await _ws_authenticate(token)
    if user_id is None:
        # Close BEFORE accepting so the handshake itself fails (HTTP 403)
        # instead of accepting and immediately closing — both work but
        # 403-on-handshake is what curl / the apex viewer expect.
        await websocket.close(code=4001, reason="Unauthorized")
        return

    await websocket.accept()

    filepath = _resolve_log_path(filename, circuit_dir)
    if not filepath:
        await websocket.send_text("msg||Log file not found")
        await websocket.close()
        return

    logger.info(f"Apex replay WS: {filepath} from block {start_block} at {speed}x")

    # Parse the log file
    blocks = parse_log_file(filepath)

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
                    # Cap large gaps (idle periods between sessions) to 2s real-time
                    MAX_GAP_SECONDS = 10.0
                    capped_delta = min(delta, MAX_GAP_SECONDS)
                    # Split delays into small chunks to stay responsive
                    remaining = capped_delta / current_speed
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
