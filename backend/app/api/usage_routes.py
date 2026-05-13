"""Usage analytics — first-party event capture + admin aggregations.

Three responsibilities:

  * **Ingestion** (`POST /api/usage/events`): accepts a BATCH of events
    from the SPA / mobile apps. No auth required — anonymous funnel
    events (landing.view, pricing.view, …) must work BEFORE the visitor
    has a user_id. If a JWT is attached we resolve the user; if not we
    keep `user_id=NULL` and rely on `visitor_id` to stitch events.

  * **Aggregations** (`GET /api/usage/stats/*`): admin-only endpoints
    that power the "Analítica → Uso" admin panel. They read from
    `usage_daily` (rollup) when available, falling back to `usage_events`
    (raw) for the last 24h that the rollup hasn't covered yet.

  * **Bot filtering**: User-Agents that look like crawlers/previewers
    are silently dropped. Without this the funnel gets polluted by
    SEO/preview bots hitting the landing.

Privacy posture:
  * No IP, no precise geolocation, no PII in `props_json`.
  * `visitor_id` is a localStorage UUID — first-party, no third party.
  * Users can opt out via Cuenta → Privacidad (F5 toggle). When that
    flag is on the SPA simply stops emitting; nothing to enforce here.
"""

from __future__ import annotations

