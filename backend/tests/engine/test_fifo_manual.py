"""Tests del FifoManager en modo manual.

Cubren los caminos críticos del flow manual (pre-cola + timer + best-line):

  - Modo auto sigue funcionando idéntico (regresión).
  - pit-in en modo manual → entry en pre_queue, no en fifo.
  - assign_manually() pasa entry de pre_queue a fifo con line correcta.
  - cancel_pending() elimina sin commit (caso pit-out antes de 15 s).
  - timeout fallback commitea con _best_line() tras MANUAL_TIMEOUT_S.
  - flush_pending() vacía la pre_queue a auto.
  - reset() limpia timers y pre_queue (no leak entre sesiones).
  - _best_line() respeta "fewest pending + counter tiebreak".

Los tests de timer usan un `MANUAL_TIMEOUT_S` parcheado a 0.05 s para no
bloquear el suite. La firma async/sync mezcla pytest-asyncio porque la
parte de timers requiere un event loop activo.
"""
from __future__ import annotations

import asyncio

import pytest

from app.engine import fifo as fifo_mod
from app.engine.fifo import FifoManager


@pytest.fixture
def fast_timeout(monkeypatch):
    """Acelera el timeout a 50 ms para que los tests no esperen 15 s."""
    monkeypatch.setattr(fifo_mod, "MANUAL_TIMEOUT_S", 0.05)


# ── Regresión: modo auto sin tocar nada ──────────────────────────────


def test_auto_mode_keeps_round_robin():
    m = FifoManager(queue_size=10, box_lines=3)
    # 5 pit-ins de karts distintos → líneas distribuidas por _best_line.
    for k in range(1, 6):
        m.add_entry(tier_score=50, kart_number=k, team_name=f"T{k}")
    # Filtramos los entries reales (kartNumber > 0).
    real = [e for e in m.fifo if e["kartNumber"] > 0]
    assert len(real) == 5
    # Distribución: 5 / 3 carriles = 2,2,1 (sin importar el orden).
    counts = [0, 0, 0]
    for e in real:
        counts[e["line"]] += 1
    assert sorted(counts) == [1, 2, 2]


# ── Pre-cola en modo manual (sin event loop, sin timer) ──────────────


def test_manual_mode_redirects_to_pre_queue():
    m = FifoManager(queue_size=10, box_lines=2)
    m.manual_mode = True
    m.add_entry(tier_score=80, kart_number=42, team_name="Team42")
    # No hay event loop activo → no se programa timer pero la entry
    # debe estar en pre_queue.
    assert len(m.pre_queue) == 1
    assert m.pre_queue[0]["kartNumber"] == 42
    # La rolling fifo sigue solo con defaults.
    real_in_fifo = [e for e in m.fifo if e["kartNumber"] > 0]
    assert real_in_fifo == []


def test_manual_mode_duplicate_pit_in_ignored():
    """Apex puede repintar el `in_pit` → no queremos meter dos veces."""
    m = FifoManager(queue_size=10, box_lines=2)
    m.manual_mode = True
    m.add_entry(tier_score=80, kart_number=42)
    m.add_entry(tier_score=80, kart_number=42)
    assert len(m.pre_queue) == 1


def test_assign_manually_moves_to_fifo():
    m = FifoManager(queue_size=10, box_lines=2)
    m.manual_mode = True
    m.add_entry(tier_score=80, kart_number=42)
    ok = m.assign_manually(kart_number=42, line=1)
    assert ok
    assert m.pre_queue == []
    real = [e for e in m.fifo if e["kartNumber"] > 0]
    assert len(real) == 1
    assert real[0]["kartNumber"] == 42
    assert real[0]["line"] == 1


def test_assign_manually_rejects_unknown_kart():
    m = FifoManager(queue_size=10, box_lines=2)
    m.manual_mode = True
    assert m.assign_manually(kart_number=99, line=0) is False


def test_assign_manually_rejects_bad_line():
    m = FifoManager(queue_size=10, box_lines=2)
    m.manual_mode = True
    m.add_entry(tier_score=80, kart_number=42)
    assert m.assign_manually(kart_number=42, line=5) is False
    # No debería haber consumido la entrada.
    assert len(m.pre_queue) == 1


