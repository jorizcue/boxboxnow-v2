"""TDD — control de acceso en replay/analytics (auditoría H1/H3/H4).

Cubre:
- H1: `_resolve_log_path` rechaza path traversal (no necesita DB).
- H3: `user_can_access_circuit_dir` exige acceso al circuito CONCRETO
      cuyo slug coincide con el `circuit_dir`, no a cualquier circuito.
- H4: `_filter_race_log_ids_by_circuit` descarta ids de otros circuitos.
"""
from __future__ import annotations

import sys
import types
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import MagicMock

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

if "resend" not in sys.modules:
    _r = types.ModuleType("resend")
    _r.api_key = None
    _r.Emails = MagicMock()
    sys.modules["resend"] = _r

from app.api.apex_replay_routes import _resolve_log_path  # noqa: E402
from app.api.analytics_routes import _filter_race_log_ids_by_circuit  # noqa: E402
from app.api.auth_routes import user_can_access_circuit_dir  # noqa: E402
from app.apex.circuit_hub import _safe_name  # noqa: E402
from app.models.schemas import (  # noqa: E402
    Base, User, Circuit, UserCircuitAccess, RaceLog,
)


# ── H1: path traversal en _resolve_log_path (sin DB) ─────────────────

def _make_recording(tmp_path: Path, circuit_dir: str, filename: str, body: str) -> None:
    d = tmp_path / "data" / "recordings" / circuit_dir
    d.mkdir(parents=True, exist_ok=True)
    (d / filename).write_text(body)


def test_resolve_log_path_accepts_legit_recording(tmp_path, monkeypatch):
    import app.api.apex_replay_routes as mod
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(mod, "RECORDINGS_BASE_DIR", "data/recordings")
    monkeypatch.setattr(mod, "LOGS_BASE_DIR", "data/logs")
    _make_recording(tmp_path, "Karting_Genk", "2026-06-08.log", "x")
    got = _resolve_log_path("2026-06-08.log", "Karting_Genk")
    assert got is not None
    assert got.endswith("data/recordings/Karting_Genk/2026-06-08.log")


def test_resolve_log_path_rejects_dotdot_circuit_dir(tmp_path, monkeypatch):
    import app.api.apex_replay_routes as mod
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(mod, "RECORDINGS_BASE_DIR", "data/recordings")
    monkeypatch.setattr(mod, "LOGS_BASE_DIR", "data/logs")
    # Plant a secret outside recordings; traversal must NOT reach it.
    secret = tmp_path / "data" / "logs" / "73"
    secret.mkdir(parents=True, exist_ok=True)
    (secret / "private.log").write_text("other user data")
    # circuit_dir='..' + nested filename would escape pre-fix.
    assert _resolve_log_path("private.log", "../logs/73") is None
    assert _resolve_log_path("../logs/73/private.log", "anything") is None


def test_resolve_log_path_rejects_absolute_and_etc(tmp_path, monkeypatch):
    import app.api.apex_replay_routes as mod
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(mod, "RECORDINGS_BASE_DIR", "data/recordings")
    monkeypatch.setattr(mod, "LOGS_BASE_DIR", "data/logs")
    # Absolute path and deep traversal both collapse to basename / are rejected.
    assert _resolve_log_path("/etc/passwd", None) is None
    assert _resolve_log_path("../../../../etc/passwd", None) is None


def test_resolve_log_path_basename_only_for_root_logs(tmp_path, monkeypatch):
    import app.api.apex_replay_routes as mod
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(mod, "RECORDINGS_BASE_DIR", "data/recordings")
    monkeypatch.setattr(mod, "LOGS_BASE_DIR", "data/logs")
    root = tmp_path / "data" / "logs"
    root.mkdir(parents=True, exist_ok=True)
    (root / "sys.log").write_text("y")
    assert _resolve_log_path("sys.log", None).endswith("data/logs/sys.log")
    # A directory component in filename is stripped to basename.
    assert _resolve_log_path("sub/sys.log", None).endswith("data/logs/sys.log")


