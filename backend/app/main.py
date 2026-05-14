"""
BoxboxNow v2 - FastAPI application.
Multi-tenant: each user has their own race state.
CircuitHub connects to all circuits permanently.
"""

import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.models.database import init_db
from app.engine.registry import SessionRegistry, ReplayRegistry
from app.apex.circuit_hub import CircuitHub
from app.api.auth_routes import router as auth_router
from app.api.admin_routes import router as admin_router
from app.api.config_routes import router as config_router
from app.api.race_routes import router as race_router
from app.api.replay_routes import router as replay_router
from app.api.analytics_routes import router as analytics_router
from app.api.gps_routes import router as gps_router
from app.api.stripe_routes import router as stripe_router
from app.ws.server import router as ws_router
from app.api.public_routes import router as public_router
from app.api.apex_replay_routes import router as apex_replay_router
from app.api.usage_routes import router as usage_router
from app.api.tracking_routes import router as tracking_router
from app.api.ranking_routes import admin_router as ranking_admin_router, public_router as ranking_public_router
from app.chatbot.routes import router as chatbot_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup and shutdown."""
    # Initialize database
    await init_db()
    logger.info("Database initialized")

    # Create registries and hub
    registry = SessionRegistry()
    replay_registry = ReplayRegistry()
    circuit_hub = CircuitHub()

    # Store on app state
    app.state.registry = registry
    app.state.replay_registry = replay_registry
    app.state.circuit_hub = circuit_hub

    # Start circuit hub (connects to all circuits)
    await circuit_hub.start_all()

    # Start periodic maintenance (log compression + docker prune, every 6 hours)
    from app.tasks.compress_logs import compress_old_logs, docker_prune, periodic_compress_loop
    from app.tasks.cleanup_analytics import cleanup_old_analytics, periodic_analytics_cleanup
    # Run once at startup in executor (non-blocking)
    loop = asyncio.get_event_loop()
    loop.run_in_executor(None, compress_old_logs)
    loop.run_in_executor(None, docker_prune)
    compress_task = asyncio.create_task(periodic_compress_loop(interval_hours=6))
    # Run analytics cleanup once at startup, then daily
    asyncio.create_task(cleanup_old_analytics())
    analytics_cleanup_task = asyncio.create_task(periodic_analytics_cleanup(interval_hours=24))

    # Trial expiration checker + email reminders (runs daily)
    from app.tasks.trial_checker import periodic_trial_check
    trial_check_task = asyncio.create_task(periodic_trial_check(interval_hours=24))

    # Usage analytics rollup — aggregates `usage_events` into
    # `usage_daily` and purges raw events older than 30 days. Runs once
    # daily; pre-aggregation is what makes the admin "Analítica → Uso"
    # panel queries instant on weeks-long ranges.
    from app.tasks.usage_rollup import periodic_usage_rollup
    usage_rollup_task = asyncio.create_task(periodic_usage_rollup(interval_hours=24))

    # Driver ranking processor. Backfills `session_results` +
    # `driver_ratings` from every recorded Apex log not yet in
    # `processed_logs`. Runs once at startup (catching up anything we
    # missed while down) and then daily (consuming logs written in the
    # last 24 h). Heavy on first run for a fresh DB (~1000 historic
    # logs ≈ 5 min on the EC2 instance) — kicked off in a background
    # task so HTTP startup isn't blocked.
    from app.tasks.ranking_runner import periodic_ranking_run
    ranking_task = asyncio.create_task(periodic_ranking_run(interval_hours=24))

    logger.info("BoxboxNow v2 started (multi-tenant + CircuitHub)")

    yield

    # Shutdown
    compress_task.cancel()
    analytics_cleanup_task.cancel()
    trial_check_task.cancel()
    usage_rollup_task.cancel()
    ranking_task.cancel()
    await registry.stop_all()
    await replay_registry.stop_all()
    await circuit_hub.stop_all()
    logger.info("BoxboxNow v2 stopped")


app = FastAPI(
    title="BoxboxNow",
    description="Real-time karting race strategy application",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.allowed_origins.split(",")],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
    expose_headers=["X-MFA-Required"],
)

# Routes (order matters for auth)
app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(config_router)
app.include_router(race_router)
app.include_router(replay_router)
app.include_router(analytics_router)
app.include_router(gps_router)
app.include_router(stripe_router)
app.include_router(ws_router)
app.include_router(public_router)
app.include_router(apex_replay_router)
app.include_router(usage_router)
app.include_router(chatbot_router)
app.include_router(tracking_router)
app.include_router(ranking_admin_router)
app.include_router(ranking_public_router)


# Redirect Apex Timing JS image references (../commonv2/images/ resolves here)
from fastapi.responses import FileResponse as _FileResponse, HTMLResponse as _HTMLResponse
from pathlib import Path as _Path
_APEX_IMAGES = _Path(__file__).parent.parent / "static" / "apex-timing" / "images"

@app.get("/api/commonv2/images/{filename}")
async def apex_commonv2_images(filename: str):
    safe = _Path(filename).name
    fp = _APEX_IMAGES / safe
    if not fp.exists():
        return _HTMLResponse("Not found", status_code=404)
    mime = {".png": "image/png", ".jpg": "image/jpeg", ".gif": "image/gif"}.get(fp.suffix.lower(), "application/octet-stream")
    return _FileResponse(fp, media_type=mime)


@app.get("/health")
async def health():
    registry = app.state.registry
    replay_registry = app.state.replay_registry
    circuit_hub = app.state.circuit_hub
    return {
        "status": "ok",
        "activeSessions": len(registry._sessions),
        "activeReplays": len(replay_registry._sessions),
        "circuitHub": circuit_hub.get_status(),
    }
