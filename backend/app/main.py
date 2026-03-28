"""
BoxboxNow v2 - FastAPI application.
Multi-tenant: each user has their own race state and Apex connection.
"""

import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.models.database import init_db
from app.engine.registry import SessionRegistry
from app.engine.fifo import FifoManager
from app.apex.parser import ApexMessageParser
from app.apex.replay import ReplayEngine
from app.engine.state import RaceStateManager
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

    # Create session registry (multi-tenant)
    registry = SessionRegistry()

    # Replay engine uses a shared parser/state for demo purposes
    replay_parser = ApexMessageParser()
    replay_state = RaceStateManager()
    replay_fifo = FifoManager()

    async def replay_on_events(events):
        # Track which karts were NOT in pit before processing
        pre_pit_status = {
            row_id: kart.pit_status
            for row_id, kart in replay_state.karts.items()
        }
        await replay_state.handle_events(events)
        # Only add to FIFO karts that TRANSITIONED to in_pit (not already in pit)
        pit_in_karts = []
        for row_id, kart in replay_state.karts.items():
            if (kart.pit_status == "in_pit"
                    and pre_pit_status.get(row_id) != "in_pit"):
                pit_in_karts.append(kart)

        if pit_in_karts:
            # Re-compute clustering BEFORE adding to FIFO so tier_score is fresh
            try:
                from app.engine.clustering import compute_clustering
                compute_clustering(replay_state, {}, {})
            except Exception as e:
                logger.warning(f"Replay clustering before FIFO entry failed: {e}")

            for kart in pit_in_karts:
                logger.info(
                    f"Replay FIFO entry: kart #{kart.kart_number} pit_in "
                    f"tier_score={kart.tier_score}"
                )
                replay_fifo.add_entry(kart.tier_score)

    replay_engine = ReplayEngine(replay_parser, replay_on_events, logs_dir="data/logs")

    # Analytics loop for replay state (same as UserSession._analytics_loop)
    async def replay_analytics_loop():
        from app.engine.clustering import compute_clustering
        from app.engine.classification import compute_classification
        import json as _json
        while True:
            await asyncio.sleep(10)
            try:
                if len(replay_state.karts) > 0:
                    compute_clustering(replay_state, {}, {})
                    replay_fifo.apply_to_state(replay_state)
                    compute_classification(replay_state)

                    if replay_state._ws_clients:
                        update = {
                            "type": "analytics",
                            "data": {
                                "karts": [k.to_dict() for k in sorted(
                                    replay_state.karts.values(), key=lambda k: k.position or 999
                                )],
                                "fifo": {
                                    "queue": replay_state.fifo_queue,
                                    "score": replay_state.fifo_score,
                                    "history": replay_state.fifo_history[-10:],
                                },
                                "classification": replay_state.classification,
                                "config": {
                                    "circuitLengthM": replay_state.circuit_length_m,
                                    "pitTimeS": replay_state.pit_time_s,
                                    "ourKartNumber": replay_state.our_kart_number,
                                    "minPits": replay_state.min_pits,
                                    "maxStintMin": replay_state.max_stint_min,
                                    "minStintMin": replay_state.min_stint_min,
                                    "durationMin": replay_state.duration_min,
                                    "boxLines": replay_state.box_lines,
                                    "boxKarts": replay_state.box_karts,
                                },
                            },
                        }
                        data = _json.dumps(update)
                        dead = set()
                        for client in replay_state._ws_clients:
                            try:
                                await client.send_text(data)
                            except Exception:
                                dead.add(client)
                        for c in dead:
                            replay_state._ws_clients.discard(c)
            except Exception as e:
                logger.error(f"Replay analytics error: {e}", exc_info=True)

    analytics_task = asyncio.create_task(replay_analytics_loop())

    # Store on app state
    app.state.registry = registry
    app.state.replay_engine = replay_engine
    app.state.replay_state = replay_state
    app.state.replay_fifo = replay_fifo

    logger.info("BoxboxNow v2 started (multi-tenant)")

    yield

    # Shutdown
    analytics_task.cancel()
    await registry.stop_all()
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
    return {
        "status": "ok",
        "activeSessions": len(registry._sessions),
    }
