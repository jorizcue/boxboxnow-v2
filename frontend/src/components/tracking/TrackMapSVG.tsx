"use client";

/**
 * SVG-based live tracking renderer.
 *
 * This is the "Apex Timing-style" renderer (see investigation notes in
 * the git history): the circuit is drawn as a stack of SVG layers
 *
 *   ┌── <svg viewBox="…"> ───────────────────────────────────────┐
 *   │  <g class="image">   ← background image of the track       │
 *   │  <g class="track">   ← thick stroke following the polyline │
 *   │  <g class="drivers"> ← one <circle> per kart, animated via │
 *   │                         CSS offset-path / offset-distance  │
 *   └────────────────────────────────────────────────────────────┘
 *
 * and karts are pinned to the path with the modern CSS properties
 * `offset-path: path("…")` + `offset-distance: X%`. As long as we
 * supply a smooth path and re-anchor on every sensor/lap event, the
 * browser does sub-pixel curvilinear interpolation at 60 fps with
 * zero JS per frame.
 *
 * Compared to the Leaflet renderer (`TrackMap.tsx`):
 *   - Leaflet `setLatLng` interpolates LINEARLY in screen space
 *     between consecutive lat/lon updates, so the marker visibly
 *     "cuts" curves when the polyline vertices are sparse.
 *   - `offset-path` constrains the marker to stay ON the path at all
 *     times, including between ticks. No corner cutting.
 *
 * For circuits that have explicit hand-drawn `svg_paths.track` we use
 * that. Otherwise we auto-generate the path from the existing
 * `trackPolyline` (projected to a local equirect frame in metres).
 * The geometry is the same as Leaflet would draw — only the marker
 * movement is improved.
 *
 * Per-kart animation
 * ------------------
 * Each kart is a `<g>` with `offset-path` + `offset-distance`. The
 * distance is recomputed from `elapsed_since_anchor / lap_time` and
 * a CSS `transition: offset-distance Xms linear` smooths the value
 * between React ticks. The lap_time comes from `kart.lastLapMs`
 * (falls back to `avgLapMs`) — that's the most accurate single-number
 * estimate of the lap in progress, as discussed in earlier sessions.
 *
 * Race direction
 * --------------
 * `offset-distance` runs from 0 % (start of path) to 100 % (end of
 * path). For "reversed" direction the kart visits the path in the
 * opposite order, so we map percentage = 100 - normal_percentage.
 *
 * In-pit karts
 * ------------
 * Rendered at a fixed (lat/lon) → SVG point via `pit_entry_lat/lon`
 * with a small vertical fan so multiple in-pit karts don't fully
 * overlap. The fan uses the same +3 m offset trick as the Leaflet
 * renderer.
 */
import { useMemo } from "react";
import type { KartState, TrackConfig } from "@/types/race";
import {
  autoSvgFromPolyline,
  projectLatLon,
  polylineBounds,
  type LatLonBounds,
} from "@/lib/svgPath";
import { isKartInPit } from "@/lib/kartPosition";

function tierColor(score: number | undefined): string {
  const s = score ?? 0;
  if (s >= 100) return "#9fe556";
  if (s >= 75) return "#c8e946";
  if (s >= 50) return "#e5d43a";
  if (s >= 25) return "#e59a2e";
  return "#e54444";
}

function textColorForBg(bg: string): string {
  return bg === "#e54444" ? "#fff" : "#000";
}

interface Props {
  trackConfig: TrackConfig;
  karts: KartState[];
  myKartNumber: number;
  countdownMs: number;
  selectedKart: number | null;
  onSelectKart: (k: number | null) => void;
  direction: "forward" | "reversed";
}

/** Resolve the path used to constrain a kart's motion AND the duration
 *  of one full traversal of that path. For now we always use the
 *  full-lap "track" path with lap-time duration: sectors are deferred
 *  until we have hand-drawn per-segment paths and a per-segment
 *  duration estimate from `lastSectorCountdownMs` deltas. */
function resolveSegment(
  kart: KartState,
  trackPath: string,
  lapMs: number,
): { d: string; durationMs: number } {
  // `lapMs` is already the kart's best single-number lap estimate; the
  // caller picked it (lastLapMs → avgLapMs → 0 fallback handled below).
  return { d: trackPath, durationMs: lapMs };
}

