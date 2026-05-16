"""Canonical list of driver-view card ids.

Source of truth for the BACKEND view of which cards exist. Used to
default `ProductTabConfig.allowed_cards` to "everything" for legacy
rows and to resolve `UserOut.allowed_cards` from the user's active
subscription.

The list MUST stay in sync with the three client catalogs:

  * web:     frontend/src/hooks/useDriverConfig.ts::ALL_DRIVER_CARDS
  * iOS:     BoxBoxNow/BoxBoxNow/Models/DriverCard.swift
  * Android: android/.../models/DriverCard.kt

We deliberately keep the catalog DUPLICATED across the 4 codebases
(rather than fetching from a single endpoint) so the clients can
render the preset editor without an extra network round-trip on
launch, and so older app versions don't break when the backend adds
a card. The trade-off is that label / group changes require 4 edits.
"""

# Every card id the platform knows about. When a plan's allowed_cards
# is empty, this is what gets returned to the client — i.e. legacy
# plans default to "all cards visible" rather than "no cards visible".
ALL_DRIVER_CARD_IDS: list[str] = [
    # Race - Apex (raw Apex live timing)
    "raceTimer",
    "lastLap",
    "bestStintLap",
    "apexPosition",
    "intervalAhead",
    "intervalBehind",
    # Race - BBN (BoxBoxNow-derived analytics)
    "currentLapTime",
    "avgLap20",
    "best3",
    "position",
    "realPos",
    "gapAhead",
    "gapBehind",
    "avgFutureStint",
    "lapsToMaxStint",
    "theoreticalBestLap",
    "deltaBestS1",
    "deltaBestS2",
    "deltaBestS3",
    "deltaSectors",
    "deltaCurrentS1",
    "deltaCurrentS2",
    "deltaCurrentS3",
    "deltaSectorsCurrent",
    # Box
    "currentPit",
    "pitCount",
    "boxScore",
    "pitWindow",
    # GPS
    "deltaBestLap",
    "gpsLapDelta",
    "gForceRadar",
    "gpsGForce",
    "gpsSpeed",
]


def resolve_allowed_cards(plan_allowed_cards: list[str]) -> list[str]:
    """Resolve the plan's stored allowed_cards array into the actual
    list of card ids the user should see.

    Empty list == "no opinion" == grant every card. This is the
    backward-compatible default that the column rollout depends on
    (existing rows are NOT NULL DEFAULT '[]', and we don't want to
    suddenly strip every existing user of their cards).
    """
    if not plan_allowed_cards:
        return list(ALL_DRIVER_CARD_IDS)
    # Filter out unknown ids so the client never receives stale cards
    # (e.g. one removed from the platform that an old plan still lists).
    known = set(ALL_DRIVER_CARD_IDS)
    return [c for c in plan_allowed_cards if c in known]
