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
    """Overpass QL query: pick up karting tracks first, then any track."""
    return f"""
[out:json][timeout:25];
(
  way[leisure=track][sport=karting](around:{radius_m},{lat},{lon});
  way[leisure=track](around:{radius_m},{lat},{lon});
);
out body;
>;
out skel qt;
""".strip()


async def import_from_osm(lat: float, lon: float, radius_m: int = SEARCH_RADIUS_M) -> list[tuple[float, float]] | None:
    """Query Overpass for tracks near (lat, lon) and return the best polyline.

    Returns `None` when there's no match or the API is unreachable —
    callers should fall back to manual tracing in the admin editor.
    """
    query = _build_query(lat, lon, radius_m)
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(OVERPASS_URL, content=query.encode("utf-8"))
            resp.raise_for_status()
            payload = resp.json()
    except Exception as e:
        logger.warning(f"OSM import: Overpass call failed: {e}")
        return None

    return _extract_best_polyline(payload)


def _extract_best_polyline(payload: dict[str, Any]) -> list[tuple[float, float]] | None:
    """Pick the longest way from an Overpass response and return its
    polyline as a list of (lat, lon) tuples.
    """
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
        return None

    # Build candidate polylines and pick the one with most vertices
    # (proxy for "the actual track"). Service roads / pit fences are
    # typically much shorter.
    best: list[tuple[float, float]] | None = None
    for w in ways:
        node_ids = w.get("nodes") or []
        pts = [nodes[nid] for nid in node_ids if nid in nodes]
        if len(pts) < 4:
            continue  # too short to be a kart track
        if best is None or len(pts) > len(best):
            best = pts

    return best
