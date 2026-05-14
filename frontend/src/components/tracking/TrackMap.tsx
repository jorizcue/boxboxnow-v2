"use client";

/**
 * Leaflet-based live tracking map. Draws:
 *
 *  1. Satellite tile layer (Esri WorldImagery — free, no key required).
 *  2. Main track polyline as a thick gray-green ribbon.
 *  3. Pit lane polyline as a dashed thinner ribbon (when configured).
 *  4. Sector tick marks (S1, S2, S3) + meta checkered marker.
 *  5. One marker per kart, colored by tier, with the kart number on top.
 *  6. Halo on my kart for quick identification regardless of tier.
 *  7. Pit-lane markers when a kart is "in_pit" (parked at pit_box position).
 *
 * Live updates: this component is dumb — it re-renders on every store
 * snapshot + every countdown tick (10 Hz). Position resolution per kart
 * is `computeKartProgressM` (see `lib/kartPosition.ts`). The map uses
 * Leaflet's vector-layer batch updates so even 30 markers tick smoothly.
 *
 * No drag/zoom controls beyond defaults — the strategist isn't expected
 * to pan around mid-race; the camera auto-fits the polyline on mount.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type { KartState, TrackConfig } from "@/types/race";
import { pointAtDistance, effectiveDistanceForward } from "@/lib/polyline";
import { computeKartProgressM, isKartInPit } from "@/lib/kartPosition";
import { KartPopup } from "./KartPopup";

// Tier color resolver — mirrors `lib/formatters.ts::tierColorClass`
// but returns the hex (Leaflet doesn't speak Tailwind classes).
function tierColor(score: number | undefined): string {
  const s = score ?? 0;
  if (s >= 100) return "#9fe556";  // tier-100
  if (s >= 75)  return "#c8e946";  // tier-75
  if (s >= 50)  return "#e5d43a";  // tier-50
  if (s >= 25)  return "#e59a2e";  // tier-25
  return "#e54444";                 // tier-1
}

// A kart with too-dark a fill needs white digits to stay readable.
function textColorForBg(bg: string): string {
  // Empirical: only the rojo tier needs white text.
  return bg === "#e54444" ? "#fff" : "#000";
}

interface Props {
  trackConfig: TrackConfig;
  karts: KartState[];
  myKartNumber: number;
  countdownMs: number;
  selectedKart: number | null;
  onSelectKart: (k: number | null) => void;
  // Effective race direction (override from TrackingTab top bar OR
  // trackConfig.defaultDirection). Passed in so the map and the side
  // panel always agree on the sentido that's currently active.
  direction: "forward" | "reversed";
}

export function TrackMap({
  trackConfig,
  karts,
  myKartNumber,
  countdownMs,
  selectedKart,
  onSelectKart,
  direction,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layerRefs = useRef<{ markers: Map<number, any>; polyline: any; pitLane: any; sectors: any[] }>({
    markers: new Map(),
    polyline: null,
    pitLane: null,
    sectors: [],
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [L, setL] = useState<any>(null);

  // Load Leaflet on the client (the package only works in browser).
  useEffect(() => {
    (async () => {
      const mod = await import("leaflet");
      setL(mod.default);
    })();
  }, []);

  // Initialize the map once Leaflet is loaded and the container exists.
  useEffect(() => {
    if (!L || !containerRef.current || mapRef.current) return;
    const polyline = trackConfig.trackPolyline;
    if (!polyline || polyline.length < 2) return;

    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: true,
      preferCanvas: true,  // canvas renderer is faster for many markers
    });
    mapRef.current = map;

    // Esri WorldImagery is free, no API key. Attribution required per
    // their license (also OSM contributors when used).
    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        attribution: "Imagery © Esri",
        maxZoom: 19,
      },
    ).addTo(map);

    // Fit camera to the polyline bounds with a small padding.
    const bounds = L.latLngBounds(polyline.map((p) => L.latLng(p[0], p[1])));
    map.fitBounds(bounds, { padding: [30, 30] });

    return () => {
      map.remove();
      mapRef.current = null;
      layerRefs.current = { markers: new Map(), polyline: null, pitLane: null, sectors: [] };
    };
  }, [L, trackConfig.trackPolyline]);

  // Draw the static track + pit lane + sector marks. Re-runs when the
  // track config changes (rare — only after admin edits + reload).
  useEffect(() => {
    if (!L || !mapRef.current) return;
    const map = mapRef.current;
    const refs = layerRefs.current;

    // Clear previous
    if (refs.polyline) { map.removeLayer(refs.polyline); refs.polyline = null; }
    if (refs.pitLane)  { map.removeLayer(refs.pitLane);  refs.pitLane  = null; }
    for (const s of refs.sectors) map.removeLayer(s);
    refs.sectors = [];

    if (trackConfig.trackPolyline) {
      // Main track ribbon: outer thick gray + inner thinner ribbon
      // gives the "highway" look.
      refs.polyline = L.polyline(trackConfig.trackPolyline, {
        color: "#3a3a3a",
        weight: 12,
        opacity: 0.9,
        lineCap: "round",
        lineJoin: "round",
      }).addTo(map);
      // A faint center line over the ribbon for direction-of-travel hint.
      L.polyline(trackConfig.trackPolyline, {
        color: "#ffffff",
        weight: 1,
        opacity: 0.15,
        dashArray: "4,8",
      }).addTo(map);
    }

    if (trackConfig.pitLanePolyline) {
      refs.pitLane = L.polyline(trackConfig.pitLanePolyline, {
        color: "#2a2a2a",
        weight: 7,
        opacity: 0.7,
        dashArray: "2,4",
        lineCap: "round",
        lineJoin: "round",
      }).addTo(map);
    }

    // Sector + meta markers. Tiny circles + label. Distance is mapped
    // through `effectiveDistanceForward(direction, …)` so the sensors
    // visually flip along with the active sentido without touching the
    // stored values.
    const drawSensorTick = (distanceM: number | null, label: string, color: string) => {
      if (distanceM == null || !trackConfig.trackPolyline || !trackConfig.trackLengthM) return;
      const dist = effectiveDistanceForward(distanceM, direction, trackConfig.trackLengthM);
      const pt = pointAtDistance(trackConfig.trackPolyline, dist, true);
      const marker = L.circleMarker([pt[0], pt[1]], {
        radius: 5,
        color,
        weight: 2,
        fillColor: "#000",
        fillOpacity: 1,
      }).bindTooltip(label, { permanent: true, direction: "top", className: "track-sensor-tooltip" }).addTo(map);
      refs.sectors.push(marker);
    };
    // META at the operator-defined distance (0 = polyline[0], which is
    // the default — but venues with the start/finish line in the middle
    // of a straight rather than at a vertex use a non-zero offset).
    drawSensorTick(trackConfig.metaDistanceM ?? 0, "META", "#fff");
    drawSensorTick(trackConfig.s1DistanceM, "S1", "#9fe556");
    drawSensorTick(trackConfig.s2DistanceM, "S2", "#9fe556");
    drawSensorTick(trackConfig.s3DistanceM, "S3", "#9fe556");

    // Pit-in / pit-out: prefer the free lat/lon (placed by the operator
    // on the physical sensor) and fall back to the legacy
    // distance-along-polyline value when not yet migrated.
    const drawFreeTick = (latLon: [number, number] | null, label: string, color: string) => {
      if (!latLon) return;
      const marker = L.circleMarker([latLon[0], latLon[1]], {
        radius: 5,
        color,
        weight: 2,
        fillColor: "#000",
        fillOpacity: 1,
      }).bindTooltip(label, { permanent: true, direction: "top", className: "track-sensor-tooltip" }).addTo(map);
      refs.sectors.push(marker);
    };
    if (trackConfig.pitEntryLat != null && trackConfig.pitEntryLon != null) {
      drawFreeTick([trackConfig.pitEntryLat, trackConfig.pitEntryLon], "PIT-IN", "#e59a2e");
    } else {
      drawSensorTick(trackConfig.pitEntryDistanceM, "PIT-IN", "#e59a2e");
    }
    if (trackConfig.pitExitLat != null && trackConfig.pitExitLon != null) {
      drawFreeTick([trackConfig.pitExitLat, trackConfig.pitExitLon], "PIT-OUT", "#e59a2e");
    } else {
      drawSensorTick(trackConfig.pitExitDistanceM, "PIT-OUT", "#e59a2e");
    }
  }, [L, trackConfig, direction]);

  // Update kart markers on every render — cheap because we mutate
  // existing markers instead of recreating them.
  useEffect(() => {
    if (!L || !mapRef.current || !trackConfig.trackPolyline || !trackConfig.trackLengthM) return;
    const map = mapRef.current;
    const refs = layerRefs.current;

    const seenKarts = new Set<number>();
    for (const kart of karts) {
      const isPit = isKartInPit(kart);
      let latlon: [number, number] | null = null;

      if (isPit) {
        // Park on pit_lane at pit_box position, if both are configured.
        if (trackConfig.pitLanePolyline && trackConfig.pitBoxDistanceM != null) {
          latlon = pointAtDistance(trackConfig.pitLanePolyline, trackConfig.pitBoxDistanceM, false);
        }
      } else {
        const progress = computeKartProgressM(kart, trackConfig, countdownMs);
        if (progress != null) {
          const forwardDist = effectiveDistanceForward(progress, direction, trackConfig.trackLengthM);
          latlon = pointAtDistance(trackConfig.trackPolyline, forwardDist, true);
        }
      }

      if (!latlon) continue;
      seenKarts.add(kart.kartNumber);

      const isMine = kart.kartNumber === myKartNumber;
      const fill = tierColor(kart.tierScore);
      const text = textColorForBg(fill);

      const html = `
        <div style="position:relative; width:30px; height:30px;">
          ${isMine ? `<div style="position:absolute; inset:-4px; border-radius:50%; border:2px solid #9fe556; opacity:0.6;"></div>` : ""}
          <div style="
            position:absolute; inset:0;
            border-radius:50%;
            background:${fill};
            border:1.5px solid ${isMine ? "#fff" : "#000"};
            display:flex; align-items:center; justify-content:center;
            font-family: ui-monospace, 'SF Mono', monospace;
            font-size:11px; font-weight:700;
            color:${text};
            box-shadow: 0 2px 4px rgba(0,0,0,0.5);
            cursor: pointer;
          ">${kart.kartNumber}</div>
        </div>
      `;
      const icon = L.divIcon({
        html,
        className: "tracking-kart-icon",
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });

      const existing = refs.markers.get(kart.kartNumber);
      if (existing) {
        existing.setLatLng(latlon);
        existing.setIcon(icon);
      } else {
        const m = L.marker(latlon, { icon, interactive: true });
        m.on("click", () => onSelectKart(kart.kartNumber === selectedKart ? null : kart.kartNumber));
        m.addTo(map);
        refs.markers.set(kart.kartNumber, m);
      }
    }

    // Remove markers for karts that disappeared (rare during a session).
    Array.from(refs.markers.entries()).forEach(([num, marker]) => {
      if (!seenKarts.has(num)) {
        map.removeLayer(marker);
        refs.markers.delete(num);
      }
    });
  }, [L, karts, countdownMs, trackConfig, direction, myKartNumber, selectedKart, onSelectKart]);

  const popupKart = useMemo(
    () => karts.find((k) => k.kartNumber === selectedKart) ?? null,
    [karts, selectedKart],
  );

  return (
    <div className="relative">
      <div ref={containerRef} className="w-full h-[480px] rounded-lg overflow-hidden bg-black" />
      {popupKart && (
        <KartPopup
          kart={popupKart}
          isMine={popupKart.kartNumber === myKartNumber}
          onClose={() => onSelectKart(null)}
        />
      )}
    </div>
  );
}
