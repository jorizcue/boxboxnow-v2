from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from app.config import get_settings


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

        # Seed live timing URLs for known circuits
        await conn.execute(text("""
            UPDATE circuits SET live_timing_url = 'https://www.apex-timing.com/live-timing/ariza-racing-circuit/index.html'
            WHERE id = 25 AND (live_timing_url IS NULL OR live_timing_url = '')
        """))
        await conn.execute(text("""
            UPDATE circuits SET live_timing_url = 'https://www.apex-timing.com/live-timing/karting-lossantos/index.html'
            WHERE id = 1 AND (live_timing_url IS NULL OR live_timing_url = '')
        """))


async def get_db():
    async with async_session() as session:
        yield session
