"""Test: new users get a UserPreferences row seeded at registration with
every ALL_DRIVER_CARD_IDS entry set to False in visible_cards.

Must FAIL before the seed is added to register() and PASS after.
"""
from __future__ import annotations

import asyncio
import json
import sys
import types
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import select

# Stub out the `resend` third-party module before app/email_service imports it.
if "resend" not in sys.modules:
    _resend_stub = types.ModuleType("resend")
    _resend_stub.api_key = None
    _resend_stub.Emails = MagicMock()
    sys.modules["resend"] = _resend_stub

from app.models.schemas import Base, User, UserPreferences  # noqa: E402
from app.services.driver_cards import ALL_DRIVER_CARD_IDS  # noqa: E402
from app.api.auth_routes import register  # noqa: E402
from app.models.pydantic_models import RegisterRequest  # noqa: E402


# ---------------------------------------------------------------------------
# In-memory DB fixture
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def db():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as s:
        yield s
    await engine.dispose()


# ---------------------------------------------------------------------------
# Minimal stubs for register() dependencies
# ---------------------------------------------------------------------------

class _FakeClient:
    host = "127.0.0.1"


class _FakeRequest:
    """Stand-in for starlette.requests.Request used by register()."""
    client = _FakeClient()

    class _Headers(dict):
        def get(self, key, default=None):
            return default

    headers = _Headers()


# ---------------------------------------------------------------------------
# Test
# ---------------------------------------------------------------------------

async def test_new_user_gets_all_cards_unchecked(db):
    """After register(), a UserPreferences row must exist with every
    ALL_DRIVER_CARD_IDS key mapped to False.

    Fails before the seed is added to register(); passes after.
    """
    data = RegisterRequest(
        username="newuser_prefs",
        email="prefs@example.com",
        password="TestPassword1",
    )
    request = _FakeRequest()

    # Patch external dependencies that require live services:
    # 1. asyncio.create_task — suppress fire-and-forget email dispatch
    # 2. usage_events helpers — both are lazy-imported inside register()
    with (
        patch("asyncio.create_task", return_value=None),
        patch(
            "app.services.usage_events.link_visitor_to_user",
            new=AsyncMock(return_value=None),
        ),
        patch(
            "app.services.usage_events.record_event",
            new=AsyncMock(return_value=None),
        ),
    ):
        await register(data=data, request=request, db=db)

    # Fetch the created user.
    user_row = (
        await db.execute(select(User).where(User.username == "newuser_prefs"))
    ).scalar_one()

    # There must be a UserPreferences row for this user.
    prefs_row = (
        await db.execute(
            select(UserPreferences).where(UserPreferences.user_id == user_row.id)
        )
    ).scalar_one_or_none()

    assert prefs_row is not None, \
        "register() must seed a UserPreferences row for the new user"

    visible = json.loads(prefs_row.visible_cards)

    # Every card id in ALL_DRIVER_CARD_IDS must be present and False.
    for card_id in ALL_DRIVER_CARD_IDS:
        assert card_id in visible, \
            f"card '{card_id}' missing from seeded visible_cards"
        assert visible[card_id] is False, \
            f"card '{card_id}' should be False in seeded visible_cards, got {visible[card_id]!r}"

    # card_order must be an empty list.
    assert json.loads(prefs_row.card_order) == [], \
        "seeded card_order should be an empty list"
