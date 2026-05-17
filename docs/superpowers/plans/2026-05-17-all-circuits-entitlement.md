# All-Circuits Entitlement + Cancel-Revoke Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cross-circuit subscriptions get one date-windowed `UserAllCircuitAccess` grant that resolves to every `for_sale ∪ beta` circuit at access time (new circuits auto-included), replacing the N-row `_grant_all_circuits_access`; fix the bug where cancelling a cross-circuit sub revokes nothing.

**Architecture:** New additive table `UserAllCircuitAccess` (auto-created by `Base.metadata.create_all`, no migration). Two resolver helpers in `auth_routes.py` (sync platform gate extended; new async per-circuit + any-access helpers). Every per-circuit / any-access enforcement point gains an "OR active all-grant (∩ for_sale∪beta)" branch. Grant created/extended on cross-circuit purchase & renewal, expired on cancel. Per-circuit access, trial, frontend, and native apps unchanged.

**Tech Stack:** Python 3.11, FastAPI, SQLAlchemy async, SQLite, pytest + pytest-asyncio. Test harness: in-memory `sqlite+aiosqlite:///:memory:` + `Base.metadata.create_all` + direct handler calls + `unittest.mock` for the Stripe SDK (mirror `backend/tests/test_email_verification_flow.py`). Runner: `cd backend && .venv/bin/python -m pytest`.

**Cross-cutting context (verified verbatim; match on symbol, line numbers drift):**
- `schemas.py:1-4` imports `Column, Integer, String, ... DateTime, ForeignKey` and `from app.models.database import Base`. `User` (`:7-50`) has `circuit_access = relationship("UserCircuitAccess", back_populates="user", cascade="all, delete-orphan")`. `Circuit` (`:53-149`) has `for_sale`/`is_beta` Booleans. `UserCircuitAccess` (`:152-162`).
- `init_db()` (`database.py:~55`) calls `await conn.run_sync(Base.metadata.create_all)` unconditionally → any new `Base` subclass auto-creates. No ALTER needed for a new table.
- Test `db` fixture pattern (`test_email_verification_flow.py`): stub `resend` before app imports; `engine=create_async_engine("sqlite+aiosqlite:///:memory:")`; `await conn.run_sync(Base.metadata.create_all)`; `Session=async_sessionmaker(engine, expire_on_commit=False)`; `async with Session() as s: yield s`. Tests call handler functions directly with `s`.
- Stripe webhook handler signatures: `_handle_checkout_completed(session_data: dict, db, s)`, `_handle_invoice_paid(invoice_data: dict, db)`, `_handle_subscription_updated(sub_data: dict, db)`, `_handle_subscription_deleted(sub_data: dict, db)`.

---

### Task 1: `UserAllCircuitAccess` model + `User` relationship

**Files:** Modify `backend/app/models/schemas.py`; Create `backend/tests/test_all_circuit_access_model.py`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_all_circuit_access_model.py`:

```python
"""TDD — UserAllCircuitAccess model auto-creates and relates to User."""
from __future__ import annotations

import sys, types
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

if "resend" not in sys.modules:
    _r = types.ModuleType("resend"); _r.api_key = None; _r.Emails = MagicMock()
    sys.modules["resend"] = _r

from app.models.schemas import Base, User, UserAllCircuitAccess  # noqa: E402


@pytest_asyncio.fixture
async def db():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as s:
        yield s
    await engine.dispose()


async def test_all_circuit_access_table_and_relationship(db):
    now = datetime.now(timezone.utc)
    u = User(username="acu", email="acu@x.com", password_hash="x", is_admin=False)
    db.add(u)
    await db.flush()
    db.add(UserAllCircuitAccess(
        user_id=u.id, valid_from=now, valid_until=now + timedelta(days=30),
        stripe_subscription_id="sub_test_1",
    ))
    await db.commit()

    rows = (await db.execute(
        select(UserAllCircuitAccess).where(UserAllCircuitAccess.user_id == u.id)
    )).scalars().all()
    assert len(rows) == 1
    assert rows[0].stripe_subscription_id == "sub_test_1"

    reloaded = (await db.execute(
        select(User).where(User.id == u.id)
    )).scalar_one()
    await db.refresh(reloaded, ["all_circuit_access"])
    assert len(reloaded.all_circuit_access) == 1
```

- [ ] **Step 2: Run to verify it FAILS**

Run: `cd /Users/jizcue/boxboxnow-v2/backend && .venv/bin/python -m pytest tests/test_all_circuit_access_model.py -v`
Expected: `ImportError: cannot import name 'UserAllCircuitAccess'`.

- [ ] **Step 3: Add the model + relationship**

In `backend/app/models/schemas.py`, immediately after the `class UserCircuitAccess` block (ends with `circuit = relationship("Circuit", back_populates="user_access")`), add:

```python


class UserAllCircuitAccess(Base):
    """A single date-windowed grant meaning "all circuits".

    Created for subscriptions sold cross-circuit (ProductTabConfig
    per_circuit=False) instead of one UserCircuitAccess row per circuit.
    Resolves at access time to every circuit with for_sale OR is_beta —
    so newly added circuits are covered automatically and removed ones
    drop off, with no backfill scripts. Linked to its Stripe sub so
    renewals extend it and cancellation expires it.
    """
    __tablename__ = "user_all_circuit_access"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    valid_from = Column(DateTime, nullable=False)
    valid_until = Column(DateTime, nullable=False)
    stripe_subscription_id = Column(String(255), nullable=True, index=True)

    user = relationship("User", back_populates="all_circuit_access")
```

In `class User`, immediately after the line `circuit_access = relationship("UserCircuitAccess", back_populates="user", cascade="all, delete-orphan")`, add:

```python
    all_circuit_access = relationship("UserAllCircuitAccess", back_populates="user", cascade="all, delete-orphan")
```

- [ ] **Step 4: Run to verify it PASSES**

Run: `cd /Users/jizcue/boxboxnow-v2/backend && .venv/bin/python -m pytest tests/test_all_circuit_access_model.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/jizcue/boxboxnow-v2
git add backend/app/models/schemas.py backend/tests/test_all_circuit_access_model.py
git commit -m "$(cat <<'EOF'
feat(entitlements): add UserAllCircuitAccess model

Additive table (auto-created via create_all) for the "all circuits"
grant; wires User.all_circuit_access relationship.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Resolver helpers + extend platform gate + eager-load

**Files:** Modify `backend/app/api/auth_routes.py`; Create `backend/tests/test_circuit_access_resolver.py`.

Context — current `user_has_active_circuit_access` (`auth_routes.py:740-773`) and the single eager-load site (`auth_routes.py:460-470`, inside `get_current_user`):

```python
    result = await db.execute(
        select(User).where(User.id == user_id).options(
            selectinload(User.tab_access),
            selectinload(User.subscriptions),
            selectinload(User.circuit_access),
        )
    )
```

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_circuit_access_resolver.py`:

```python
"""TDD — circuit-access resolver: per-circuit row OR active all-grant
covering a for_sale/beta circuit at access time."""
from __future__ import annotations

import sys, types
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