/** Compute the 0…100 percentage along the kart's current segment. */
function progressPercent(
  kart: KartState,
  countdownMs: number,
  durationMs: number,
  direction: "forward" | "reversed",
): number {
  const anchor = kart.lastLapCompleteCountdownMs ?? 0;
  if (anchor <= 0 || durationMs <= 0) return 0;
  const elapsed = Math.max(0, anchor - countdownMs);
  // Hard cap at 99.5 % so the marker doesn't visually finish the lap
  // before the LAP event lands and trigger a backward snap on event
  // arrival.
  const raw = Math.min(0.995, elapsed / durationMs);
  return direction === "reversed" ? (1 - raw) * 100 : raw * 100;
}

export function TrackMapSVG({
  trackConfig,
  karts,
  myKartNumber,
  countdownMs,
  selectedKart,
  onSelectKart,
  direction,
}: Props) {
  // Resolve geometry once per trackConfig change. If the operator has
  // configured `svg_viewbox` + `svg_paths.track` we use those verbatim.
  // Otherwise we derive both from the lat/lon polyline.
  const geom = useMemo(() => {
    const polyline = trackConfig.trackPolyline;
    if (trackConfig.svgViewbox && trackConfig.svgPaths?.track) {
      return {
        viewBox: trackConfig.svgViewbox,
        trackPath: trackConfig.svgPaths.track,
        bounds: polyline ? polylineBounds(polyline) : null,
        autoGenerated: false,
      };
    }
    if (polyline && polyline.length >= 2) {
      const { viewBox, d, bounds } = autoSvgFromPolyline(polyline, true, 30);
      return { viewBox, trackPath: d, bounds, autoGenerated: true };
    }
    return { viewBox: "0 0 800 600", trackPath: "", bounds: null, autoGenerated: true };
  }, [trackConfig.svgViewbox, trackConfig.svgPaths, trackConfig.trackPolyline]);

  // Pit-in / pit-out / META in SVG coords (for the static markers).
  const sensorPoints = useMemo(() => {
    if (!geom.bounds) return { meta: null, pitIn: null, pitOut: null };
    const proj = (lat: number, lon: number) => projectLatLon(lat, lon, geom.bounds as LatLonBounds);
    const polyline = trackConfig.trackPolyline;
    let meta: [number, number] | null = null;
    if (polyline && polyline.length > 0) {
      // META on the polyline at `metaDistanceM`. We don't reuse the
      // backend's pointAtDistance here for simplicity: vertex 0 is a
      // good-enough proxy for circuits where metaDistanceM is small,
      // and for circuits with a non-zero offset the operator will
      // eventually trace the SVG path with META at the path's start.
      const [lat, lon] = polyline[0];
      meta = proj(lat, lon);
    }
    const pitIn = trackConfig.pitEntryLat != null && trackConfig.pitEntryLon != null
      ? proj(trackConfig.pitEntryLat, trackConfig.pitEntryLon)
      : null;
    const pitOut = trackConfig.pitExitLat != null && trackConfig.pitExitLon != null
      ? proj(trackConfig.pitExitLat, trackConfig.pitExitLon)
      : null;
    return { meta, pitIn, pitOut };
  }, [geom.bounds, trackConfig]);

  // Kart positions on every render. The expensive geometry is memoised
  // above; this loop is cheap arithmetic per kart.
  const kartRows = useMemo(() => {
    let pitFanIdx = 0;
    return karts
      .filter((k) => k.kartNumber > 0)
      .map((kart) => {
        const isPit = isKartInPit(kart);
        const lapMs = kart.lastLapMs > 0 ? kart.lastLapMs : (kart.avgLapMs > 0 ? kart.avgLapMs : 0);
        const seg = resolveSegment(kart, geom.trackPath, lapMs);
        const pct = progressPercent(kart, countdownMs, seg.durationMs, direction);
        // In-pit overrides everything: stack at the pit-in lat/lon (in
        // SVG coords) with a small fan offset.
        let pitOffsetY: number | null = null;
        if (isPit) {
          pitOffsetY = pitFanIdx * 10; // 10 SVG units per kart
          pitFanIdx += 1;
        }
        return { kart, isPit, segD: seg.d, pct, pitOffsetY };
      });
  }, [karts, geom.trackPath, countdownMs, direction]);

  return (
    <div className="relative">
      <svg
        viewBox={geom.viewBox}
        preserveAspectRatio="xMidYMid meet"
        className="w-full h-[480px] bg-black rounded-lg overflow-hidden"
        style={{ display: "block" }}
      >
        {/* Layer 1: background image of the track. Only rendered if
            the operator has set one. */}
        {trackConfig.svgImageUrl ? (
          <image
            href={trackConfig.svgImageUrl}
            x="0"
            y="0"
            width="100%"
            height="100%"
            preserveAspectRatio="xMidYMid meet"
            style={{ opacity: 0.95 }}
          />
        ) : null}

        {/* Layer 2: track stroke. Two stacked paths give the "highway"
            look (thick dark + thin light center stripe), same as the
            Leaflet renderer. */}
        {geom.trackPath ? (
          <>
            <path
              d={geom.trackPath}
              fill="none"
              stroke="#3a3a3a"
              strokeWidth={9}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.9}
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={geom.trackPath}
              fill="none"
              stroke="#ffffff"
              strokeWidth={1}
              strokeDasharray="4 8"
              opacity={0.15}
              vectorEffect="non-scaling-stroke"
            />
          </>
        ) : null}

        {/* Sensor markers — same dot+tooltip vibe as the Leaflet view. */}
        {sensorPoints.meta && (
          <g transform={`translate(${sensorPoints.meta[0]} ${sensorPoints.meta[1]})`}>
            <circle r={4} fill="#000" stroke="#fff" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            <text y={-8} textAnchor="middle" fontSize={9} fill="#fff"
                  style={{ paintOrder: "stroke", stroke: "#000", strokeWidth: 3 }}>META</text>
          </g>
        )}
        {sensorPoints.pitIn && (
          <g transform={`translate(${sensorPoints.pitIn[0]} ${sensorPoints.pitIn[1]})`}>
            <circle r={4} fill="#000" stroke="#e59a2e" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            <text y={-8} textAnchor="middle" fontSize={9} fill="#e59a2e"
                  style={{ paintOrder: "stroke", stroke: "#000", strokeWidth: 3 }}>PIT-IN</text>
          </g>
        )}
        {sensorPoints.pitOut && (
          <g transform={`translate(${sensorPoints.pitOut[0]} ${sensorPoints.pitOut[1]})`}>
            <circle r={4} fill="#000" stroke="#e59a2e" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            <text y={-8} textAnchor="middle" fontSize={9} fill="#e59a2e"
                  style={{ paintOrder: "stroke", stroke: "#000", strokeWidth: 3 }}>PIT-OUT</text>
          </g>
        )}

        {/* Layer 3: drivers. Each kart is a <g> with offset-path so it
            stays pinned to the track. The CSS transition on
            offset-distance smooths motion between React re-renders. */}
        <g>
          {kartRows.map(({ kart, isPit, segD, pct, pitOffsetY }) => {
            const isMine = kart.kartNumber === myKartNumber;
            const isSelected = kart.kartNumber === selectedKart;
            const fill = tierColor(kart.tierScore);
            const text = textColorForBg(fill);

            // In-pit karts: fixed lat/lon location with vertical fan.
            if (isPit && sensorPoints.pitIn) {
              const [x, y] = sensorPoints.pitIn;
              return (
                <g
                  key={kart.kartNumber}
                  transform={`translate(${x} ${y + (pitOffsetY ?? 0)})`}
                  style={{ cursor: "pointer" }}
                  onClick={() => onSelectKart(isSelected ? null : kart.kartNumber)}
                >
                  <circle r={6} fill={fill} stroke="#000" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
                  <text textAnchor="middle" dominantBaseline="central" fontSize={7} fontWeight={700} fill={text}
                        style={{ pointerEvents: "none" }}>{kart.kartNumber}</text>
                </g>
              );
            }

            // On-track karts: ride the path via offset-path. We wrap
            // the <g> with the offset properties; children are placed
            // relative to (0,0) which is where offset-path "drops" us.
            return (
              <g
                key={kart.kartNumber}
                className="tracking-svg-kart"
                style={{
                  offsetPath: segD ? `path("${segD}")` : undefined,
                  offsetDistance: `${pct.toFixed(3)}%`,
                  transition: "offset-distance 220ms linear",
                  cursor: "pointer",
                }}
                onClick={() => onSelectKart(isSelected ? null : kart.kartNumber)}
              >
                {isMine && (
                  <circle r={9} fill="none" stroke="#9fe556" strokeWidth={1.5} opacity={0.6}
                          vectorEffect="non-scaling-stroke" />
                )}
                <circle r={6} fill={fill} stroke={isMine ? "#fff" : "#000"} strokeWidth={1.2}
                        vectorEffect="non-scaling-stroke" />
                <text textAnchor="middle" dominantBaseline="central" fontSize={7} fontWeight={700} fill={text}
                      style={{ pointerEvents: "none" }}>{kart.kartNumber}</text>
              </g>
            );
          })}
        </g>
      </svg>

      {/* Tiny corner badge so the operator knows which renderer is
          active. Helps when debugging "looks the same as before". */}
      <div className="absolute top-1 right-1 text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-black/70 text-accent border border-accent/40">
        SVG {geom.autoGenerated ? "(auto)" : "(custom)"}
      </div>
    </div>
  );
}
