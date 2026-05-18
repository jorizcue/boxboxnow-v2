"""Shared pytest fixtures.

The public landing endpoints use a process-wide in-memory TTL cache
(``app.services.public_cache.public_cache``), a module-level singleton.
Without isolation a value cached by one test (e.g. under key
``public-circuits``) leaks into the next test, which seeds a different
in-memory DB — so e.g. ``test_public_circuits_empty`` would see the
previous test's circuit list. Clear it around every test.
"""
from __future__ import annotations

import sys
import types
from unittest.mock import MagicMock

import pytest

# Stub ``resend`` before any app import (mirrors the per-file stubs in
# the suite); conftest is imported before test modules.
if "resend" not in sys.modules:
    _r = types.ModuleType("resend")
    _r.api_key = None
    _r.Emails = MagicMock()
    sys.modules["resend"] = _r

from app.services.public_cache import public_cache  # noqa: E402


@pytest.fixture(autouse=True)
def _clear_public_cache():
    public_cache.clear()
    yield
    public_cache.clear()
