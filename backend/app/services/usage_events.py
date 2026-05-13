"""Helpers for backend-emitted usage events (the funnel stages we
trust to the server side instead of the frontend).

Funnel events triggered server-side:
  * `register.completed` — POST /api/auth/register succeeded
  * `login.completed`    — POST /api/auth/login succeeded
  * `checkout.payment_success` — Stripe webhook `checkout.session.completed`

The frontend instruments the rest (landing.view, pricing.view,
pricing.plan_click, register.view, register.start, checkout.*_view).
These three live on the backend because they're the load-bearing
stages of the funnel: if the network blip / closes-tab races a
client-side flush, we'd lose the conversion attribution. The server
already knows the truth (the row in `users` / `subscriptions` is the
evidence), so we emit the event in the same transaction.
"""

from __future__ import annotations

import json as _json
import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.schemas import UsageEvent, VisitorIdentity

logger = logging.getLogger(__name__)


def _short(value: Optional[str], maxlen: int) -> Optional[str]:
    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None
    return s[:maxlen]


async def link_visitor_to_user(
    db: AsyncSession,
    visitor_id: Optional[str],
    user_id: int,
    *,
    utm_source: Optional[str] = None,
    utm_medium: Optional[str] = None,
    utm_campaign: Optional[str] = None,
    referrer: Optional[str] = None,
    first_seen: Optional[datetime] = None,
) -> Optional[VisitorIdentity]:
    """Idempotently associate an anonymous visitor_id with a user_id.

    Called from /auth/register (creates the row) and /auth/login (no-op
    if already linked). The first-touch attribution columns are written
    only on creation — later logins from the same browser don't
    overwrite the original snapshot.

    Returns the VisitorIdentity row if created or already present, or
    None when no visitor_id was supplied (mobile clients).
    """
    vid = _short(visitor_id, 36)
    if not vid:
        return None

    result = await db.execute(
        select(VisitorIdentity).where(VisitorIdentity.visitor_id == vid)
    )
    existing = result.scalar_one_or_none()
    if existing:
        # If we already had a row but for a DIFFERENT user (shared
        # browser, e.g. two people using the same computer), update
        # the mapping to point to the most recent user — that's the
        # active session. We keep the original first-touch snapshot
        # untouched: that visitor's first acquisition story doesn't
        # change just because a different person later logged in.
        if existing.user_id != user_id:
            existing.user_id = user_id
            existing.linked_at = datetime.now(timezone.utc)
        return existing

    row = VisitorIdentity(
        visitor_id=vid,
        user_id=user_id,
        first_seen=first_seen,
        first_utm_source=_short(utm_source, 64),
        first_utm_medium=_short(utm_medium, 64),
        first_utm_campaign=_short(utm_campaign, 64),
        first_referrer=_short(referrer, 255),
    )
    db.add(row)
    return row


async def record_event(
    db: AsyncSession,
    *,
    event_type: str,
    event_key: str,
    user_id: Optional[int] = None,
    visitor_id: Optional[str] = None,
    client_kind: str = "web",
    app_platform: str = "web",
    app_version: Optional[str] = None,
    circuit_id: Optional[int] = None,
    props: Optional[dict] = None,
    utm_source: Optional[str] = None,
    utm_medium: Optional[str] = None,
    utm_campaign: Optional[str] = None,
    referrer: Optional[str] = None,
) -> UsageEvent:
    """Append a single UsageEvent row. Caller is responsible for
    committing — usually piggybacks on the same transaction as the
    primary domain action (e.g. user creation) so the event and the
    underlying state stay consistent.

    Pulls first-touch attribution from VisitorIdentity when available,
    falling back to whatever the caller passed in. This is what closes
    the loop: a server-side `register.completed` event automatically
    carries the utm_source the visitor arrived with WEEKS earlier,
    making the attribution view accurate even without re-sending UTMs
    from the client at registration time.
    """
    # Resolve first-touch from VisitorIdentity if the visitor is linked
    if visitor_id and (not utm_source and not utm_campaign and not referrer):
        vi_result = await db.execute(
            select(VisitorIdentity).where(VisitorIdentity.visitor_id == visitor_id)
        )
        vi = vi_result.scalar_one_or_none()
        if vi:
            utm_source = utm_source or vi.first_utm_source
            utm_medium = utm_medium or vi.first_utm_medium
            utm_campaign = utm_campaign or vi.first_utm_campaign
            referrer = referrer or vi.first_referrer

    props_json: Optional[str] = None
    if props:
        try:
            props_json = _json.dumps(props, ensure_ascii=False)[:2000]
        except Exception:
            props_json = None

    row = UsageEvent(
        user_id=user_id,
        visitor_id=_short(visitor_id, 36),
        event_type=_short(event_type, 20) or "action",
        event_key=_short(event_key, 80) or "unknown",
        client_kind=_short(client_kind, 16) or "web",
        app_platform=_short(app_platform, 16) or "web",
        app_version=_short(app_version, 32),
        circuit_id=circuit_id,
        props_json=props_json,
        utm_source=_short(utm_source, 64),
        utm_medium=_short(utm_medium, 64),
        utm_campaign=_short(utm_campaign, 64),
        referrer=_short(referrer, 255),
    )
    db.add(row)
    return row