if "resend" not in sys.modules:
    _r = types.ModuleType("resend"); _r.api_key = None; _r.Emails = MagicMock()
    sys.modules["resend"] = _r

from app.api.auth_routes import (  # noqa: E402
    user_has_circuit_access,
    user_has_any_active_circuit_access,
)
from app.models.schemas import Base, User, Circuit, UserCircuitAccess, UserAllCircuitAccess  # noqa: E402


@pytest_asyncio.fixture
async def db():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as s:
        yield s
    await engine.dispose()


async def _mk(db, *, for_sale=True, is_beta=False):
    c = Circuit(name=f"C{for_sale}{is_beta}", ws_port=9000, for_sale=for_sale, is_beta=is_beta)
    u = User(username=f"u{datetime.now().timestamp()}", password_hash="x", is_admin=False)
    db.add_all([c, u]); await db.flush()
    return u, c


async def test_per_circuit_row_grants(db):
    u, c = await _mk(db)
    now = datetime.now(timezone.utc)
    db.add(UserCircuitAccess(user_id=u.id, circuit_id=c.id,
                             valid_from=now - timedelta(hours=1),
                             valid_until=now + timedelta(days=1)))
    await db.commit()
    assert await user_has_circuit_access(db, u.id, c.id) is True


async def test_all_grant_covers_for_sale(db):
    u, c = await _mk(db, for_sale=True, is_beta=False)
    now = datetime.now(timezone.utc)
    db.add(UserAllCircuitAccess(user_id=u.id, valid_from=now - timedelta(hours=1),
                                valid_until=now + timedelta(days=1)))
    await db.commit()
    assert await user_has_circuit_access(db, u.id, c.id) is True


async def test_all_grant_covers_beta(db):
    u, c = await _mk(db, for_sale=False, is_beta=True)
    now = datetime.now(timezone.utc)
    db.add(UserAllCircuitAccess(user_id=u.id, valid_from=now - timedelta(hours=1),
                                valid_until=now + timedelta(days=1)))
    await db.commit()
    assert await user_has_circuit_access(db, u.id, c.id) is True


async def test_all_grant_excludes_offsale_nonbeta(db):
    u, c = await _mk(db, for_sale=False, is_beta=False)
    now = datetime.now(timezone.utc)
    db.add(UserAllCircuitAccess(user_id=u.id, valid_from=now - timedelta(hours=1),
                                valid_until=now + timedelta(days=1)))
    await db.commit()
    assert await user_has_circuit_access(db, u.id, c.id) is False


async def test_explicit_row_survives_offsale(db):
    u, c = await _mk(db, for_sale=False, is_beta=False)
    now = datetime.now(timezone.utc)
    db.add(UserCircuitAccess(user_id=u.id, circuit_id=c.id,
                             valid_from=now - timedelta(hours=1),
                             valid_until=now + timedelta(days=1)))
    await db.commit()
    assert await user_has_circuit_access(db, u.id, c.id) is True


async def test_expired_all_grant_does_not_cover(db):
    u, c = await _mk(db, for_sale=True)
    now = datetime.now(timezone.utc)
    db.add(UserAllCircuitAccess(user_id=u.id, valid_from=now - timedelta(days=2),
                                valid_until=now - timedelta(days=1)))
    await db.commit()
    assert await user_has_circuit_access(db, u.id, c.id) is False


async def test_any_active_via_all_grant(db):
    u, c = await _mk(db, for_sale=True)
    now = datetime.now(timezone.utc)
    db.add(UserAllCircuitAccess(user_id=u.id, valid_from=now - timedelta(hours=1),
                                valid_until=now + timedelta(days=1)))
    await db.commit()
    assert await user_has_any_active_circuit_access(db, u.id) is True


async def test_any_active_false_when_nothing(db):
    u, c = await _mk(db, for_sale=True)
    await db.commit()
    assert await user_has_any_active_circuit_access(db, u.id) is False
```

- [ ] **Step 2: Run to verify it FAILS**

Run: `cd /Users/jizcue/boxboxnow-v2/backend && .venv/bin/python -m pytest tests/test_circuit_access_resolver.py -v`
Expected: `ImportError` (`user_has_circuit_access` / `user_has_any_active_circuit_access` don't exist).

- [ ] **Step 3: Add the two async resolvers**

In `backend/app/api/auth_routes.py`, immediately AFTER the `user_has_active_circuit_access` function (after its final `return False`) add:

```python


async def user_has_circuit_access(db, user_id: int, circuit_id: int) -> bool:
    """Async: does the user currently have access to THIS circuit?

    True iff EITHER a UserCircuitAccess row for (user_id, circuit_id) is
    currently valid, OR a UserAllCircuitAccess row for the user is
    currently valid AND the circuit currently has for_sale OR is_beta.
    An explicit per-circuit row always stands even if the circuit later
    goes off-sale (existing behaviour preserved). Naive SQLite datetimes
    are treated as UTC.
    """
    from app.models.schemas import (
        UserCircuitAccess as _UCA,
        UserAllCircuitAccess as _UACA,
        Circuit as _C,
    )
    now = datetime.now(timezone.utc)

    direct = await db.execute(
        select(_UCA.id).where(
            _UCA.user_id == user_id,
            _UCA.circuit_id == circuit_id,
            _UCA.valid_from <= now,
            _UCA.valid_until > now,
        )
    )
    if direct.scalar_one_or_none() is not None:
        return True

    all_grant = await db.execute(
        select(_UACA.id).where(
            _UACA.user_id == user_id,
            _UACA.valid_from <= now,
            _UACA.valid_until > now,
        )
    )
    if all_grant.scalar_one_or_none() is None:
        return False

    cflags = await db.execute(
        select(_C.for_sale, _C.is_beta).where(_C.id == circuit_id)
    )
    row = cflags.first()
    if row is None:
        return False
    return bool(row[0]) or bool(row[1])


async def user_has_any_active_circuit_access(db, user_id: int) -> bool:
    """Async equivalent of user_has_active_circuit_access for code paths
    that have a db session but not an eager-loaded User (WS handshakes):
    True iff any currently-valid UserCircuitAccess OR UserAllCircuitAccess
    row exists for the user. Naive SQLite datetimes treated as UTC.
    """
    from app.models.schemas import (
        UserCircuitAccess as _UCA,
        UserAllCircuitAccess as _UACA,
    )
    now = datetime.now(timezone.utc)
    direct = await db.execute(
        select(_UCA.id).where(
            _UCA.user_id == user_id,
            _UCA.valid_from <= now,
            _UCA.valid_until > now,
        )
    )
    if direct.scalar_one_or_none() is not None:
        return True
    allg = await db.execute(
        select(_UACA.id).where(
            _UACA.user_id == user_id,
            _UACA.valid_from <= now,
            _UACA.valid_until > now,
        )
    )
    return allg.scalar_one_or_none() is not None
