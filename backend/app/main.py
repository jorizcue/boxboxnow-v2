"""
BoxboxNow v2 - FastAPI application.
Single process that handles WebSocket ingestion, analytics, and serves the API.
"""

import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.models.database import init_db
from app.apex.parser import ApexMessageParser
from app.apex.client import ApexClient
from app.apex.replay import ReplayEngine
from app.engine.state import RaceStateManager
from app.engine.clustering import compute_clustering
from app.engine.fifo import FifoManager
from app.engine.classification import compute_classification
from app.api.config_routes import router as config_router
from app.api.race_routes import router as race_router
from app.api.replay_routes import router as replay_router
from app.ws.server import router as ws_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


async def analytics_loop(state: RaceStateManager, fifo: FifoManager, interval: float = 30.0):
    """Periodic analytics recomputation."""
    while True:
        await asyncio.sleep(interval)
        try:
            if len(state.karts) > 0:
                # Compute clustering
                team_positions = {}  # TODO: load from DB
                compute_clustering(state, team_positions)

                # Update FIFO state
                fifo.apply_to_state(state)

                # Compute classification
                compute_classification(state)

                # Broadcast analytics update
                if state._ws_clients:
                    import json
                    update = {
                        "type": "analytics",
                        "data": {
                            "karts": [k.to_dict() for k in sorted(
                                state.karts.values(), key=lambda k: k.position or 999
                            )],
                            "fifo": {
                                "queue": state.fifo_queue,
                                "score": state.fifo_score,
                                "history": state.fifo_history[-10:],
                            },
                            "classification": state.classification,
                        },
                    }
                    data = json.dumps(update)
                    dead = set()
                    for client in state._ws_clients:
                        try:
                            await client.send_text(data)
                        except Exception:
                            dead.add(client)
                    for c in dead:
                        state._ws_clients.discard(c)

                logger.debug(f"Analytics updated for {len(state.karts)} karts")
        except Exception as e:
            logger.error(f"Analytics error: {e}", exc_info=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup and shutdown."""
    settings = get_settings()

    # Initialize database
    await init_db()
    logger.info("Database initialized")

    # Create core components
    parser = ApexMessageParser()
    state = RaceStateManager()
    fifo = FifoManager(queue_size=state.box_karts, box_lines=state.box_lines)

    # Event handler for both live and replay
    async def on_events(events):
        await state.handle_events(events)
        # Check for pit-in events to update FIFO
        for event in events:
            if event.type.value == "pit_in":
                kart = state.karts.get(event.row_id)
                if kart:
                    fifo.add_entry(kart.tier_score)

    # Create Apex client and replay engine
    apex_client = ApexClient(settings.apex_ws_url, parser, on_events)
    replay_engine = ReplayEngine(parser, on_events, logs_dir="data/logs")

    # Store on app state for access in routes
    app.state.race_state = state
    app.state.parser = parser
    app.state.apex_client = apex_client
    app.state.replay_engine = replay_engine
    app.state.fifo = fifo

    # Start analytics loop
    analytics_task = asyncio.create_task(analytics_loop(state, fifo))

    # Don't auto-connect to Apex (user starts via config or replay)
    logger.info("BoxboxNow v2 started")

    yield

    # Shutdown
    analytics_task.cancel()
    await apex_client.stop()
    await replay_engine.stop()
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

# Routes
app.include_router(config_router)
app.include_router(race_router)
app.include_router(replay_router)
app.include_router(ws_router)


@app.get("/health")
async def health():
    state = app.state.race_state
    return {
        "status": "ok",
        "karts": len(state.karts),
        "clients": len(state._ws_clients),
        "raceStarted": state.race_started,
    }