import json as _json
import logging
import re
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth_routes import decode_token, require_admin
from app.models.database import get_db
from app.models.schemas import (
    DeviceSession,
    UsageEvent,
    User,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/usage", tags=["usage"])


# Conservative bot/crawler regex — broad enough to catch the common ones
# without false-positive on real browsers. Lowercased UA only.
_BOT_PATTERNS = re.compile(
    r"bot|crawl|spider|slurp|bingpreview|facebookexternalhit|"
    r"whatsapp|telegram|twitterbot|linkedinbot|embedly|"
    r"discordbot|googleother|chatgpt|gptbot|claudebot|"
    r"applebot|petalbot|yandex|baiduspider|ahrefsbot|semrushbot|"
    r"headlesschrome|phantomjs|puppeteer|playwright"
)

# Per-batch cap. The SPA never sends more than ~10 events per flush in
# practice; this is a defence against a misbehaving client filling the DB.
MAX_EVENTS_PER_BATCH = 100

# Cap on string fields to keep the row size predictable. Matches the
# Column lengths declared in schemas.UsageEvent.
_LIMITS = {
    "visitor_id": 36,
    "event_type": 20,
    "event_key": 80,
    "client_kind": 16,
    "app_platform": 16,
    "app_version": 32,
    "utm_source": 64,
    "utm_medium": 64,
    "utm_campaign": 64,
    "referrer": 255,
}


def _truncate(value: object, key: str) -> Optional[str]:
    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None
    return s[: _LIMITS[key]]


def _is_bot(user_agent: str) -> bool:
    if not user_agent:
        return False
    return bool(_BOT_PATTERNS.search(user_agent.lower()))


async def _try_resolve_user(
    request: Request, db: AsyncSession
) -> Optional[User]:
    """Best-effort resolution of the authenticated user from a Bearer
    token, falling back to None when no token is present or the token
    is invalid. Never raises — analytics ingestion must accept anonymous
    traffic alongside authenticated traffic without 401-ing the SPA's
    background flush.
    """
    auth = request.headers.get("authorization", "") or request.headers.get("Authorization", "")
    if not auth.lower().startswith("bearer "):
        return None
    token = auth.split(None, 1)[1].strip()
    if not token:
        return None
    try:
        payload = decode_token(token)
    except Exception:
        return None
    user_id_raw = payload.get("sub") if isinstance(payload, dict) else None
    try:
        user_id = int(user_id_raw)
    except (TypeError, ValueError):
        return None
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


@router.post("/events")
async def post_events(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Ingest a batch of usage events.

    Body shape: `{"events": [{...}, {...}, ...]}`. Each event has at
    minimum `event_type` + `event_key`; everything else is optional.

    No auth required. If a Bearer token is attached we resolve
    `user_id`; otherwise the rows are anonymous and visitor_id is the
    only join key. Bot UAs are dropped silently.
    """
    ua = (request.headers.get("user-agent") or "").lower()
    if _is_bot(ua):
        return {"ok": True, "dropped": "bot"}

    try:
        body = await request.json()
    except Exception:
        raise HTTPException(400, "invalid JSON body")

    raw_events = body.get("events") if isinstance(body, dict) else None
    if not isinstance(raw_events, list) or not raw_events:
        return {"ok": True, "count": 0}

    user = await _try_resolve_user(request, db)
    user_id = user.id if user else None

    # Headers populated by the mobile clients (web doesn't send them);
    # used as fallback when the event body doesn't specify.
    header_platform = (request.headers.get("x-app-platform") or "").strip().lower()
    header_version = (request.headers.get("x-app-version") or "").strip()

    rows: list[UsageEvent] = []
    for raw in raw_events[:MAX_EVENTS_PER_BATCH]:
        if not isinstance(raw, dict):
            continue
        event_type = _truncate(raw.get("event_type"), "event_type")
        event_key = _truncate(raw.get("event_key"), "event_key")
        if not event_type or not event_key:
            continue  # silently drop malformed entries

        props = raw.get("props")
        props_json: Optional[str] = None
        if props is not None:
            try:
                props_json = _json.dumps(props, ensure_ascii=False)[:2000]
            except Exception:
                props_json = None

        circuit_id = raw.get("circuit_id")
        if circuit_id is not None:
            try:
                circuit_id = int(circuit_id)
            except (TypeError, ValueError):
                circuit_id = None

        rows.append(
            UsageEvent(
                user_id=user_id,
                visitor_id=_truncate(raw.get("visitor_id"), "visitor_id"),
                event_type=event_type,
                event_key=event_key,
                client_kind=_truncate(raw.get("client_kind"), "client_kind")
                or ("mobile" if header_platform in ("ios", "android") else "web"),
                app_platform=_truncate(raw.get("app_platform"), "app_platform")
                or header_platform
                or "web",
                app_version=_truncate(raw.get("app_version"), "app_version")
                or header_version
                or "",
                circuit_id=circuit_id,
                props_json=props_json,
                utm_source=_truncate(raw.get("utm_source"), "utm_source"),
                utm_medium=_truncate(raw.get("utm_medium"), "utm_medium"),
                utm_campaign=_truncate(raw.get("utm_campaign"), "utm_campaign"),
                referrer=_truncate(raw.get("referrer"), "referrer"),
            )
        )

    if not rows:
        return {"ok": True, "count": 0}

    db.add_all(rows)
    await db.commit()
    return {"ok": True, "count": len(rows)}


# ─────────────────────────── Admin aggregates ───────────────────────────


def _parse_range_days(days: Optional[int], default: int, max_days: int) -> int:
    """Clamp the ?days= query arg to a sane window."""
    if days is None:
        return default
    try:
        d = int(days)
    except (TypeError, ValueError):
        return default
    return max(1, min(d, max_days))


@router.get("/stats/overview")
async def stats_overview(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Top-of-panel KPIs for the admin "Analítica → Uso" tab.

    Returns:
      * dau / wau / mau — distinct active user_ids in the last 1 / 7 /
        30 days (counted from DeviceSession.last_active, the single
        most reliable "the user did something" signal — captured by
        the get_current_user dependency on EVERY authenticated request).
      * total_users — registered accounts.
      * active_now — users whose last activity is within the last 5
        minutes (lightweight "currently online" gauge).
      * platforms — breakdown of last_active sessions by app_platform.
    """
    now = datetime.now(timezone.utc)

    async def _distinct_active(since: datetime) -> int:
        result = await db.execute(
            select(func.count(func.distinct(DeviceSession.user_id))).where(
                DeviceSession.last_active >= since
            )
        )
        return int(result.scalar() or 0)

    dau = await _distinct_active(now - timedelta(days=1))
    wau = await _distinct_active(now - timedelta(days=7))
    mau = await _distinct_active(now - timedelta(days=30))
    online = await _distinct_active(now - timedelta(minutes=5))

    total_users_result = await db.execute(select(func.count(User.id)))
    total_users = int(total_users_result.scalar() or 0)

    # Platform breakdown over the last 30 days
    platform_result = await db.execute(
        select(
            func.coalesce(DeviceSession.app_platform, "web").label("platform"),
            func.count(func.distinct(DeviceSession.user_id)).label("users"),
        )
        .where(DeviceSession.last_active >= now - timedelta(days=30))
        .group_by(func.coalesce(DeviceSession.app_platform, "web"))
    )
    platforms = {row.platform or "web": int(row.users) for row in platform_result.all()}

    return {
        "dau": dau,
        "wau": wau,
        "mau": mau,
        "total_users": total_users,
        "active_now": online,
        "platforms": platforms,
    }


@router.get("/stats/active-users")
async def stats_active_users(
    days: Optional[int] = None,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Time series of distinct active users per day, last N days
    (default 30, max 365). Drives the line chart in the admin panel.

    Counts users whose DeviceSession.last_active fell within each day —
    same definition as `dau` in `/stats/overview`. Doesn't require any
    instrumentation in the SPA because get_current_user already
    refreshes last_active on every authenticated request.

    Output is filled-in: even days with zero activity get an entry, so
    the front-end chart doesn't have to interpolate.
    """
    n = _parse_range_days(days, default=30, max_days=365)
    now = datetime.now(timezone.utc)
    since = (now - timedelta(days=n - 1)).replace(hour=0, minute=0, second=0, microsecond=0)

    # SQLite-compatible date truncation via DATE() on the column.
    result = await db.execute(
        select(
            func.date(DeviceSession.last_active).label("day"),
            func.count(func.distinct(DeviceSession.user_id)).label("active"),
        )
        .where(DeviceSession.last_active >= since)
        .group_by(func.date(DeviceSession.last_active))
        .order_by(func.date(DeviceSession.last_active))
    )
    by_day: dict[str, int] = {str(row.day): int(row.active) for row in result.all()}

    # Fill missing days with 0
    series: list[dict] = []
    cursor = since.date()
    today = now.date()
    while cursor <= today:
        key = cursor.isoformat()
        series.append({"day": key, "active": by_day.get(key, 0)})
        cursor = cursor + timedelta(days=1)

    return {"series": series, "days": n}


# Canonical funnel stages, evaluated in order. Each stage's count is
# the number of DISTINCT visitor_ids that emitted the corresponding
# event in the requested time window. Conversion rates are computed
# vs. the previous stage AND vs. the very first stage (overall).
_FUNNEL_STAGES: list[tuple[str, str]] = [
    ("landing.view", "Visita a la landing"),
    ("pricing.view", "Vio precios"),
    ("pricing.plan_click", "Click en plan"),
    ("register.view", "Abrió registro"),
    ("register.start", "Empezó registro"),
    ("register.completed", "Cuenta creada"),
    ("login.completed", "Login"),
    ("checkout.circuit_view", "Selector de circuito"),
    ("checkout.circuit_selected", "Circuito elegido"),
    ("checkout.embedded_open", "Pasarela de pago"),
    ("checkout.payment_success", "Pago confirmado"),
    ("dashboard.first_view", "Primer uso"),
]


@router.get("/stats/funnel")
async def stats_funnel(
    days: Optional[int] = None,
    utm_source: Optional[str] = None,
    utm_campaign: Optional[str] = None,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Acquisition funnel — distinct visitors per stage + conversion
    rates between stages.

    Granularity is by `visitor_id` (not user_id) because the first six
    stages happen BEFORE the visitor has a user_id. A visitor counts
    in a stage if they emitted that stage's event AT LEAST ONCE within
    the window.

    Optional filters: `utm_source`, `utm_campaign`. When passed, only
    events whose first-touch attribution matches are counted — this is
    the lens that answers "of the visitors that came from google_ads,
    how many converted?".
    """
    n = _parse_range_days(days, default=30, max_days=90)
    since = datetime.now(timezone.utc) - timedelta(days=n)

    stages_out: list[dict] = []
    first_count: Optional[int] = None
    prev_count: Optional[int] = None

    for event_key, label in _FUNNEL_STAGES:
        query = select(func.count(func.distinct(UsageEvent.visitor_id))).where(
            UsageEvent.ts >= since,
            UsageEvent.event_key == event_key,
            UsageEvent.visitor_id.isnot(None),
        )
        if utm_source:
            query = query.where(UsageEvent.utm_source == utm_source[:64])
        if utm_campaign:
            query = query.where(UsageEvent.utm_campaign == utm_campaign[:64])
        result = await db.execute(query)
        count = int(result.scalar() or 0)
        if first_count is None:
            first_count = count

        pct_overall = (count / first_count * 100.0) if first_count else None
        pct_step = (count / prev_count * 100.0) if prev_count else None
        stages_out.append(
            {
                "event_key": event_key,
                "label": label,
                "count": count,
                "pct_overall": pct_overall,
                "pct_step": pct_step,
            }
        )
        prev_count = count

    return {"stages": stages_out, "days": n}


@router.get("/stats/attribution")
async def stats_attribution(
    days: Optional[int] = None,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Top utm_source / utm_campaign / referrer rankings, last N days.

    Returns three sorted tables:
      * by_source  : {utm_source: {visitors, registrations, payments}}
      * by_campaign: {utm_campaign: {...}}
      * by_referrer: {referrer: {...}}

    "visitors" = distinct visitor_ids that emitted ANY event with that
    attribution. "registrations" / "payments" are the same count
    restricted to the matching funnel event.
    """
    n = _parse_range_days(days, default=30, max_days=180)
    since = datetime.now(timezone.utc) - timedelta(days=n)

    async def _by_field(field, restrict_event: Optional[str] = None) -> dict[str, int]:
        query = select(
            field.label("k"),
            func.count(func.distinct(UsageEvent.visitor_id)).label("v"),
        ).where(
            UsageEvent.ts >= since,
            field.isnot(None),
            UsageEvent.visitor_id.isnot(None),
        ).group_by(field)
        if restrict_event:
            query = query.where(UsageEvent.event_key == restrict_event)
        result = await db.execute(query)
        return {str(row.k): int(row.v) for row in result.all() if row.k}

    def _merge(visitors: dict, regs: dict, pays: dict) -> list[dict]:
        keys = set(visitors) | set(regs) | set(pays)
        rows = [
            {
                "key": k,
                "visitors": visitors.get(k, 0),
                "registrations": regs.get(k, 0),
                "payments": pays.get(k, 0),
            }
            for k in keys
        ]
        rows.sort(key=lambda r: (-r["visitors"], r["key"]))
        return rows

    src_v = await _by_field(UsageEvent.utm_source)
    src_r = await _by_field(UsageEvent.utm_source, "register.completed")
    src_p = await _by_field(UsageEvent.utm_source, "checkout.payment_success")

    cmp_v = await _by_field(UsageEvent.utm_campaign)
    cmp_r = await _by_field(UsageEvent.utm_campaign, "register.completed")
    cmp_p = await _by_field(UsageEvent.utm_campaign, "checkout.payment_success")

    ref_v = await _by_field(UsageEvent.referrer)
    ref_r = await _by_field(UsageEvent.referrer, "register.completed")
    ref_p = await _by_field(UsageEvent.referrer, "checkout.payment_success")

    return {
        "days": n,
        "by_source": _merge(src_v, src_r, src_p),
        "by_campaign": _merge(cmp_v, cmp_r, cmp_p),
        "by_referrer": _merge(ref_v, ref_r, ref_p),
    }


@router.get("/stats/heatmap")
async def stats_heatmap(
    days: Optional[int] = None,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Day × hour heatmap of usage intensity, last N days (default 30).

    Output:
      * cells: list of {day_of_week (0=Monday..6=Sunday), hour (0..23),
        count} — each cell is total events that fell on that
        weekday/hour bucket over the window. Counted from
        `usage_events` directly so it works without needing the rollup.
      * max_count: max cell count, so the client doesn't have to
        recompute it for the colour scale.

    UTC throughout — the client converts to local on display.
    """
    n = _parse_range_days(days, default=30, max_days=90)
    since = datetime.now(timezone.utc) - timedelta(days=n)

    # SQLite: extract weekday (0=Sunday..6=Saturday) via strftime('%w', ...)
    # and hour via strftime('%H', ...). We re-key to ISO Monday=0..Sunday=6
    # in Python after fetching so the heatmap reads naturally.
    result = await db.execute(
        select(
            func.strftime("%w", UsageEvent.ts).label("dow_sqlite"),
            func.strftime("%H", UsageEvent.ts).label("hour"),
            func.count(UsageEvent.id).label("count"),
        )
        .where(UsageEvent.ts >= since)
        .group_by(func.strftime("%w", UsageEvent.ts), func.strftime("%H", UsageEvent.ts))
    )

    cells: list[dict] = []
    max_count = 0
    for row in result.all():
        try:
            dow_sqlite = int(row.dow_sqlite)
            hour = int(row.hour)
            count = int(row.count)
        except (TypeError, ValueError):
            continue
        # SQLite: 0=Sunday..6=Saturday → ISO 0=Monday..6=Sunday
        dow_iso = (dow_sqlite + 6) % 7
        cells.append({"day_of_week": dow_iso, "hour": hour, "count": count})
        max_count = max(max_count, count)

    return {"cells": cells, "max_count": max_count, "days": n}


@router.get("/stats/top-events")
async def stats_top_events(
    days: Optional[int] = None,
    event_type: Optional[str] = None,
    limit: int = 20,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Top event_keys by count, last N days (default 7, max 90).

    `event_type` optional filter — pass "tab_view" for the "top tabs"
    chart, "action" for the "top acciones" chart, or omit for "all".
    """
    n = _parse_range_days(days, default=7, max_days=90)
    since = datetime.now(timezone.utc) - timedelta(days=n)
    limit = max(1, min(int(limit or 20), 100))

    query = (
        select(
            UsageEvent.event_key,
            func.count(UsageEvent.id).label("count"),
            func.count(func.distinct(UsageEvent.user_id)).label("users"),
        )
        .where(UsageEvent.ts >= since)
        .group_by(UsageEvent.event_key)
        .order_by(func.count(UsageEvent.id).desc())
        .limit(limit)
    )
    if event_type:
        query = query.where(UsageEvent.event_type == event_type[:20])

    result = await db.execute(query)
    rows = [
        {
            "event_key": row.event_key,
            "count": int(row.count),
            "users": int(row.users or 0),
        }
        for row in result.all()
    ]
    return {"top": rows, "days": n}
