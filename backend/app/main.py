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

    logger.info("BoxboxNow v2 started (multi-tenant + CircuitHub)")

    yield

    # Shutdown
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
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes (order matters for auth)
app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(config_router)
app.include_router(race_router)
app.include_router(replay_router)
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
