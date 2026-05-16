import pytest
from sqlalchemy import select
from app.models.schemas import RankingSessionOverride
from app.services.ranking.processor import reset_ratings


@pytest.mark.asyncio
async def test_override_row_roundtrip_and_survives_reset(db_session):
    db = db_session
    db.add(RankingSessionOverride(circuit_name="Santos", log_date="2026-04-25",
                                  session_seq=1, forced_type="pace",
                                  title1="12H LOS SANTOS", title2="Clasificación"))
    await db.flush()
    await reset_ratings(db, wipe_drivers=False)
    rows = (await db.execute(select(RankingSessionOverride))).scalars().all()
    assert len(rows) == 1 and rows[0].forced_type == "pace"