# ── DB fixture (mirror test_circuit_access_resolver.py) ──────────────

@pytest_asyncio.fixture
async def db():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as s:
        yield s
    await engine.dispose()


# ── H3: user_can_access_circuit_dir ──────────────────────────────────

async def test_circuit_dir_access_granted_for_owned_circuit(db):
    now = datetime.now(timezone.utc)
    c = Circuit(name="Karting Genk (CIK)", ws_port=8243, for_sale=True)
    u = User(username="genkuser", password_hash="x", is_admin=False)
    db.add_all([c, u]); await db.flush()
    db.add(UserCircuitAccess(user_id=u.id, circuit_id=c.id,
                             valid_from=now - timedelta(hours=1),
                             valid_until=now + timedelta(days=1)))
    await db.commit()
    slug = _safe_name(c.name)  # what the recorder uses for the dir
    assert await user_can_access_circuit_dir(db, u.id, False, slug) is True


async def test_circuit_dir_access_denied_for_unowned_circuit(db):
    now = datetime.now(timezone.utc)
    owned = Circuit(name="Karting Genk (CIK)", ws_port=8243, for_sale=True)
    other = Circuit(name="Le Mans Karting (CIK)", ws_port=7963, for_sale=True)
    u = User(username="genkonly", password_hash="x", is_admin=False)
    db.add_all([owned, other, u]); await db.flush()
    db.add(UserCircuitAccess(user_id=u.id, circuit_id=owned.id,
                             valid_from=now - timedelta(hours=1),
                             valid_until=now + timedelta(days=1)))
    await db.commit()
    # User has access to `owned` only → must be denied `other`'s recordings.
    assert await user_can_access_circuit_dir(db, u.id, False, _safe_name(other.name)) is False


async def test_circuit_dir_access_admin_bypasses(db):
    other = Circuit(name="Le Mans Karting (CIK)", ws_port=7963, for_sale=True)
    admin = User(username="admin1", password_hash="x", is_admin=True)
    db.add_all([other, admin]); await db.flush()
    await db.commit()
    assert await user_can_access_circuit_dir(db, admin.id, True, _safe_name(other.name)) is True


async def test_circuit_dir_access_unknown_dir_denied(db):
    u = User(username="nouser", password_hash="x", is_admin=False)
    db.add(u); await db.flush(); await db.commit()
    assert await user_can_access_circuit_dir(db, u.id, False, "Nonexistent_Circuit") is False


# ── H4: _filter_race_log_ids_by_circuit ──────────────────────────────

async def test_filter_race_log_ids_keeps_only_circuit(db):
    cA = Circuit(name="Circuit A", ws_port=9001, for_sale=True)
    cB = Circuit(name="Circuit B", ws_port=9002, for_sale=True)
    db.add_all([cA, cB]); await db.flush()
    now = datetime.now(timezone.utc)
    logA = RaceLog(circuit_id=cA.id, user_id=None, race_date=now, session_name="A")
    logB1 = RaceLog(circuit_id=cB.id, user_id=None, race_date=now, session_name="B1")
    logB2 = RaceLog(circuit_id=cB.id, user_id=None, race_date=now, session_name="B2")
    db.add_all([logA, logB1, logB2]); await db.flush(); await db.commit()

    # Attacker authorized for A passes A's id + B's ids → only A survives.
    requested = [logA.id, logB1.id, logB2.id]
    kept = await _filter_race_log_ids_by_circuit(db, requested, cA.id)
    assert kept == [logA.id]

    # Passing only foreign ids → empty (no leak).
    kept_foreign = await _filter_race_log_ids_by_circuit(db, [logB1.id, logB2.id], cA.id)
    assert kept_foreign == []


async def test_filter_race_log_ids_empty_input(db):
    cA = Circuit(name="Circuit A", ws_port=9001, for_sale=True)
    db.add(cA); await db.flush(); await db.commit()
    assert await _filter_race_log_ids_by_circuit(db, [], cA.id) == []
