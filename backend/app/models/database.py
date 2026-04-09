import logging
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from app.config import get_settings

logger = logging.getLogger(__name__)


class Base(DeclarativeBase):
    pass


engine = create_async_engine(
    get_settings().database_url,
    echo=False,
    connect_args={"check_same_thread": False},
)

async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Enable WAL mode for concurrent reads
        await conn.execute(text("PRAGMA journal_mode=WAL"))

        # Migrations: add columns that may not exist yet
        try:
            await conn.execute(text("ALTER TABLE circuits ADD COLUMN live_timing_url VARCHAR(255) DEFAULT ''"))
        except Exception:
            pass  # Column already exists

        # Add ws_port_data column and populate with ws_port - 1
        try:
            await conn.execute(text("ALTER TABLE circuits ADD COLUMN ws_port_data INTEGER"))
        except Exception:
            pass  # Column already exists
        await conn.execute(text("""
            UPDATE circuits SET ws_port_data = ws_port - 1
            WHERE ws_port_data IS NULL
        """))

        # Add pit window columns to race_sessions
        try:
            await conn.execute(text("ALTER TABLE race_sessions ADD COLUMN pit_closed_start_min INTEGER DEFAULT 0"))
        except Exception:
            pass
        try:
            await conn.execute(text("ALTER TABLE race_sessions ADD COLUMN pit_closed_end_min INTEGER DEFAULT 0"))
        except Exception:
            pass

        # Recreate live_race_state if it has the old schema (race_session_id column)
        try:
            result = await conn.execute(text("PRAGMA table_info(live_race_state)"))
            columns = [row[1] for row in result.fetchall()]
            if columns and "race_session_id" in columns:
                await conn.execute(text("DROP TABLE IF EXISTS live_pit_events"))
                await conn.execute(text("DROP TABLE IF EXISTS live_race_state"))
                logger.info("Dropped old live_race_state/live_pit_events tables (schema migration)")
        except Exception:
            pass

        # Add retention_days to circuits
        try:
            await conn.execute(text("ALTER TABLE circuits ADD COLUMN retention_days INTEGER DEFAULT 30 NOT NULL"))
        except Exception:
            pass

        # Add recorded_at to kart_laps
        try:
            await conn.execute(text("ALTER TABLE kart_laps ADD COLUMN recorded_at DATETIME"))
        except Exception:
            pass

        # Add MFA columns to users
        try:
            await conn.execute(text("ALTER TABLE users ADD COLUMN mfa_secret VARCHAR"))
        except Exception:
            pass
        try:
            await conn.execute(text("ALTER TABLE users ADD COLUMN mfa_enabled BOOLEAN DEFAULT 0"))
        except Exception:
            pass

        # Seed default app settings
        await conn.execute(text("""
            INSERT OR IGNORE INTO app_settings (key, value) VALUES ('kart_analytics_retention_days', '30')
        """))

        # Seed live timing URLs for known circuits
        await conn.execute(text("""
            UPDATE circuits SET live_timing_url = 'https://www.apex-timing.com/live-timing/ariza-racing-circuit/index.html'
            WHERE id = 25 AND (live_timing_url IS NULL OR live_timing_url = '')
        """))
        await conn.execute(text("""
            UPDATE circuits SET live_timing_url = 'https://www.apex-timing.com/live-timing/karting-lossantos/index.html'
            WHERE id = 1 AND (live_timing_url IS NULL OR live_timing_url = '')
        """))


        # Seed default tab access for all users (basic tabs)
        # This ensures existing users get access to all standard tabs
        basic_tabs = ["race", "pit", "live", "adjusted", "driver", "config", "replay", "analytics"]
        for tab in basic_tabs:
            await conn.execute(text("""
                INSERT OR IGNORE INTO user_tab_access (user_id, tab)
                SELECT id, :tab FROM users WHERE id NOT IN (
                    SELECT user_id FROM user_tab_access WHERE tab = :tab
                )
            """), {"tab": tab})


async def get_db():
    async with async_session() as session:
        yield session
