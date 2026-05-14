"""Geometric helpers for the tracking module.

A "polyline" here is a list of `(lat, lon)` tuples. The functions work
in meters using the Haversine formula. We don't need centimeter-precision
projection — karts are interpolated to within ~10 m and the live map is
rendered with Leaflet which works directly in lat/lon, so the round-trip
distance ↔ point operates on the same coordinate system.

Conventions:
  * `progress_m`: distance in meters from the first vertex of a polyline,
    measured along the line. For circuit polylines (closed loops) this is
    "distance from meta" because the editor stores the meta as the first
    vertex.
  * `total_m`: total length of the polyline. For closed loops it includes
    the closing segment from last vertex to first vertex.
  * Direction: every polyline is stored in `forward` order. When a race
    runs `reversed`, callers apply `total_m - progress_m` themselves
    (see `effective_distance_forward`).
"""
from __future__ import annotations

import math
from typing import Iterable


# Earth radius used by Haversine. The standard value is 6,371,000 m;
# circuits are <2 km so the choice barely matters.
_EARTH_RADIUS_M = 6_371_000.0


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two lat/lon points in meters."""
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlmb / 2) ** 2
    return 2 * _EARTH_RADIUS_M * math.asin(math.sqrt(a))


def cumulative_distances(polyline: list[tuple[float, float]], closed: bool = False) -> list[float]:
    """Distance from vertex 0 to each vertex of the polyline.

    Always returns a list with `len(polyline)` entries. Index 0 is 0.0.
    When `closed=True` the last entry equals the perimeter (includes the
    closing segment from last back to first).
    """
    if len(polyline) < 2:
        return [0.0] * len(polyline)
    out = [0.0]
    for i in range(1, len(polyline)):
        a = polyline[i - 1]
        b = polyline[i]
        out.append(out[-1] + haversine_m(a[0], a[1], b[0], b[1]))
    if closed:
        last = polyline[-1]
        first = polyline[0]
        out.append(out[-1] + haversine_m(last[0], last[1], first[0], first[1]))
        # NOTE: when closed, len(out) == len(polyline) + 1; callers using
        # the last element as "total" must aware of that. For callers that
        # just want per-vertex distances, slice to len(polyline).
    return out


def total_length_m(polyline: list[tuple[float, float]], closed: bool = False) -> float:
    """Total length in meters. For closed loops, includes the closing segment."""
    if len(polyline) < 2:
        return 0.0
    dists = cumulative_distances(polyline, closed=closed)
    return dists[-1]


def point_at_distance(
    polyline: list[tuple[float, float]],
    distance_m: float,
    closed: bool = False,
) -> tuple[float, float]:
    """Resolve a distance-along-polyline to a (lat, lon) point.

    Linear interpolation between vertices. For closed loops we wrap the
    distance into [0, total] before resolving, so callers can pass any
    positive number.
    """
    if len(polyline) == 0:
        raise ValueError("empty polyline")
    if len(polyline) == 1:
        return polyline[0]

    total = total_length_m(polyline, closed=closed)
    if total <= 0:
        return polyline[0]

    if closed:
        # Wrap into [0, total)
        distance_m = distance_m % total
    else:
        distance_m = max(0.0, min(distance_m, total))

    # Walk segments accumulating distance until we find the one containing
    # `distance_m`, then linearly interpolate inside it.
    cum = 0.0
    n = len(polyline)
    segments = n if closed else n - 1
    for i in range(segments):
        a = polyline[i]
        b = polyline[(i + 1) % n]
        seg = haversine_m(a[0], a[1], b[0], b[1])
        if seg <= 0:
            continue
        if cum + seg >= distance_m:
            t = (distance_m - cum) / seg
            return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
        cum += seg
    # Numeric fall-through (shouldn't happen unless rounding); snap to last.
    return polyline[-1] if not closed else polyline[0]


def snap_to_polyline(
    polyline: list[tuple[float, float]],
    point: tuple[float, float],
    closed: bool = False,
) -> tuple[float, tuple[float, float]]:
    """Find the closest point on the polyline to the given point.

    Returns `(distance_along_polyline_m, snapped_point)`. Used by the
    admin editor to convert "user clicked here" into "the sensor sits at
    distance X along the track".

    Algorithm: project the point onto each segment, pick the one with the
    smallest perpendicular distance. Approximate (we treat lat/lon as a
    local planar space for the projection — fine for sub-km circuits).
    """
    if len(polyline) < 2:
        return (0.0, polyline[0]) if polyline else (0.0, point)

    n = len(polyline)
    segments = n if closed else n - 1
    cum = 0.0
    best = None  # (perp_distance_sq, distance_along, snapped)

    for i in range(segments):
        a = polyline[i]
        b = polyline[(i + 1) % n]
        seg_len = haversine_m(a[0], a[1], b[0], b[1])
        if seg_len <= 0:
            continue
        # Local planar projection: treat (lat, lon) as Cartesian after a
        # rough scale correction for longitude near this lat.
        lat_scale = 1.0
        lon_scale = math.cos(math.radians((a[0] + b[0]) / 2))
        ax, ay = a[1] * lon_scale, a[0] * lat_scale
        bx, by = b[1] * lon_scale, b[0] * lat_scale
        px, py = point[1] * lon_scale, point[0] * lat_scale
        dx = bx - ax
        dy = by - ay
        denom = dx * dx + dy * dy
        if denom == 0:
            t = 0.0
        else:
            t = ((px - ax) * dx + (py - ay) * dy) / denom
            t = max(0.0, min(1.0, t))
        sx = ax + dx * t
        sy = ay + dy * t
        perp_sq = (sx - px) ** 2 + (sy - py) ** 2
        snapped_point = (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
        distance_along = cum + seg_len * t
        if best is None or perp_sq < best[0]:
            best = (perp_sq, distance_along, snapped_point)
        cum += seg_len

    return (best[1], best[2]) if best else (0.0, polyline[0])


def effective_distance_forward(progress_m: float, direction: str, total_m: float) -> float:
    """Translate a progress value into "forward distance from meta".

    When `direction == "reversed"`, the kart is physically moving in the
    opposite direction, so its progress along the canonical (forward)
    polyline goes from `total_m` → 0 as the race advances. We mirror it
    here so all downstream code (interpolation, sector resolution) keeps
    using forward distances.
    """
    if total_m <= 0:
        return 0.0
    if direction == "reversed":
        return (total_m - progress_m) % total_m
    return progress_m % total_m


def validate_polyline_json(raw: object) -> list[tuple[float, float]]:
    """Parse a JSON-decoded polyline payload from the admin editor.

    Accepts `[[lat, lon], [lat, lon], ...]` with floats in lat∈[-90,90]
    and lon∈[-180,180]. Returns a list of tuples. Raises ValueError on
    anything malformed.
    """
    if not isinstance(raw, list):
        raise ValueError("polyline must be a list of [lat, lon] pairs")
    out: list[tuple[float, float]] = []
    for i, pt in enumerate(raw):
        if not isinstance(pt, (list, tuple)) or len(pt) != 2:
            raise ValueError(f"point {i}: expected [lat, lon] pair")
        try:
            lat = float(pt[0])
            lon = float(pt[1])
        except (TypeError, ValueError):
            raise ValueError(f"point {i}: lat/lon must be numbers")
        if not (-90.0 <= lat <= 90.0):
            raise ValueError(f"point {i}: lat out of range")
        if not (-180.0 <= lon <= 180.0):
            raise ValueError(f"point {i}: lon out of range")
        out.append((lat, lon))
    return out
