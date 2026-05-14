/**
 * Helpers to bridge our lat/lon polyline data model with the SVG
 * `offset-path`-based renderer (`TrackMapSVG`).
 *
 * Why this exists
 * ----------------
 * Apex Timing renders each circuit as an SVG with three layers (image,
 * track paths, drivers) and animates karts with the CSS properties
 * `offset-path` + `offset-distance`. That gives smooth curvilinear
 * motion at 60 fps with zero JS per frame — much better than our
 * previous Leaflet `setLatLng` approach, which interpolates LINEARLY
 * in screen space between consecutive lat/lon updates and visibly
 * "cuts" across curves when consecutive polyline vertices are sparse.
 *
 * We don't yet have a visual editor to draw hand-crafted SVG paths,
 * so for circuits without explicit `svgPaths` we auto-derive them
 * from the existing `trackPolyline`. The rendering improvement comes
 * for free from `offset-path` (the marker is always pinned to the
 * path even between ticks) — geometric accuracy still depends on the
 * underlying polyline.
 *
 * Coordinate system
 * -----------------
 * Karting circuits are small enough (< 1 km) that a flat equirect
 * projection is indistinguishable from a proper Mercator at this
 * scale. We pick a local origin = (minLat, minLon) of the polyline
 * bounds and project:
 *   x = (lon - minLon) * cos(meanLat) * METERS_PER_DEG_LAT
 *   y = (maxLat - lat) * METERS_PER_DEG_LAT          [Y is inverted
 *                                                    so north is up]
 * Both x and y end up in METERS relative to the bounds. We then add
 * a fixed padding margin so the kart markers don't render on the
 * very edge of the viewBox.
 */
export const METERS_PER_DEG_LAT = 111_320; // good enough for any kart track

/** Bounds in lat/lon. */
export interface LatLonBounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export function polylineBounds(polyline: [number, number][]): LatLonBounds {
  let minLat = Infinity, maxLat = -Infinity;
  let minLon = Infinity, maxLon = -Infinity;
  for (const [lat, lon] of polyline) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  }
  return { minLat, maxLat, minLon, maxLon };
}

/** Project a single (lat, lon) into the SVG-local frame in METERS,
 *  relative to the bounds' SW corner. Returns [x, y]. */
export function projectLatLon(
  lat: number,
  lon: number,
  bounds: LatLonBounds,
): [number, number] {
  const meanLatRad = ((bounds.minLat + bounds.maxLat) / 2) * Math.PI / 180;
  const cosLat = Math.cos(meanLatRad);
  const x = (lon - bounds.minLon) * cosLat * METERS_PER_DEG_LAT;
  // SVG Y axis grows DOWN; lat grows NORTH. Invert so north is up.
  const y = (bounds.maxLat - lat) * METERS_PER_DEG_LAT;
  return [x, y];
}

/** Auto-generate an SVG `d` path from a lat/lon polyline. Closed paths
 *  get a trailing `Z`. We use line segments (`L`) rather than cubic
 *  smoothing — the polyline already has whatever vertex density the
 *  operator traced, and `offset-path` will follow each segment
 *  faithfully. Smoothing would only mask the underlying geometry. */
export function polylineToSvgPath(
  polyline: [number, number][],
  bounds: LatLonBounds,
  closed: boolean = true,
): string {
  if (polyline.length === 0) return "";
  const parts: string[] = [];
  for (let i = 0; i < polyline.length; i++) {
    const [x, y] = projectLatLon(polyline[i][0], polyline[i][1], bounds);
    parts.push(`${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  if (closed) parts.push("Z");
  return parts.join(" ");
}

/** Compute the SVG viewBox for a polyline with `paddingM` meters of
 *  padding on each side. The viewBox is expressed in METERS (because
 *  `projectLatLon` returns meters), so a 707 m circuit ends up with a
 *  viewBox of roughly the order of magnitude of the bounds + padding.
 *  Returns `"x y w h"`. */
export function viewBoxForBounds(
  bounds: LatLonBounds,
  paddingM: number = 30,
): string {
  const meanLatRad = ((bounds.minLat + bounds.maxLat) / 2) * Math.PI / 180;
  const widthM = (bounds.maxLon - bounds.minLon) * Math.cos(meanLatRad) * METERS_PER_DEG_LAT;
  const heightM = (bounds.maxLat - bounds.minLat) * METERS_PER_DEG_LAT;
  return `${-paddingM} ${-paddingM} ${widthM + 2 * paddingM} ${heightM + 2 * paddingM}`;
}

/** One-shot: given a polyline, return both the viewBox and the path
 *  `d` string ready to drop into an SVG. Used when a circuit hasn't
 *  yet been migrated to hand-drawn SVG paths. */
export function autoSvgFromPolyline(
  polyline: [number, number][],
  closed: boolean = true,
  paddingM: number = 30,
): { viewBox: string; d: string; bounds: LatLonBounds } {
  const bounds = polylineBounds(polyline);
  return {
    viewBox: viewBoxForBounds(bounds, paddingM),
    d: polylineToSvgPath(polyline, bounds, closed),
    bounds,
  };
}

/** Same projection a kart needs: lat/lon → SVG-local meters. Exposed
 *  so callers can place free-floating markers (PIT-IN, PIT-OUT, etc.)
 *  consistently with the auto-generated `track` path. */
export function projectForBounds(
  bounds: LatLonBounds,
): (lat: number, lon: number) => [number, number] {
  return (lat, lon) => projectLatLon(lat, lon, bounds);
}
