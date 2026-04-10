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
        try:
            await conn.execute(text("ALTER TABLE users ADD COLUMN mfa_required BOOLEAN DEFAULT 0"))
        except Exception:
            pass

        # Seed default app settings
        await conn.execute(text("""
            INSERT OR IGNORE INTO app_settings (key, value) VALUES ('kart_analytics_retention_days', '30')
        """))
        # Platform settings defaults
        for _key, _val in [("trial_days", "14"), ("trial_banner_days", "7"), ("trial_email_days", "3")]:
            await conn.execute(text(
                "INSERT OR IGNORE INTO app_settings (key, value) VALUES (:key, :value)"
            ), {"key": _key, "value": _val})

        # Seed live timing URLs for known circuits
        await conn.execute(text("""
            UPDATE circuits SET live_timing_url = 'https://www.apex-timing.com/live-timing/ariza-racing-circuit/index.html'
            WHERE id = 25 AND (live_timing_url IS NULL OR live_timing_url = '')
        """))
        await conn.execute(text("""
            UPDATE circuits SET live_timing_url = 'https://www.apex-timing.com/live-timing/karting-lossantos/index.html'
            WHERE id = 1 AND (live_timing_url IS NULL OR live_timing_url = '')
        """))


        # Add email, google_id, stripe_customer_id to users
        try:
            await conn.execute(text("ALTER TABLE users ADD COLUMN email VARCHAR(255)"))
        except Exception:
            pass
        try:
            await conn.execute(text("ALTER TABLE users ADD COLUMN google_id VARCHAR(255)"))
        except Exception:
            pass
        try:
            await conn.execute(text("ALTER TABLE users ADD COLUMN stripe_customer_id VARCHAR(255)"))
        except Exception:
            pass

        # Add password reset columns to users
        try:
            await conn.execute(text("ALTER TABLE users ADD COLUMN password_reset_token VARCHAR(255)"))
        except Exception:
            pass
        try:
            await conn.execute(text("ALTER TABLE users ADD COLUMN password_reset_expires DATETIME"))
        except Exception:
            pass

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

        # Migrate granular tab permissions: users with parent tab get new sub-tabs
        # adjusted → adjusted-beta, driver → driver-config, analytics → insights
        tab_migrations = [
            ("adjusted", "adjusted-beta"),
            ("driver", "driver-config"),
            ("analytics", "insights"),
        ]
        for parent_tab, new_tab in tab_migrations:
            await conn.execute(text("""
                INSERT OR IGNORE INTO user_tab_access (user_id, tab)
                SELECT user_id, :new_tab FROM user_tab_access
                WHERE tab = :parent_tab AND user_id NOT IN (
                    SELECT user_id FROM user_tab_access WHERE tab = :new_tab
                )
            """), {"parent_tab": parent_tab, "new_tab": new_tab})

        # Migrate product_tab_config: add stripe_price_id, price_amount, billing_interval columns
        try:
            await conn.execute(text("ALTER TABLE product_tab_config ADD COLUMN stripe_price_id VARCHAR(255)"))
        except Exception:
            pass
        try:
            await conn.execute(text("ALTER TABLE product_tab_config ADD COLUMN price_amount FLOAT"))
        except Exception:
            pass
        try:
            await conn.execute(text("ALTER TABLE product_tab_config ADD COLUMN billing_interval VARCHAR(20)"))
        except Exception:
            pass
        # Remove old unique constraint on stripe_product_id by recreating table if needed
        # (SQLite doesn't support DROP CONSTRAINT — the new create_all handles it for fresh DBs)

        # Seed default/trial tab configuration in app_settings
        new_settings_defaults = {
            "default_tabs": '["race","pit","live","config","adjusted","adjusted-beta","driver","driver-config"]',
            "default_max_devices": "2",
            "trial_tabs": '["race","pit","live","config","adjusted","adjusted-beta","driver","driver-config","replay","analytics","insights"]',
            "trial_max_devices": "2",
        }
        for key, default_value in new_settings_defaults.items():
            result = await conn.execute(text(f"SELECT key FROM app_settings WHERE key = :key"), {"key": key})
            if not result.fetchone():
                await conn.execute(
                    text("INSERT INTO app_settings (key, value) VALUES (:key, :value)"),
                    {"key": key, "value": default_value},
                )


async def get_db():
    async with async_session() as session:
        yield session
