import logging
from sqlalchemy import event, text
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


# Enable foreign key enforcement on every connection (required for ON DELETE CASCADE in SQLite)
@event.listens_for(engine.sync_engine, "connect")
def _set_sqlite_fk_pragma(dbapi_conn, connection_record):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()

async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Enable WAL mode for concurrent reads
        await conn.execute(text("PRAGMA journal_mode=WAL"))
        # Enable foreign key enforcement (required for ON DELETE CASCADE)
        await conn.execute(text("PRAGMA foreign_keys=ON"))

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
        # SQLite can't DROP CONSTRAINT — recreate table to remove UNIQUE on stripe_product_id
        try:
            result = await conn.execute(text("PRAGMA index_list('product_tab_config')"))
            indexes = result.fetchall()
            has_old_unique = any(
                "stripe_product_id" in str(idx) and idx[2] == 1  # idx[2]=1 means unique
                for idx in indexes
            )
            if not has_old_unique:
                # Also check via index_info for auto-generated unique index names
                for idx in indexes:
                    if idx[2] == 1:  # unique index
                        idx_info = await conn.execute(text(f"PRAGMA index_info('{idx[1]}')"))
                        cols = [row[2] for row in idx_info.fetchall()]
                        if cols == ["stripe_product_id"]:
                            has_old_unique = True
                            break

            if has_old_unique:
                logger.info("Migrating product_tab_config: removing UNIQUE on stripe_product_id")
                await conn.execute(text("""
                    CREATE TABLE product_tab_config_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        stripe_product_id VARCHAR(255) NOT NULL,
                        stripe_price_id VARCHAR(255) NOT NULL UNIQUE,
                        plan_type VARCHAR(50) NOT NULL UNIQUE,
                        tabs TEXT NOT NULL DEFAULT '[]',
                        max_devices INTEGER NOT NULL DEFAULT 1,
                        display_name VARCHAR(100) NOT NULL DEFAULT '',
                        description TEXT,
                        features TEXT DEFAULT '[]',
                        price_amount FLOAT,
                        billing_interval VARCHAR(20),
                        is_popular BOOLEAN NOT NULL DEFAULT 0,
                        is_visible BOOLEAN NOT NULL DEFAULT 1,
                        sort_order INTEGER NOT NULL DEFAULT 0
                    )
                """))
                await conn.execute(text("""
                    INSERT INTO product_tab_config_new
                        (id, stripe_product_id, stripe_price_id, plan_type, tabs, max_devices,
                         display_name, description, features, price_amount, billing_interval,
                         is_popular, is_visible, sort_order)
                    SELECT id, stripe_product_id,
                           COALESCE(stripe_price_id, ''),
                           COALESCE(plan_type, stripe_product_id),
                           tabs, max_devices,
                           display_name, description, features,
                           COALESCE(price_amount, 0), COALESCE(billing_interval, 'month'),
                           is_popular, is_visible, sort_order
                    FROM product_tab_config
                """))
                await conn.execute(text("DROP TABLE product_tab_config"))
                await conn.execute(text("ALTER TABLE product_tab_config_new RENAME TO product_tab_config"))
                # Recreate non-unique index on stripe_product_id
                await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_product_tab_config_stripe_product_id ON product_tab_config (stripe_product_id)"))
                await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_product_tab_config_stripe_price_id ON product_tab_config (stripe_price_id)"))
                logger.info("product_tab_config migration complete")
        except Exception as e:
            logger.warning(f"product_tab_config migration check: {e}")

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


        # Add pending_plan column to subscriptions
        try:
            await conn.execute(text("ALTER TABLE subscriptions ADD COLUMN pending_plan VARCHAR(50)"))
        except Exception:
            pass

        # Add auto_load_teams column to race_sessions
        try:
            await conn.execute(text("ALTER TABLE race_sessions ADD COLUMN auto_load_teams BOOLEAN DEFAULT 1 NOT NULL"))
        except Exception:
            pass

        # Add has_custom_password column to users (False for Google-only signups)
        try:
            await conn.execute(text("ALTER TABLE users ADD COLUMN has_custom_password BOOLEAN DEFAULT 1 NOT NULL"))
            # Mark existing Google-only users as not having a custom password
            await conn.execute(text(
                "UPDATE users SET has_custom_password = 0 WHERE google_id IS NOT NULL AND google_id != ''"
            ))
        except Exception:
            pass

        # Add concurrency_web, concurrency_mobile, per_circuit to product_tab_config
        try:
            await conn.execute(text("ALTER TABLE product_tab_config ADD COLUMN concurrency_web INTEGER"))
        except Exception:
            pass
        try:
            await conn.execute(text("ALTER TABLE product_tab_config ADD COLUMN concurrency_mobile INTEGER"))
        except Exception:
            pass
        try:
            await conn.execute(text("ALTER TABLE product_tab_config ADD COLUMN per_circuit BOOLEAN DEFAULT 1 NOT NULL"))
        except Exception:
            pass

        # Drop UNIQUE constraint on product_tab_config.plan_type so the same
        # label can be reused across multiple products. stripe_price_id remains
        # unique (one row per price). SQLite can't DROP CONSTRAINT — detect the
        # unique index on plan_type and rebuild the table without it.
        try:
            idx_result = await conn.execute(text("PRAGMA index_list('product_tab_config')"))
            indexes = idx_result.fetchall()
            has_unique_plan_type = False
            for idx in indexes:
                if idx[2] == 1:  # unique index
                    info = await conn.execute(text(f"PRAGMA index_info('{idx[1]}')"))
                    cols = [row[2] for row in info.fetchall()]
                    if cols == ["plan_type"]:
                        has_unique_plan_type = True
                        break
            if has_unique_plan_type:
                logger.info("Migrating product_tab_config: removing UNIQUE on plan_type")
                await conn.execute(text("""
                    CREATE TABLE product_tab_config_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        stripe_product_id VARCHAR(255) NOT NULL,
                        stripe_price_id VARCHAR(255) NOT NULL UNIQUE,
                        plan_type VARCHAR(50) NOT NULL,
                        tabs TEXT NOT NULL DEFAULT '[]',
                        max_devices INTEGER NOT NULL DEFAULT 1,
                        concurrency_web INTEGER,
                        concurrency_mobile INTEGER,
                        per_circuit BOOLEAN NOT NULL DEFAULT 1,
                        display_name VARCHAR(100) NOT NULL DEFAULT '',
                        description TEXT,
                        features TEXT DEFAULT '[]',
                        price_amount FLOAT,
                        billing_interval VARCHAR(20),
                        is_popular BOOLEAN NOT NULL DEFAULT 0,
                        is_visible BOOLEAN NOT NULL DEFAULT 1,
                        sort_order INTEGER NOT NULL DEFAULT 0
                    )
                """))
                await conn.execute(text("""
                    INSERT INTO product_tab_config_new
                        (id, stripe_product_id, stripe_price_id, plan_type, tabs, max_devices,
                         concurrency_web, concurrency_mobile, per_circuit,
                         display_name, description, features, price_amount, billing_interval,
                         is_popular, is_visible, sort_order)
                    SELECT id, stripe_product_id, stripe_price_id, plan_type, tabs, max_devices,
                           concurrency_web, concurrency_mobile, COALESCE(per_circuit, 1),
                           display_name, description, features, price_amount, billing_interval,
                           is_popular, is_visible, sort_order
                    FROM product_tab_config
                """))
                await conn.execute(text("DROP TABLE product_tab_config"))
                await conn.execute(text("ALTER TABLE product_tab_config_new RENAME TO product_tab_config"))
                await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_product_tab_config_stripe_product_id ON product_tab_config (stripe_product_id)"))
                await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_product_tab_config_stripe_price_id ON product_tab_config (stripe_price_id)"))
                logger.info("product_tab_config UNIQUE plan_type drop complete")
        except Exception as e:
            logger.warning(f"product_tab_config plan_type unique drop: {e}")

        # Backfill stripe_price_id on subscriptions rows that were created before
        # we started persisting it on Subscription. Populate from ProductTabConfig
        # via plan_type where possible. Needed so downstream lookups (concurrency
        # limits, invoice renewals) can resolve the config without falling back
        # to plan_type matching.
        try:
            await conn.execute(text("ALTER TABLE subscriptions ADD COLUMN stripe_price_id VARCHAR(255)"))
        except Exception:
            pass
        try:
            await conn.execute(text("""
                UPDATE subscriptions
                SET stripe_price_id = (
                    SELECT p.stripe_price_id FROM product_tab_config p
                    WHERE p.plan_type = subscriptions.plan_type
                    LIMIT 1
                )
                WHERE stripe_price_id IS NULL AND plan_type IS NOT NULL
            """))
        except Exception as e:
            logger.warning(f"subscription stripe_price_id backfill: {e}")

        # Add is_default to driver_config_presets so a single preset can be
        # marked as the "default" that auto-applies when the driver view loads.
        try:
            await conn.execute(text(
                "ALTER TABLE driver_config_presets ADD COLUMN is_default BOOLEAN DEFAULT 0 NOT NULL"
            ))
        except Exception:
            pass

        # Add display-option columns (contrast / orientation / audio_enabled)
        # to driver_config_presets so the template wizard step 4 persists.
        # Each ALTER is wrapped separately because SQLite aborts on any failure.
        for ddl in (
            "ALTER TABLE driver_config_presets ADD COLUMN contrast FLOAT",
            "ALTER TABLE driver_config_presets ADD COLUMN orientation VARCHAR(16)",
            "ALTER TABLE driver_config_presets ADD COLUMN audio_enabled BOOLEAN",
        ):
            try:
                await conn.execute(text(ddl))
            except Exception:
                pass

async def get_db():
    async with async_session() as session:
        yield session
