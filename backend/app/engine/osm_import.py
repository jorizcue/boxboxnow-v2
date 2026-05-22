"""Import kart-track polylines from OpenStreetMap via the Overpass API.

OSM has many karting tracks mapped under `way[leisure=track][sport=karting]`
or just `way[leisure=track]`. We query within a 300 m radius of the
circuit's configured finish-line coordinates and return the longest
matching way as a candidate polyline. The admin editor previews it on
top of the satellite and the operator can refine vertices manually
before saving.

Failure modes:
  * No internet / Overpass timeout → returns None, admin gets a banner
    and falls back to manual tracing.
  * No matching way → returns None.
  * Multiple ways → pick the longest (the actual circuit, vs. service
    roads or fences).

No retry logic here on purpose; the admin can hit "Importar de OSM"
again. Keeping the function pure & sync-ish makes it trivially testable.
"""
from __future__ import annotations

import logging
import math
from typing import Any

import httpx

logger = logging.getLogger(__name__)


# Public Overpass endpoint. Multiple mirrors exist; this is the canonical
# one. Free, no auth, rate-limited but generous for our admin-only use.
OVERPASS_URL = "https://overpass-api.de/api/interpreter"

# Search radius in meters around the circuit's reference point. 300 m is
# generous — covers any kart track and pit lane while excluding nearby
# service roads on most cases.
SEARCH_RADIUS_M = 300


def _build_query(lat: float, lon: float, radius_m: int = SEARCH_RADIUS_M) -> str:
    """Overpass QL query: pick up karting tracks first, then any race track.

    OSM has multiple conventions for racing tracks:
      * `highway=raceway` (most common for kart tracks and motor circuits)
      * `leisure=track` (athletics tracks; rarely a kart track)
      * `sport=karting|motor` to disambiguate
    We query the most specific tags first and fall back progressively.
    `_extract_best_polyline` picks the way with the most nodes — that
    favors the actual circuit ribbon over short access roads or pit
    fences also tagged `raceway` nearby.
    """
    return f"""
[out:json][timeout:25];
(
  way[highway=raceway][sport=karting](around:{radius_m},{lat},{lon});
  way[highway=raceway][sport=motor](around:{radius_m},{lat},{lon});
  way[highway=raceway](around:{radius_m},{lat},{lon});
  way[leisure=track][sport=karting](around:{radius_m},{lat},{lon});
  way[leisure=track](around:{radius_m},{lat},{lon});
);
out body;
>;
out skel qt;
""".strip()


async def _query_overpass(lat: float, lon: float, radius_m: int) -> dict[str, Any] | None:
    """POST the Overpass query and return the parsed JSON payload, or None
    on any network / API failure.

    Overpass requires:
      * Body sent as `application/x-www-form-urlencoded` with the
        query in a `data=...` form field. Sending raw text in the
        body produces a 406 Not Acceptable.
      * A non-default User-Agent — some mirrors reject httpx's stock
        identifier with 429 / 406.
    """
    query = _build_query(lat, lon, radius_m)
    headers = {
        "User-Agent": "BoxBoxNow/1.0 (+https://boxboxnow.com) tracking-osm-import",
        "Accept": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=30.0, headers=headers) as client:
            resp = await client.post(OVERPASS_URL, data={"data": query})
            resp.raise_for_status()
            return resp.json()
    except Exception as e:
        logger.warning(f"OSM import: Overpass call failed: {e}")
        return None


def _haversine_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Great-circle distance in meters between two (lat, lon) points."""
    radius = 6371000.0
    lat1, lon1 = a
    lat2, lon2 = b
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    h = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * radius * math.asin(math.sqrt(h))


def _polyline_length_m(pts: list[tuple[float, float]]) -> float:
    return sum(_haversine_m(pts[i], pts[i + 1]) for i in range(len(pts) - 1))


async def list_osm_candidates(
    lat: float, lon: float, radius_m: int = SEARCH_RADIUS_M
) -> list[dict[str, Any]]:
    """Return ALL candidate track ways near (lat, lon), sorted longest-first.

    Each candidate is a dict:
        {
          "polyline":  [[lat, lon], ...],
          "lengthM":   <int meters>,
          "nodeCount": <int>,
          "closed":    <bool>,        # first point == last point
          "name":      <str>,         # OSM name/ref or "" if untagged
          "osmId":     <int>,         # OSM way id (lets the operator verify)
        }

    Venues like RKC Paris have several layouts mapped in OSM; returning the
    full list (instead of auto-picking by node count, which favoured the
    most-detailed-but-shorter loop) lets the admin choose the right one in
    the editor. Empty list on no match / API failure.
    """
    payload = await _query_overpass(lat, lon, radius_m)
    if not payload:
        return []
    return _extract_candidates(payload)


def _extract_candidates(payload: dict[str, Any]) -> list[dict[str, Any]]:
    """Build the candidate list from an Overpass response, sorted by
    geographic length descending (longest = the main circuit ribbon)."""
    elements = payload.get("elements") or []
    nodes: dict[int, tuple[float, float]] = {}
    ways: list[dict] = []
    for el in elements:
        t = el.get("type")
        if t == "node":
            nid = el.get("id")
            lat = el.get("lat")
            lon = el.get("lon")
            if nid is not None and lat is not None and lon is not None:
                nodes[nid] = (float(lat), float(lon))
        elif t == "way":
            ways.append(el)

    if not ways or not nodes:
        return []

    candidates: list[dict[str, Any]] = []
    for w in ways:
        node_ids = w.get("nodes") or []
        pts = [nodes[nid] for nid in node_ids if nid in nodes]
        if len(pts) < 4:
            continue  # too short to be a kart track
        tags = w.get("tags") or {}
        length = _polyline_length_m(pts)
        candidates.append({
            "polyline": [[la, lo] for la, lo in pts],
            "lengthM": round(length),
            "nodeCount": len(pts),
            "closed": pts[0] == pts[-1],
            "name": tags.get("name") or tags.get("ref") or "",
            "osmId": w.get("id"),
        })

    # Longest first — the main circuit beats service roads / shorter layouts.
    candidates.sort(key=lambda c: c["lengthM"], reverse=True)
    return candidates


async def import_from_osm(lat: float, lon: float, radius_m: int = SEARCH_RADIUS_M) -> list[tuple[float, float]] | None:
    """Backward-compatible single-best import: returns the LONGEST candidate's
    polyline as (lat, lon) tuples, or None when there's no match / API is
    unreachable. New callers should prefer `list_osm_candidates`.
    """
    candidates = await list_osm_candidates(lat, lon, radius_m)
    if not candidates:
        return None
    return [(la, lo) for la, lo in candidates[0]["polyline"]]