def test_cancel_pending_removes_without_commit():
    m = FifoManager(queue_size=10, box_lines=2)
    m.manual_mode = True
    m.add_entry(tier_score=80, kart_number=42)
    m.cancel_pending(42)
    assert m.pre_queue == []
    real = [e for e in m.fifo if e["kartNumber"] > 0]
    assert real == []


def test_flush_pending_commits_all_to_auto():
    m = FifoManager(queue_size=10, box_lines=2)
    m.manual_mode = True
    m.add_entry(tier_score=80, kart_number=42)
    m.add_entry(tier_score=80, kart_number=43)
    m.flush_pending()
    assert m.pre_queue == []
    real = [e for e in m.fifo if e["kartNumber"] > 0]
    assert len(real) == 2


def test_reset_clears_pre_queue_and_keeps_manual_mode():
    """reset() limpia el estado pero el flag de modo lo gestiona el
    caller (UserSession). Confirma que NO toca manual_mode."""
    m = FifoManager(queue_size=10, box_lines=2)
    m.manual_mode = True
    m.add_entry(tier_score=80, kart_number=42)
    m.reset()
    assert m.pre_queue == []
    assert m._pre_queue_timers == {}
    assert m.manual_mode is True  # preservado


# ── Best-line ────────────────────────────────────────────────────────


def test_best_line_fewest_first():
    m = FifoManager(queue_size=20, box_lines=3)
    # Forzar distribución desigual via _commit_entry.
    m._commit_entry({"score": 50, "kartNumber": 1}, line=0, timestamp=None)
    m._commit_entry({"score": 50, "kartNumber": 2}, line=0, timestamp=None)
    m._commit_entry({"score": 50, "kartNumber": 3}, line=0, timestamp=None)
    m._commit_entry({"score": 50, "kartNumber": 4}, line=1, timestamp=None)
    # counts = [3, 1, 0] → best = línea 2.
    assert m._best_line() == 2


def test_best_line_tiebreak_with_counter():
    m = FifoManager(queue_size=20, box_lines=3)
    # Todos los carriles vacíos → counter rotativo.
    first = m._best_line()
    second = m._best_line()
    third = m._best_line()
    assert {first, second, third} == {0, 1, 2}


def test_best_line_round_robin_5_karts_3_lanes():
    """Regresión del bug reportado por el operador: con 3 carriles
    vacíos, 5 pit-ins seguidos deben quedar 2-2-1 distribuidos en
    orden F1, F2, F3, F1, F2 — NO con el 4º en F3 y el 5º en F1.

    Causa histórica: la rama de single-candidate de _best_line no
    sincronizaba _next_line, así que tras el 3º pit-in (que era el
    único candidato porque las otras dos lanes ya estaban llenas)
    el counter quedaba apuntando a la línea recién asignada y el
    siguiente tiebreak la elegía otra vez.
    """
    m = FifoManager(queue_size=9, box_lines=3)
    karts = [("German", 11), ("Rodriguez", 22), ("Mendez", 33),
             ("JuanJose", 44), ("Urbiola", 55)]
    for name, kart in karts:
        m.add_entry(tier_score=50, kart_number=kart, team_name=name)

    real = [e for e in m.fifo if e["kartNumber"] > 0]
    by_kart = {e["kartNumber"]: e["line"] for e in real}
    assert by_kart == {11: 0, 22: 1, 33: 2, 44: 0, 55: 1}, \
        f"Distribución incorrecta: {by_kart}"


def test_best_line_alternates_after_single_candidate():
    """Cubre el corazón del fix: tras una asignación por
    single-candidate, _next_line debe avanzar a (chosen+1)%box_lines
    para que el siguiente tiebreak no recaiga sobre la misma lane.
    """
    m = FifoManager(queue_size=10, box_lines=3)
    # Forzar counts = [1, 1, 0] mediante commits directos.
    m._commit_entry({"score": 50, "kartNumber": 1}, line=0, timestamp=None)
    m._commit_entry({"score": 50, "kartNumber": 2}, line=1, timestamp=None)
    # Single-candidate → line 2.
    assert m._best_line() == 2
    # Ahora counts = [1, 1, 1] → tiebreak debe arrancar en 0, no en 2.
    m._commit_entry({"score": 50, "kartNumber": 3}, line=2, timestamp=None)
    assert m._best_line() == 0


# ── Timer fallback (event loop requerido) ────────────────────────────