```

- [ ] **Step 4: Extend the sync platform gate**

In `user_has_active_circuit_access`, the function currently ends:

```python
    for row in (user.circuit_access or []):
        vf = row.valid_from
        vu = row.valid_until
        if vf and vf.tzinfo is None:
            vf = vf.replace(tzinfo=timezone.utc)
        if vu and vu.tzinfo is None:
            vu = vu.replace(tzinfo=timezone.utc)
        if (vf is None or vf <= now) and (vu is None or vu > now):
            return True
    return False
```

Replace ONLY the final `return False` with:

```python
    if 'all_circuit_access' in state.dict:
        for row in (user.all_circuit_access or []):
            vf = row.valid_from
            vu = row.valid_until
            if vf and vf.tzinfo is None:
                vf = vf.replace(tzinfo=timezone.utc)
            if vu and vu.tzinfo is None:
                vu = vu.replace(tzinfo=timezone.utc)
            if (vf is None or vf <= now) and (vu is None or vu > now):
                return True
    return False
```

(`state` is the `sa_inspect(user)` already computed earlier in the function; reuse it. The guard skips the all-grant scan if that relationship wasn't eager-loaded, exactly mirroring the `circuit_access` safety.)

- [ ] **Step 5: Eager-load `all_circuit_access` at the single load site**

In `auth_routes.py`, the only `selectinload(User.circuit_access)` (inside `get_current_user`'s user query) currently is:

```python
            selectinload(User.subscriptions),
            selectinload(User.circuit_access),
        )
```

Change to:

```python
            selectinload(User.subscriptions),
            selectinload(User.circuit_access),
            selectinload(User.all_circuit_access),
        )
```

(This is the single site — every request flows through `get_current_user`, so both relationships are always co-loaded; the Step-4 guard then always sees `all_circuit_access` in `state.dict`.)

- [ ] **Step 6: Run to verify PASS**

Run: `cd /Users/jizcue/boxboxnow-v2/backend && .venv/bin/python -m pytest tests/test_circuit_access_resolver.py -v`
Expected: all 8 PASS.

- [ ] **Step 7: Commit**

```bash
cd /Users/jizcue/boxboxnow-v2
git add backend/app/api/auth_routes.py backend/tests/test_circuit_access_resolver.py
git commit -m "$(cat <<'EOF'
feat(entitlements): circuit-access resolvers + extend platform gate

user_has_circuit_access (per-circuit OR all-grant∩for_sale/beta),
user_has_any_active_circuit_access (WS), and all-grant scan added to the
sync user_has_active_circuit_access; eager-load all_circuit_access.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `_grant_all_circuits` + replace 4 call sites + delete legacy

**Files:** Modify `backend/app/api/stripe_routes.py`; Create `backend/tests/test_grant_all_circuits.py`.

Context — `_calc_valid_until` (`stripe_routes.py:57-70`) and the date logic of `_grant_circuit_access` (`:81-94`: event window → `[event_start,event_end]`; `period_end` → `valid_from=now, valid_until=period_end+3d`; else `valid_until=_calc_valid_until(config, now)`). Legacy `_grant_all_circuits_access` is `:132-149`. The four call sites are in `_handle_checkout_completed` subscription mode (`:675-678`), payment mode (`:761-771`), `_handle_invoice_paid` (`:897-900`), `_handle_subscription_updated` (`:948-951`) — each an `elif not _config_is_per_circuit(config):` branch (verbatim blocks in the spec/extraction).

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_grant_all_circuits.py`:

```python
"""TDD — _grant_all_circuits upserts a single all-grant per (user, sub)."""
from __future__ import annotations

import sys, types
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

if "resend" not in sys.modules:
    _r = types.ModuleType("resend"); _r.api_key = None; _r.Emails = MagicMock()
    sys.modules["resend"] = _r

from app.api.stripe_routes import _grant_all_circuits  # noqa: E402
from app.models.schemas import Base, User, UserAllCircuitAccess  # noqa: E402


@pytest_asyncio.fixture
async def db():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as s:
        yield s
    await engine.dispose()


async def test_creates_grant_with_period_grace(db):
    u = User(username="g1", password_hash="x", is_admin=False)
    db.add(u); await db.flush()
    pe = datetime.now(timezone.utc) + timedelta(days=30)
    await _grant_all_circuits(db, u.id, stripe_subscription_id="sub_A", period_end=pe)
    await db.commit()
    rows = (await db.execute(select(UserAllCircuitAccess).where(
        UserAllCircuitAccess.user_id == u.id))).scalars().all()
    assert len(rows) == 1
    vu = rows[0].valid_until
    if vu.tzinfo is None:
        vu = vu.replace(tzinfo=timezone.utc)
    assert vu >= pe + timedelta(days=2)  # +3d grace, allow clock slack
    assert rows[0].stripe_subscription_id == "sub_A"


async def test_renewal_extends_same_grant(db):
    u = User(username="g2", password_hash="x", is_admin=False)
    db.add(u); await db.flush()
    pe1 = datetime.now(timezone.utc) + timedelta(days=30)
    await _grant_all_circuits(db, u.id, stripe_subscription_id="sub_B", period_end=pe1)
    await db.commit()
    pe2 = datetime.now(timezone.utc) + timedelta(days=60)
    await _grant_all_circuits(db, u.id, stripe_subscription_id="sub_B", period_end=pe2)
    await db.commit()
    rows = (await db.execute(select(UserAllCircuitAccess).where(
        UserAllCircuitAccess.user_id == u.id))).scalars().all()
    assert len(rows) == 1  # extended, not duplicated
    vu = rows[0].valid_until
    if vu.tzinfo is None:
        vu = vu.replace(tzinfo=timezone.utc)
    assert vu >= pe2 + timedelta(days=2)
