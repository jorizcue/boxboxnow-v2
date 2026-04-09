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
from app.ws.server import router as ws_router

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

    logger.info("BoxboxNow v2 started (multi-tenant + CircuitHub)")

    yield

    # Shutdown
    compress_task.cancel()
    analytics_cleanup_task.cancel()
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
    allow_methods=["*"],
    allow_headers=["*"],
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
app.include_router(ws_router)


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