@pytest.mark.asyncio
async def test_timeout_falls_back_to_auto(fast_timeout):
    m = FifoManager(queue_size=10, box_lines=2)
    m.manual_mode = True
    m.add_entry(tier_score=80, kart_number=42)
    assert len(m.pre_queue) == 1
    assert 42 in m._pre_queue_timers
    # Esperar a que dispare el fallback.
    await asyncio.sleep(0.15)
    assert m.pre_queue == []
    real = [e for e in m.fifo if e["kartNumber"] > 0]
    assert len(real) == 1
    assert real[0]["kartNumber"] == 42


@pytest.mark.asyncio
async def test_manual_pick_cancels_timer(fast_timeout):
    m = FifoManager(queue_size=10, box_lines=2)
    m.manual_mode = True
    m.add_entry(tier_score=80, kart_number=42)
    ok = m.assign_manually(42, line=0)
    assert ok
    # El timer original debe estar cancelado.
    await asyncio.sleep(0.15)
    real = [e for e in m.fifo if e["kartNumber"] > 0]
    # Solo UNA entrada (la del manual pick) — el timer NO debe haber
    # añadido una segunda.
    assert len(real) == 1


@pytest.mark.asyncio
async def test_cancel_pending_cancels_timer(fast_timeout):
    m = FifoManager(queue_size=10, box_lines=2)
    m.manual_mode = True
    m.add_entry(tier_score=80, kart_number=42)
    m.cancel_pending(42)
    await asyncio.sleep(0.15)
    real = [e for e in m.fifo if e["kartNumber"] > 0]
    assert real == []


# ── Per-entry pitInRaceTimeMs (fix de duplicado timer en FIFO) ───────


def test_add_entry_persists_pit_in_race_time_ms():
    """Cada entry committeada al FIFO debe llevar SU PROPIO race-time
    del pit-in. Esto permite al cliente pintar timers distintos para
    dos entries del mismo kart. Bug observado: dos cards de LOS
    EMILIOS mostraban 00:07:50 ambas porque el cliente leía
    pit_history[-1] del kart en vez de un campo por-entry.
    """
    m = FifoManager(queue_size=10, box_lines=2)
    # Mismo kart, dos pit-ins en momentos distintos (race-elapsed ms).
    m.add_entry(tier_score=50, kart_number=18, team_name="LOS EMILIOS",
                driver_name="BARREDA", pit_in_race_time_ms=3_600_000)
    m.add_entry(tier_score=25, kart_number=18, team_name="LOS EMILIOS",
                driver_name="EMILIO", pit_in_race_time_ms=4_800_000)

    real = [e for e in m.fifo if e.get("kartNumber") == 18]
    assert len(real) == 2
    pit_times = sorted(e["pitInRaceTimeMs"] for e in real)
    assert pit_times == [3_600_000, 4_800_000], (
        f"Cada entry debe persistir su propio pitInRaceTimeMs, "
        f"got {pit_times}")


def test_add_entry_default_pit_in_race_time_ms_zero():
    """Sin pasar el kwarg, el campo está presente con valor 0 (no
    None) para evitar comprobaciones extra en el cliente."""
    m = FifoManager(queue_size=10, box_lines=2)
    m.add_entry(tier_score=50, kart_number=7)
    real = [e for e in m.fifo if e.get("kartNumber") == 7]
    assert len(real) == 1
    assert real[0]["pitInRaceTimeMs"] == 0


def test_manual_assign_preserves_pit_in_race_time_ms():
    """Cuando una entry del pre_queue se commitea via `assign_manually`,
    debe preservar `pitInRaceTimeMs`. El bug original popeaba
    `enqueuedAt` en `_commit_entry`; nos aseguramos de que la nueva
    columna NO se pierde en la misma transición.
    """
    m = FifoManager(queue_size=10, box_lines=2)
    m.manual_mode = True
    m.add_entry(tier_score=80, kart_number=42, pit_in_race_time_ms=1_234_567)
    # Antes del assign está en pre_queue con el campo.
    assert m.pre_queue[0]["pitInRaceTimeMs"] == 1_234_567
    ok = m.assign_manually(42, line=0)
    assert ok
    real = [e for e in m.fifo if e.get("kartNumber") == 42]
    assert len(real) == 1
    assert real[0]["pitInRaceTimeMs"] == 1_234_567