```

- [ ] **Step 2: Run to verify it FAILS**

Run: `cd /Users/jizcue/boxboxnow-v2/backend && .venv/bin/python -m pytest tests/test_grant_all_circuits.py -v`
Expected: `ImportError: cannot import name '_grant_all_circuits'`.

- [ ] **Step 3: Add `_grant_all_circuits` and delete `_grant_all_circuits_access`**

In `backend/app/api/stripe_routes.py`, REPLACE the entire `_grant_all_circuits_access` function (the block from `async def _grant_all_circuits_access(` through its final `)` of the for-loop body, `:132-149`) with:

```python
async def _grant_all_circuits(
    db: AsyncSession, user_id: int, *,
    stripe_subscription_id: str | None,
    config: ProductTabConfig | None = None,
    period_end: datetime | None = None,
    event_start: datetime | None = None,
    event_end: datetime | None = None,
):
    """Upsert ONE "all circuits" grant for a cross-circuit subscription.

    Date window mirrors _grant_circuit_access exactly (event window; or
    period_end + 3d grace; or _calc_valid_until). Upsert key is
    (user_id, stripe_subscription_id): an existing grant for that sub is
    extended (valid_until = max, valid_from lowered if earlier); else a
    new row is inserted. Resolution to concrete circuits (for_sale ∪
    beta, at access time) happens in user_has_circuit_access — this only
    manages the date window.
    """
    now = datetime.now(timezone.utc)
    if event_start and event_end:
        valid_from = event_start
        valid_until = event_end
    elif period_end:
        valid_from = now
        valid_until = period_end + timedelta(days=3)
    else:
        valid_from = now
        valid_until = _calc_valid_until(config, now)

    result = await db.execute(
        select(UserAllCircuitAccess).where(
            UserAllCircuitAccess.user_id == user_id,
            UserAllCircuitAccess.stripe_subscription_id == stripe_subscription_id,
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        ex_until = existing.valid_until
        if ex_until and ex_until.tzinfo is None:
            ex_until = ex_until.replace(tzinfo=timezone.utc)
        existing.valid_until = max(ex_until, valid_until) if ex_until else valid_until
        ex_from = existing.valid_from
        if ex_from and ex_from.tzinfo is None:
            ex_from = ex_from.replace(tzinfo=timezone.utc)
        if ex_from and ex_from > valid_from:
            existing.valid_from = valid_from
    else:
        db.add(UserAllCircuitAccess(
            user_id=user_id,
            valid_from=valid_from,
            valid_until=valid_until,
            stripe_subscription_id=stripe_subscription_id,
        ))
```

Ensure `UserAllCircuitAccess` is imported in `stripe_routes.py`: find the existing `from app.models.schemas import (...)` block and add `UserAllCircuitAccess` to it (it already imports `UserCircuitAccess`, `Circuit`, `Subscription`, `ProductTabConfig`, etc. — add the name to that same import).

- [ ] **Step 4: Replace the 4 call sites**

Each site currently calls `_grant_all_circuits_access(...)`. The Stripe subscription id is available at each site as follows — replace exactly:

**Site 1 — `_handle_checkout_completed` subscription mode.** Current:
```python
            elif not _config_is_per_circuit(config):
                await _grant_all_circuits_access(
                    db, user_id, config=config, period_end=period_end
                )
```
Replace with (this branch already has `sub_id` from `session_data.get("subscription")` earlier in the same block; it is the variable used to create the `Subscription` row):
```python
            elif not _config_is_per_circuit(config):
                await _grant_all_circuits(
                    db, user_id, stripe_subscription_id=sub_id,
                    config=config, period_end=period_end,
                )
```

**Site 2 — `_handle_checkout_completed` payment mode (one-time/event).** Current:
```python
        elif not _config_is_per_circuit(config):
            await _grant_all_circuits_access(
                db, user_id, config=config,
                event_start=event_start, event_end=event_end,
            )
```
Replace with (payment mode has no Stripe subscription → `stripe_subscription_id=None`):
```python
        elif not _config_is_per_circuit(config):
            await _grant_all_circuits(
                db, user_id, stripe_subscription_id=None,
                config=config, event_start=event_start, event_end=event_end,
            )
```

**Site 3 — `_handle_invoice_paid`.** Current:
```python
    elif sub.current_period_end and not _config_is_per_circuit(config):
        await _grant_all_circuits_access(
            db, sub.user_id, config=config,
            period_end=sub.current_period_end,
        )
```
Replace with (`sub` is the local `Subscription`; use its Stripe id):
```python
    elif sub.current_period_end and not _config_is_per_circuit(config):
        await _grant_all_circuits(
            db, sub.user_id, stripe_subscription_id=sub.stripe_subscription_id,
            config=config, period_end=sub.current_period_end,
        )
```

**Site 4 — `_handle_subscription_updated`.** Current:
```python
            elif not _config_is_per_circuit(config):
                await _grant_all_circuits_access(
                    db, sub.user_id, config=config,
                    period_end=sub.current_period_end,
                )
```
Replace with:
```python
            elif not _config_is_per_circuit(config):
                await _grant_all_circuits(
                    db, sub.user_id, stripe_subscription_id=sub.stripe_subscription_id,
                    config=config, period_end=sub.current_period_end,
                )
```

Then run `grep -rn "_grant_all_circuits_access" backend/` and confirm ZERO matches (function and all callers gone). If any remain, replace them following the same pattern (pass the in-scope Stripe subscription id, or `None` for non-subscription paths) and note it.

- [ ] **Step 5: Run to verify PASS + targeted regression**

Run: `cd /Users/jizcue/boxboxnow-v2/backend && .venv/bin/python -m pytest tests/test_grant_all_circuits.py -v`
Expected: 2 PASS.
Run: `cd /Users/jizcue/boxboxnow-v2/backend && grep -rn "_grant_all_circuits_access" backend/`
Expected: no output (0 matches).

- [ ] **Step 6: Commit**

```bash
cd /Users/jizcue/boxboxnow-v2
git add backend/app/api/stripe_routes.py backend/tests/test_grant_all_circuits.py
git commit -m "$(cat <<'EOF'
feat(entitlements): _grant_all_circuits upsert; drop N-row legacy

Cross-circuit purchases/renewals now upsert one UserAllCircuitAccess
grant keyed by (user, stripe_subscription_id) instead of writing one
UserCircuitAccess row per circuit. Deletes the unused, no-for_sale-
filter _grant_all_circuits_access and rewires its 4 call sites.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Cancel-revoke fix in `_handle_subscription_deleted`

**Files:** Modify `backend/app/api/stripe_routes.py`; Create `backend/tests/test_cancel_revokes_all_grant.py`.

Context — `_handle_subscription_deleted` (`stripe_routes.py:957-991`) sets `sub.status="canceled"`, computes `revoked_circuit_ids` from metadata/`sub.circuit_id` (empty for cross-circuit → nothing revoked = the bug), expires matching `UserCircuitAccess` rows, then `await db.commit()`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_cancel_revokes_all_grant.py`:

```python
"""TDD — cancelling a cross-circuit sub now expires its all-grant
(regression for the silent no-op bug)."""
from __future__ import annotations

import sys, types
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

if "resend" not in sys.modules:
    _r = types.ModuleType("resend"); _r.api_key = None; _r.Emails = MagicMock()
    sys.modules["resend"] = _r

from app.api.stripe_routes import _handle_subscription_deleted  # noqa: E402
from app.models.schemas import (  # noqa: E402
    Base, User, Subscription, UserAllCircuitAccess, UserCircuitAccess, Circuit,
)


@pytest_asyncio.fixture
async def db():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as s:
        yield s
    await engine.dispose()


async def test_cancel_cross_circuit_expires_all_grant(db):
    now = datetime.now(timezone.utc)
    u = User(username="cx", password_hash="x", is_admin=False)
    db.add(u); await db.flush()
    db.add(Subscription(
        user_id=u.id, stripe_subscription_id="sub_X", plan_type="endurance",
        status="active", circuit_id=None,
        current_period_start=now, current_period_end=now + timedelta(days=30),
    ))
    db.add(UserAllCircuitAccess(
        user_id=u.id, stripe_subscription_id="sub_X",
        valid_from=now - timedelta(days=1), valid_until=now + timedelta(days=30),
    ))
    await db.commit()

    await _handle_subscription_deleted({"id": "sub_X", "metadata": {}}, db)

    row = (await db.execute(select(UserAllCircuitAccess).where(
        UserAllCircuitAccess.user_id == u.id))).scalar_one()
    vu = row.valid_until
    if vu.tzinfo is None:
        vu = vu.replace(tzinfo=timezone.utc)
    assert vu <= datetime.now(timezone.utc) + timedelta(seconds=5)


async def test_cancel_per_circuit_unaffected_for_all_grant(db):
    """A per-circuit sub cancel must NOT touch (non-existent) all-grants
    and must still expire the per-circuit row as before."""
    now = datetime.now(timezone.utc)
    u = User(username="pc", password_hash="x", is_admin=False)
    c = Circuit(name="PC", ws_port=9001, for_sale=True)
    db.add_all([u, c]); await db.flush()
    db.add(Subscription(
        user_id=u.id, stripe_subscription_id="sub_Y", plan_type="circuit",
        status="active", circuit_id=c.id,
        current_period_start=now, current_period_end=now + timedelta(days=30),
    ))
    db.add(UserCircuitAccess(
        user_id=u.id, circuit_id=c.id,
        valid_from=now - timedelta(days=1), valid_until=now + timedelta(days=30),
    ))
    await db.commit()

    await _handle_subscription_deleted({"id": "sub_Y", "metadata": {}}, db)

    uca = (await db.execute(select(UserCircuitAccess).where(
        UserCircuitAccess.user_id == u.id))).scalar_one()
    vu = uca.valid_until
    if vu.tzinfo is None:
        vu = vu.replace(tzinfo=timezone.utc)
    assert vu <= datetime.now(timezone.utc) + timedelta(seconds=5)
    # No all-grant rows exist / were created
    assert (await db.execute(select(UserAllCircuitAccess))).scalars().all() == []
```

- [ ] **Step 2: Run to verify it FAILS**

Run: `cd /Users/jizcue/boxboxnow-v2/backend && .venv/bin/python -m pytest tests/test_cancel_revokes_all_grant.py -v`
Expected: `test_cancel_cross_circuit_expires_all_grant` FAILS (all-grant `valid_until` still 30d out — bug present). `test_cancel_per_circuit_unaffected_for_all_grant` PASSES (current behaviour already expires the per-circuit row).

- [ ] **Step 3: Add all-grant expiry to `_handle_subscription_deleted`**

In `_handle_subscription_deleted`, the function currently ends:

```python
        if revoked_circuit_ids:
            now = datetime.now(timezone.utc)
            access_rows = await db.execute(
                select(UserCircuitAccess).where(
                    UserCircuitAccess.user_id == sub.user_id,
                    UserCircuitAccess.circuit_id.in_(revoked_circuit_ids),
                )
            )
            for access in access_rows.scalars().all():
                access.valid_until = now

        await db.commit()
        logger.info(
            f"Subscription deleted: sub={sub_id} user={sub.user_id} "
            f"circuits={revoked_circuit_ids}"
        )
```

Insert, immediately BEFORE `await db.commit()`:

```python
        # Cross-circuit (all-circuits) subscriptions have no per-circuit
        # rows / metadata circuit_ids, so the block above revokes nothing.
        # Expire the all-grant tied to this Stripe sub instead.
        now2 = datetime.now(timezone.utc)
        all_rows = await db.execute(
            select(UserAllCircuitAccess).where(
                UserAllCircuitAccess.user_id == sub.user_id,
                UserAllCircuitAccess.stripe_subscription_id == sub_id,
            )
        )
        for grant in all_rows.scalars().all():
            grant.valid_until = now2
```

(`UserAllCircuitAccess` is already imported from Task 3. `sub_id` and `sub` are in scope. Use `now2` to avoid clashing with the `now` defined inside the `if revoked_circuit_ids:` block.)

- [ ] **Step 4: Run to verify PASS**

Run: `cd /Users/jizcue/boxboxnow-v2/backend && .venv/bin/python -m pytest tests/test_cancel_revokes_all_grant.py -v`
Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/jizcue/boxboxnow-v2
git add backend/app/api/stripe_routes.py backend/tests/test_cancel_revokes_all_grant.py
git commit -m "$(cat <<'EOF'
fix(entitlements): cancelling a cross-circuit sub now revokes access

_handle_subscription_deleted expired only per-circuit rows; cross-circuit
subs (no circuit_ids, circuit_id NULL) revoked nothing. Now also expire
the UserAllCircuitAccess grant tied to the cancelled Stripe sub.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Update HTTP per-circuit & list enforcement points

**Files:** Modify `backend/app/api/config_routes.py`, `backend/app/api/analytics_routes.py`, `backend/app/api/replay_routes.py`, `backend/app/api/stripe_routes.py`; Create `backend/tests/test_all_grant_enforcement.py`.

Each edit makes the check honor an active all-grant. `user_has_circuit_access(db, user_id, circuit_id)` (Task 2) is imported via `from app.api.auth_routes import user_has_circuit_access`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_all_grant_enforcement.py`:

```python
"""TDD — HTTP per-circuit & list endpoints honour an active all-grant."""
from __future__ import annotations

import sys, types
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest
import pytest_asyncio
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

if "resend" not in sys.modules:
    _r = types.ModuleType("resend"); _r.api_key = None; _r.Emails = MagicMock()
    sys.modules["resend"] = _r

from app.api.config_routes import _verify_circuit_access, list_my_circuits  # noqa: E402
from app.api.analytics_routes import _check_circuit_access, list_analytics_circuits  # noqa: E402
from app.api.stripe_routes import list_circuits_for_checkout  # noqa: E402
from app.models.schemas import (  # noqa: E402
    Base, User, Circuit, UserAllCircuitAccess,
)


@pytest_asyncio.fixture
async def db():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as s:
        yield s
    await engine.dispose()


async def _seed(db):
    now = datetime.now(timezone.utc)
    u = User(username="e", password_hash="x", is_admin=False)
    c_fs = Circuit(name="FS", ws_port=9002, for_sale=True, is_beta=False)
    c_beta = Circuit(name="BT", ws_port=9003, for_sale=False, is_beta=True)
    c_off = Circuit(name="OFF", ws_port=9004, for_sale=False, is_beta=False)
    db.add_all([u, c_fs, c_beta, c_off]); await db.flush()
    db.add(UserAllCircuitAccess(user_id=u.id,
                                valid_from=now - timedelta(hours=1),
                                valid_until=now + timedelta(days=30)))
    await db.commit()
    return u, c_fs, c_beta, c_off


async def test_config_verify_allows_all_grant_for_sale(db):
    u, c_fs, c_beta, c_off = await _seed(db)
    await _verify_circuit_access(u, c_fs.id, db)   # no raise
    await _verify_circuit_access(u, c_beta.id, db)  # beta also covered
    with pytest.raises(HTTPException):
        await _verify_circuit_access(u, c_off.id, db)  # off-sale non-beta


async def test_analytics_check_allows_all_grant(db):
    u, c_fs, c_beta, c_off = await _seed(db)
    await _check_circuit_access(u, c_fs.id, db)
    with pytest.raises(HTTPException):
        await _check_circuit_access(u, c_off.id, db)


async def test_config_list_includes_all_grant_set(db):
    u, c_fs, c_beta, c_off = await _seed(db)
    out = await list_my_circuits(user=u, db=db)
    names = {c.name for c in out}
    assert "FS" in names and "BT" in names
    assert "OFF" not in names


async def test_analytics_list_includes_all_grant_set(db):
    u, c_fs, c_beta, c_off = await _seed(db)
    out = await list_analytics_circuits(user=u, db=db)
    names = {c.name for c in out}
    assert "FS" in names and "BT" in names and "OFF" not in names


async def test_checkout_list_excludes_when_all_grant(db):
    u, c_fs, c_beta, c_off = await _seed(db)
    out = await list_circuits_for_checkout(user=u, db=db)
    # all for_sale circuits already covered by the all-grant → none to buy
    assert out == []
```

- [ ] **Step 2: Run to verify it FAILS**

Run: `cd /Users/jizcue/boxboxnow-v2/backend && .venv/bin/python -m pytest tests/test_all_grant_enforcement.py -v`
Expected: all FAIL (current code only checks `UserCircuitAccess`; an all-grant grants nothing yet).

- [ ] **Step 3: Update `config_routes._verify_circuit_access`**

Replace the body of `_verify_circuit_access` (`config_routes.py:380-394`) — currently:

```python
async def _verify_circuit_access(user: User, circuit_id: int, db: AsyncSession):
    if user.is_admin:
        return

    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(UserCircuitAccess).where(
            UserCircuitAccess.user_id == user.id,
            UserCircuitAccess.circuit_id == circuit_id,
            UserCircuitAccess.valid_from <= now,
            UserCircuitAccess.valid_until >= now,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(403, "No access to this circuit")
```

with:

```python
async def _verify_circuit_access(user: User, circuit_id: int, db: AsyncSession):
    if user.is_admin:
        return
    from app.api.auth_routes import user_has_circuit_access
    if not await user_has_circuit_access(db, user.id, circuit_id):
        raise HTTPException(403, "No access to this circuit")
```

- [ ] **Step 4: Update `analytics_routes._check_circuit_access`**

Replace the body of `_check_circuit_access` (`analytics_routes.py:35-49`) — currently the `UserCircuitAccess` query + `if not ...: raise` — with:

```python
async def _check_circuit_access(user: User, circuit_id: int, db: AsyncSession):
    """Raise 403 if non-admin user has no access to circuit."""
    if user.is_admin:
        return
    from app.api.auth_routes import user_has_circuit_access
    if not await user_has_circuit_access(db, user.id, circuit_id):
        raise HTTPException(403, "No access to this circuit")
```

- [ ] **Step 5: Update the two circuit-list endpoints (config + analytics)**

In `config_routes.py` `list_my_circuits` (`:29-48`), replace the non-admin query branch so an active all-grant yields every `for_sale OR is_beta` circuit unioned with explicit per-circuit rows. Replace:

```python
    result = await db.execute(
        select(Circuit)
        .join(UserCircuitAccess)
        .where(
            UserCircuitAccess.user_id == user.id,
            UserCircuitAccess.valid_from <= now,
            UserCircuitAccess.valid_until >= now,
        )
        .order_by(Circuit.name)
    )
    return result.scalars().all()
```

with:

```python
    from app.models.schemas import UserAllCircuitAccess
    has_all = (await db.execute(
        select(UserAllCircuitAccess.id).where(
            UserAllCircuitAccess.user_id == user.id,
            UserAllCircuitAccess.valid_from <= now,
            UserAllCircuitAccess.valid_until > now,
        )
    )).scalar_one_or_none() is not None

    if has_all:
        result = await db.execute(
            select(Circuit).where(
                (Circuit.for_sale == True) | (Circuit.is_beta == True)  # noqa: E712
            ).order_by(Circuit.name)
        )
        all_circuits = list(result.scalars().all())
        direct = await db.execute(
            select(Circuit).join(UserCircuitAccess).where(
                UserCircuitAccess.user_id == user.id,
                UserCircuitAccess.valid_from <= now,
                UserCircuitAccess.valid_until >= now,
            )
        )
        seen = {c.id for c in all_circuits}
        for c in direct.scalars().all():
            if c.id not in seen:
                all_circuits.append(c)
                seen.add(c.id)
        all_circuits.sort(key=lambda c: c.name)
        return all_circuits

    result = await db.execute(
        select(Circuit)
        .join(UserCircuitAccess)
        .where(
            UserCircuitAccess.user_id == user.id,
            UserCircuitAccess.valid_from <= now,
            UserCircuitAccess.valid_until >= now,
        )
        .order_by(Circuit.name)
    )
    return result.scalars().all()
```

In `analytics_routes.py` `list_analytics_circuits` (`:52-73`), the non-admin tail currently is:

```python
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(Circuit)
        .join(UserCircuitAccess, Circuit.id == UserCircuitAccess.circuit_id)
        .where(
            UserCircuitAccess.user_id == user.id,
            UserCircuitAccess.valid_from <= now,
            UserCircuitAccess.valid_until >= now,
        )
        .order_by(Circuit.name)
    )
    return result.scalars().all()
```

Replace it with:

```python
    now = datetime.now(timezone.utc)
    from app.models.schemas import UserAllCircuitAccess
    has_all = (await db.execute(
        select(UserAllCircuitAccess.id).where(
            UserAllCircuitAccess.user_id == user.id,
            UserAllCircuitAccess.valid_from <= now,
            UserAllCircuitAccess.valid_until > now,
        )
    )).scalar_one_or_none() is not None

    if has_all:
        result = await db.execute(
            select(Circuit).where(
                (Circuit.for_sale == True) | (Circuit.is_beta == True)  # noqa: E712
            ).order_by(Circuit.name)
        )
        all_circuits = list(result.scalars().all())
        direct = await db.execute(
            select(Circuit)
            .join(UserCircuitAccess, Circuit.id == UserCircuitAccess.circuit_id)
            .where(
                UserCircuitAccess.user_id == user.id,
                UserCircuitAccess.valid_from <= now,
                UserCircuitAccess.valid_until >= now,
            )
        )
        seen = {c.id for c in all_circuits}
        for c in direct.scalars().all():
            if c.id not in seen:
                all_circuits.append(c)
                seen.add(c.id)
        all_circuits.sort(key=lambda c: c.name)
        return all_circuits

    result = await db.execute(
        select(Circuit)
        .join(UserCircuitAccess, Circuit.id == UserCircuitAccess.circuit_id)
        .where(
            UserCircuitAccess.user_id == user.id,
            UserCircuitAccess.valid_from <= now,
            UserCircuitAccess.valid_until >= now,
        )
        .order_by(Circuit.name)
    )
    return result.scalars().all()
```

- [ ] **Step 6: Update `replay_routes` allowed-circuit set**

In `replay_routes.py` `list_recordings` (`:152-228`), the non-admin branch currently builds `allowed_circuit_ids` from `UserCircuitAccess` only:

```python
    allowed_circuit_ids = None
    if not user.is_admin:
        now = dt.now(tz.utc)
        result = await db.execute(
            select(UserCircuitAccess.circuit_id).where(
                UserCircuitAccess.user_id == user.id,
                UserCircuitAccess.valid_from <= now,
                UserCircuitAccess.valid_until >= now,
            )
        )
        allowed_circuit_ids = {row[0] for row in result.all()}
```

Replace with:

```python
    allowed_circuit_ids = None
    if not user.is_admin:
        from app.models.schemas import UserAllCircuitAccess
        from app.models.schemas import Circuit as _CM
        now = dt.now(tz.utc)
        result = await db.execute(
            select(UserCircuitAccess.circuit_id).where(
                UserCircuitAccess.user_id == user.id,
                UserCircuitAccess.valid_from <= now,
                UserCircuitAccess.valid_until >= now,
            )
        )
        allowed_circuit_ids = {row[0] for row in result.all()}
        has_all = (await db.execute(
            select(UserAllCircuitAccess.id).where(
                UserAllCircuitAccess.user_id == user.id,
                UserAllCircuitAccess.valid_from <= now,
                UserAllCircuitAccess.valid_until > now,
            )
        )).scalar_one_or_none() is not None
        if has_all:
            fs = await db.execute(
                select(_CM.id).where(
                    (_CM.for_sale == True) | (_CM.is_beta == True)  # noqa: E712
                )
            )
            allowed_circuit_ids |= {row[0] for row in fs.all()}
```

- [ ] **Step 7: Update checkout list + already-owned block (`stripe_routes.py`)**

In `list_circuits_for_checkout` (`:152-182`), after computing `active_circuit_ids`, treat an active all-grant as "owns everything for sale". Replace the final `result = ...; return [...]` tail:

```python
    result = await db.execute(select(Circuit).where(Circuit.for_sale == True).order_by(Circuit.name))
    return [
        {"id": c.id, "name": c.name, "is_beta": c.is_beta}
        for c in result.scalars().all()
        if c.id not in active_circuit_ids
    ]
```

with:

```python
    has_all = (await db.execute(
        select(UserAllCircuitAccess.id).where(
            UserAllCircuitAccess.user_id == user.id,
            UserAllCircuitAccess.valid_from <= now,
            UserAllCircuitAccess.valid_until > now,
        )
    )).scalar_one_or_none() is not None
    if has_all:
        return []

    result = await db.execute(select(Circuit).where(Circuit.for_sale == True).order_by(Circuit.name))
    return [
        {"id": c.id, "name": c.name, "is_beta": c.is_beta}
        for c in result.scalars().all()
        if c.id not in active_circuit_ids
    ]
```

In `checkout_create` (`:272-304`), the `if needs_circuit:` branch builds `already_owned` from `UserCircuitAccess`. Immediately AFTER the existing `already_owned = {row[0] for row in access_rows.all()}` line and BEFORE `if already_owned:`, add an all-grant short-circuit:

```python
        has_all_grant = (await db.execute(
            select(UserAllCircuitAccess.id).where(
                UserAllCircuitAccess.user_id == user.id,
                UserAllCircuitAccess.valid_from <= now,
                UserAllCircuitAccess.valid_until > now,
            )
        )).scalar_one_or_none() is not None
        if has_all_grant:
            raise HTTPException(
                400,
                "Ya tienes acceso a todos los circuitos con tu suscripción actual",
            )
```

(`now` is already defined in that block; `UserAllCircuitAccess` is imported in `stripe_routes.py` from Task 3.)

- [ ] **Step 8: Run to verify PASS**

Run: `cd /Users/jizcue/boxboxnow-v2/backend && .venv/bin/python -m pytest tests/test_all_grant_enforcement.py -v`
Expected: all 5 PASS.

- [ ] **Step 9: Commit**

```bash
cd /Users/jizcue/boxboxnow-v2
git add backend/app/api/config_routes.py backend/app/api/analytics_routes.py backend/app/api/replay_routes.py backend/app/api/stripe_routes.py backend/tests/test_all_grant_enforcement.py
git commit -m "$(cat <<'EOF'
feat(entitlements): HTTP per-circuit & list endpoints honour all-grant

_verify_circuit_access / _check_circuit_access use user_has_circuit_access;
config & analytics circuit lists, replay allowed set, and the checkout
list/already-owned block all treat an active all-grant as access to
for_sale∪beta. /config/circuits (native apps) covered here.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Update WebSocket handshakes

**Files:** Modify `backend/app/ws/server.py`, `backend/app/api/apex_replay_routes.py`; Create `backend/tests/test_ws_all_grant.py`.

Both WS gates inline a "any valid `UserCircuitAccess` row" loop. Replace each with the async `user_has_any_active_circuit_access` (Task 2).

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_ws_all_grant.py`:

```python
"""TDD — the WS circuit-access predicate honours an active all-grant."""
from __future__ import annotations

import sys, types
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

if "resend" not in sys.modules:
    _r = types.ModuleType("resend"); _r.api_key = None; _r.Emails = MagicMock()
    sys.modules["resend"] = _r

from app.api.auth_routes import user_has_any_active_circuit_access  # noqa: E402
from app.models.schemas import Base, User, UserAllCircuitAccess  # noqa: E402


@pytest_asyncio.fixture
async def db():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as s:
        yield s
    await engine.dispose()


async def test_ws_predicate_true_with_all_grant(db):
    now = datetime.now(timezone.utc)
    u = User(username="ws1", password_hash="x", is_admin=False)
    db.add(u); await db.flush()
    db.add(UserAllCircuitAccess(user_id=u.id,
                                valid_from=now - timedelta(hours=1),
                                valid_until=now + timedelta(days=1)))
    await db.commit()
    assert await user_has_any_active_circuit_access(db, u.id) is True


async def test_ws_predicate_false_without_any(db):
    u = User(username="ws2", password_hash="x", is_admin=False)
    db.add(u); await db.flush()
    await db.commit()
    assert await user_has_any_active_circuit_access(db, u.id) is False
```

- [ ] **Step 2: Run to verify it PASSES already (predicate exists from Task 2)**

Run: `cd /Users/jizcue/boxboxnow-v2/backend && .venv/bin/python -m pytest tests/test_ws_all_grant.py -v`
Expected: both PASS (this asserts the shared predicate; Steps 3-4 wire it into the two handshakes so the inline loops can't drift from it).

- [ ] **Step 3: Wire `ws/server.py` handshake to the shared predicate**

In `backend/app/ws/server.py`, the circuit gate currently is the block starting `# 2. Circuit access — at least one row must cover` containing:

```python
            ca_q = await db.execute(
                select(UserCircuitAccess.valid_from, UserCircuitAccess.valid_until).where(
                    UserCircuitAccess.user_id == user_id,
                )
            )
            has_circuit = False
            for vf, vu in ca_q.all():
                if vf is not None and vf.tzinfo is None:
                    vf = vf.replace(tzinfo=timezone.utc)
                if vu is not None and vu.tzinfo is None:
                    vu = vu.replace(tzinfo=timezone.utc)
                if (vf is None or vf <= now) and (vu is None or vu > now):
                    has_circuit = True
                    break
            if not has_circuit:
                logger.warning(f"WS rejected: no active circuit access (user={user_id})")
                await websocket.close(code=4003, reason="No active circuit access")
                return
```

Replace that entire block with:

```python
            from app.api.auth_routes import user_has_any_active_circuit_access
            if not await user_has_any_active_circuit_access(db, user_id):
                logger.warning(f"WS rejected: no active circuit access (user={user_id})")
                await websocket.close(code=4003, reason="No active circuit access")
                return
```

(`db`, `user_id`, `websocket`, `logger` are all in scope here. The subscription gate above this block is unchanged.)

- [ ] **Step 4: Wire `apex_replay_routes.py` handshake to the shared predicate**

In `backend/app/api/apex_replay_routes.py` `_ws_authenticate`, the tail currently is:

```python
        ca_q = await db.execute(
            select(UserCircuitAccess.valid_from, UserCircuitAccess.valid_until).where(
                UserCircuitAccess.user_id == user_id,
            )
        )
        for vf, vu in ca_q.all():
            if vf is not None and vf.tzinfo is None:
                vf = vf.replace(tzinfo=timezone.utc)
            if vu is not None and vu.tzinfo is None:
                vu = vu.replace(tzinfo=timezone.utc)
            if (vf is None or vf <= now) and (vu is None or vu > now):
                return user_id
        return None
```

Replace that entire block with:

```python
        from app.api.auth_routes import user_has_any_active_circuit_access
        if await user_has_any_active_circuit_access(db, user_id):
            return user_id
        return None
```

(`db`, `user_id`, `now` in scope; subscription gate above unchanged.)

- [ ] **Step 5: Run to verify PASS + import sanity**

Run: `cd /Users/jizcue/boxboxnow-v2/backend && .venv/bin/python -m pytest tests/test_ws_all_grant.py -v`
Expected: both PASS.
Run: `cd /Users/jizcue/boxboxnow-v2/backend && .venv/bin/python -c "import app.ws.server, app.api.apex_replay_routes; print('imports ok')"`
Expected: `imports ok` (no circular-import or NameError from the edits; if `select`/`UserCircuitAccess` becomes unused in a file, leave the import — removing is optional cleanup, not required).

- [ ] **Step 6: Commit**

```bash
cd /Users/jizcue/boxboxnow-v2
git add backend/app/ws/server.py backend/app/api/apex_replay_routes.py backend/tests/test_ws_all_grant.py
git commit -m "$(cat <<'EOF'
feat(entitlements): WS handshakes honour all-grant via shared predicate

Both /ws/race and apex-replay WS gates now call
user_has_any_active_circuit_access (per-circuit OR all-grant) instead of
an inline UserCircuitAccess-only loop.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Propagation integration test + full suite

**Files:** Create `backend/tests/test_all_grant_propagation.py`.

- [ ] **Step 1: Write the test**

Create `backend/tests/test_all_grant_propagation.py`:

```python
"""TDD — a circuit added AFTER an all-grant is immediately covered; one
flipped off-sale (non-beta) drops off for all-grant holders but an
explicit per-circuit row still covers it."""
from __future__ import annotations

import sys, types
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

if "resend" not in sys.modules:
    _r = types.ModuleType("resend"); _r.api_key = None; _r.Emails = MagicMock()
    sys.modules["resend"] = _r

from app.api.auth_routes import user_has_circuit_access  # noqa: E402
from app.models.schemas import (  # noqa: E402
    Base, User, Circuit, UserCircuitAccess, UserAllCircuitAccess,
)


@pytest_asyncio.fixture
async def db():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as s:
        yield s
    await engine.dispose()


async def test_new_circuit_auto_covered_by_all_grant(db):
    now = datetime.now(timezone.utc)
    u = User(username="p", password_hash="x", is_admin=False)
    db.add(u); await db.flush()
    db.add(UserAllCircuitAccess(user_id=u.id,
                                valid_from=now - timedelta(hours=1),
                                valid_until=now + timedelta(days=30)))
    await db.commit()
    # Circuit created AFTER the grant
    c_new = Circuit(name="NEW", ws_port=9100, for_sale=True, is_beta=False)
    db.add(c_new); await db.commit()
    assert await user_has_circuit_access(db, u.id, c_new.id) is True


async def test_offsale_drops_all_grant_but_not_explicit_row(db):
    now = datetime.now(timezone.utc)
    u = User(username="p2", password_hash="x", is_admin=False)
    c = Circuit(name="X", ws_port=9101, for_sale=True, is_beta=False)
    db.add_all([u, c]); await db.flush()
    db.add(UserAllCircuitAccess(user_id=u.id,
                                valid_from=now - timedelta(hours=1),
                                valid_until=now + timedelta(days=30)))
    await db.commit()
    assert await user_has_circuit_access(db, u.id, c.id) is True
    # Flip off-sale (non-beta): all-grant no longer covers it
    c.for_sale = False
    await db.commit()
    assert await user_has_circuit_access(db, u.id, c.id) is False
    # An explicit per-circuit row still covers it
    db.add(UserCircuitAccess(user_id=u.id, circuit_id=c.id,
                             valid_from=now - timedelta(hours=1),
                             valid_until=now + timedelta(days=30)))
    await db.commit()
    assert await user_has_circuit_access(db, u.id, c.id) is True
```

- [ ] **Step 2: Run to verify PASS**

Run: `cd /Users/jizcue/boxboxnow-v2/backend && .venv/bin/python -m pytest tests/test_all_grant_propagation.py -v`
Expected: both PASS (resolver from Task 2 already supports this).

- [ ] **Step 3: Full suite**

Run: `cd /Users/jizcue/boxboxnow-v2/backend && .venv/bin/python -m pytest tests -q`
Expected: all green. If a pre-existing test fails because it asserted the OLD N-row `_grant_all_circuits_access` behaviour (e.g. counted per-circuit rows after a cross-circuit purchase), update only that assertion to the new contract (one all-grant row, zero per-circuit rows for cross-circuit) and document which test and why. Do NOT modify production code beyond this plan. Investigate any other failure before touching it.

- [ ] **Step 4: Commit**

```bash
cd /Users/jizcue/boxboxnow-v2
git add backend/tests/test_all_grant_propagation.py
git commit -m "$(cat <<'EOF'
test(entitlements): all-grant propagation (new circuit auto-covered)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Notes / Out of Scope (do not implement)

- Per-circuit `UserCircuitAccess` rows & flows, `start_trial`, admin per-circuit grant/revoke endpoints, `_apply_config_to_user` (tabs only): unchanged.
- No data migration/backfill of existing cross-circuit subscribers — they migrate to an all-grant on their next `invoice.paid` (their stale per-circuit rows lapse). Accepted limitation.
- Frontend: `UserOut.has_active_circuit_access` stays a bool (the extended sync gate still returns bool) — no FE change, no `tsc`/build needed. iOS/Android transparently covered (consume `/config/circuits` + WS, both updated server-side).
- WS gate keeps today's "any active access ⇒ pass handshake" semantics (not strict per-target-circuit) — an active all-grant passes, mirroring the prior any-row behaviour (explicit design decision in the spec).
- Deployment is the user's call post-merge (validate nothing infra here; backend-only, new table auto-creates on the deploy's container restart via `init_db`'s `create_all`).
