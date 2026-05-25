"""Integration tests del endpoint `POST /api/race/fifo/assign`.

Cubre solo los códigos de respuesta + plumbing — la lógica real de
asignación está en `FifoManager` y se cubre en
`tests/engine/test_fifo_manual.py`. Aquí verificamos:

  - 404 cuando el user no tiene UserSession activa en el registry.
  - 409 (manual_off) cuando manual_mode no está activo.
  - 409 (gone) cuando el kart no está en pre-cola.
  - 200 cuando todo va bien.

El registry se inyecta vía `app.state.registry` con un stub mínimo
que devuelve un `UserSession` real (su FifoManager) — así
ejercitamos el código de producción sin tener que arrancar el
ciclo completo del backend (CircuitHub + WS + loops).
"""
from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.api.auth_routes import get_current_user
from app.engine.registry import UserSession
from app.models.schemas import User


class _FakeRegistry:
    """Stub mínimo del SessionRegistry — solo el método `.get(user_id)`."""

    def __init__(self) -> None:
        self._sessions: dict[int, UserSession] = {}

    def get(self, user_id: int) -> UserSession | None:
        return self._sessions.get(user_id)

    def set(self, user_id: int, session: UserSession) -> None:
        self._sessions[user_id] = session


@pytest_asyncio.fixture
async def client():
    """AsyncClient con auth bypass + registry stub instalado en app.state.

    Importamos `main` aquí (no en el módulo) para evitar arrancar el
    backend en otros tests que no lo necesitan.
    """
    from app.main import app

    fake_user = User(
        id=42, username="tester", password_hash="x",
        is_admin=False, is_internal=False,
    )
    fake_registry = _FakeRegistry()
    # Inyectamos el registry en app.state. Si el backend real lo
    # ha puesto en `lifespan`, lo sobreescribimos para los tests.
    app.state.registry = fake_registry
    app.dependency_overrides[get_current_user] = lambda: fake_user

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac, fake_user, fake_registry

    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_404_when_no_session(client):
    ac, _user, _reg = client
    r = await ac.post("/api/race/fifo/assign", json={"kart_number": 7, "line": 0})
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_409_manual_off(client):
    ac, user, reg = client
    sess = UserSession(user_id=user.id, circuit_id=1)
    # manual_mode default False → debe rechazar.
    reg.set(user.id, sess)
    r = await ac.post("/api/race/fifo/assign", json={"kart_number": 7, "line": 0})
    assert r.status_code == 409
    # FastAPI envuelve el `detail` dict; comprobamos el code.
    data = r.json()
    assert data["detail"]["code"] == "manual_off"


@pytest.mark.asyncio
async def test_409_kart_gone(client):
    ac, user, reg = client
    sess = UserSession(user_id=user.id, circuit_id=1)
    sess.fifo.manual_mode = True
    reg.set(user.id, sess)
    # No hay pit-in previo → no hay nada en pre_queue.
    r = await ac.post("/api/race/fifo/assign", json={"kart_number": 99, "line": 0})
    assert r.status_code == 409
    assert r.json()["detail"]["code"] == "gone"


@pytest.mark.asyncio
async def test_200_assign_ok(client):
    ac, user, reg = client
    sess = UserSession(user_id=user.id, circuit_id=1)
    sess.fifo.manual_mode = True
    # Pit-in fabricado: meter kart 5 en la pre-cola directamente.
    sess.fifo.add_entry(tier_score=50, kart_number=5, team_name="T")
    assert len(sess.fifo.pre_queue) == 1
    reg.set(user.id, sess)

    r = await ac.post("/api/race/fifo/assign", json={"kart_number": 5, "line": 1})
    assert r.status_code == 200, r.text
    assert r.json() == {"ok": True}
    # Post-assign: pre_queue vacío, fifo tiene la entry con line=1.
    assert sess.fifo.pre_queue == []
    real = [e for e in sess.fifo.fifo if e.get("kartNumber") == 5]
    assert len(real) == 1
    assert real[0]["line"] == 1


@pytest.mark.asyncio
async def test_409_invalid_line(client):
    ac, user, reg = client
    sess = UserSession(user_id=user.id, circuit_id=1)
    sess.fifo.manual_mode = True
    sess.fifo.add_entry(tier_score=50, kart_number=5)
    reg.set(user.id, sess)

    # box_lines default = 2 → line=5 inválido.
    r = await ac.post("/api/race/fifo/assign", json={"kart_number": 5, "line": 5})
    assert r.status_code == 409
    assert r.json()["detail"]["code"] == "gone"
