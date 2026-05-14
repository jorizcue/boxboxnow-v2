"use client";

/**
 * Admin-side editor for a circuit's track config. Uses Leaflet +
 * Leaflet-Geoman for the drawing/editing primitives (gratis, MIT).
 *
 * Workflow:
 *   1. Operator opens the editor — Leaflet loads with the satellite
 *      tile, centered on the circuit's `finish_lat1/lon1` if known.
 *   2. Optional: "Importar de OSM" — server-side Overpass query that
 *      returns a candidate polyline. We hydrate the editor with it
 *      and the operator can refine vertices.
 *   3. Operator chooses "Trazar pista" → click-drag a polygon (closed).
 *   4. Once the polyline exists, six "place marker" buttons activate
 *      placement mode for Meta / S1 / S2 / S3 / Pit-in / Pit-out /
 *      Pit-box. Click snaps to the nearest point on the corresponding
 *      polyline (track for sensors, pit lane for the box).
 *   5. Optional: "Trazar pit lane" → another polyline (open).
 *   6. Save → PUT /api/admin/circuits/{id}/track-config.
 *
 * Everything is one Leaflet map. Sensor markers ride on top of the
 * polyline and update when vertices move.
 *
 * State is local to the editor; we only hit the API on load + save.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import type { TrackConfig } from "@/types/race";
import { snapToPolyline } from "@/lib/polyline";

type MarkerKey = "meta" | "s1" | "s2" | "s3" | "pitIn" | "pitOut" | "pitBox";

interface Props {
  circuitId: number;
  onClose: () => void;
}

export function TrackEditor({ circuitId, onClose }: Props) {
  const t = useT();
  const containerRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const trackLayerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pitLaneLayerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markerLayersRef = useRef<Record<MarkerKey, any>>({} as Record<MarkerKey, any>);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [L, setL] = useState<any>(null);

  const [trackPolyline, setTrackPolyline] = useState<[number, number][] | null>(null);
  const [pitLanePolyline, setPitLanePolyline] = useState<[number, number][] | null>(null);
  // Distances stored along their respective polyline:
  //   meta, s1, s2, s3 → track polyline
  //   pitBox → pit lane polyline
  const [markerDistances, setMarkerDistances] = useState<Record<"meta" | "s1" | "s2" | "s3" | "pitBox", number | null>>({
    meta: 0, s1: null, s2: null, s3: null, pitBox: null,
  });
  // Pit-in / pit-out: free [lat, lon] (no snap). The pit sensors are
  // physically slightly off the racing line and the operator wants
  // the marker exactly where the sensor is, not snapped back to the
  // polyline.
  const [pitInLatLon, setPitInLatLon] = useState<[number, number] | null>(null);
  const [pitOutLatLon, setPitOutLatLon] = useState<[number, number] | null>(null);
  const [direction, setDirection] = useState<"forward" | "reversed">("forward");
  const [placingMarker, setPlacingMarker] = useState<MarkerKey | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Boot Leaflet + initial fetch ──
  useEffect(() => {
    (async () => {
      const Lmod = await import("leaflet");
      await import("@geoman-io/leaflet-geoman-free");
      setL(Lmod.default);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const cfg = await api.adminGetTrackConfig(circuitId);
        if (cfg.trackPolyline) setTrackPolyline(cfg.trackPolyline as [number, number][]);
        if (cfg.pitLanePolyline) setPitLanePolyline(cfg.pitLanePolyline as [number, number][]);
        setMarkerDistances({
          meta: cfg.metaDistanceM ?? 0,
          s1: cfg.s1DistanceM,
          s2: cfg.s2DistanceM,
          s3: cfg.s3DistanceM,
          pitBox: cfg.pitBoxDistanceM,
        });
        if (cfg.pitEntryLat != null && cfg.pitEntryLon != null) {
          setPitInLatLon([cfg.pitEntryLat, cfg.pitEntryLon]);
        }
        if (cfg.pitExitLat != null && cfg.pitExitLon != null) {
          setPitOutLatLon([cfg.pitExitLat, cfg.pitExitLon]);
        }
        setDirection(cfg.defaultDirection);
      } catch {
        // Empty editor — new circuit.
      }
    })();
  }, [circuitId]);

  // ── Initialize the map ──
  useEffect(() => {
    if (!L || !containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: true,
    }).setView([40.4168, -3.7038], 17);  // Madrid default; will pan when track loads
    mapRef.current = map;

    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { attribution: "Imagery © Esri", maxZoom: 19 },
    ).addTo(map);

    // Leaflet-Geoman global config — show only what we need.
    map.pm.addControls({
      position: "topleft",
      drawCircle: false,
      drawCircleMarker: false,
      drawText: false,
      drawRectangle: false,
      drawPolygon: false,    // track is a polyline (closed), not polygon
      drawPolyline: true,
      drawMarker: false,
      editControls: true,
      cutPolygon: false,
      rotateMode: false,
    });

    // When the operator finishes drawing a polyline, decide whether it
    // was the main track or the pit lane based on what's already set.
    map.on("pm:create", (e: { layer: { getLatLngs: () => { lat: number; lng: number }[]; remove: () => void } }) => {
      const latlngs = e.layer.getLatLngs();
      const pts: [number, number][] = latlngs.map((p) => [p.lat, p.lng]);
      // First polyline → main track (close it automatically by appending
      // the first vertex). Second → pit lane.
      if (!trackLayerRef.current) {
        // Close the loop
        if (pts.length >= 3 && (pts[0][0] !== pts[pts.length - 1][0] || pts[0][1] !== pts[pts.length - 1][1])) {
          pts.push([pts[0][0], pts[0][1]]);
        }
        setTrackPolyline(pts);
      } else {
        setPitLanePolyline(pts);
      }
      e.layer.remove();  // we manage the layer ourselves via React state
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [L]);

  // ── Render the main track polyline on the map (rebuild on state change) ──
  useEffect(() => {
    if (!L || !mapRef.current) return;
    const map = mapRef.current;
    if (trackLayerRef.current) {
      map.removeLayer(trackLayerRef.current);
      trackLayerRef.current = null;
    }
    if (trackPolyline && trackPolyline.length >= 2) {
      const layer = L.polyline(trackPolyline, {
        color: "#9fe556",
        weight: 8,
        opacity: 0.85,
        lineCap: "round",
        lineJoin: "round",
        pmIgnore: false,
      });
      layer.addTo(map);
      // Make it editable so the operator can drag vertices.
      layer.pm.enable({ allowSelfIntersection: false });
      layer.on("pm:edit", () => {
        const latlngs = layer.getLatLngs() as { lat: number; lng: number }[];
        setTrackPolyline(latlngs.map((p) => [p.lat, p.lng]));
      });
      trackLayerRef.current = layer;
      map.fitBounds(layer.getBounds(), { padding: [40, 40] });
    }
  }, [L, trackPolyline]);

  // ── Render the pit lane polyline ──
  useEffect(() => {
    if (!L || !mapRef.current) return;
    const map = mapRef.current;
    if (pitLaneLayerRef.current) {
      map.removeLayer(pitLaneLayerRef.current);
      pitLaneLayerRef.current = null;
    }
    if (pitLanePolyline && pitLanePolyline.length >= 2) {
      const layer = L.polyline(pitLanePolyline, {
        color: "#e59a2e",
        weight: 5,
        opacity: 0.85,
        dashArray: "6,8",
        pmIgnore: false,
      });
      layer.addTo(map);
      layer.pm.enable({ allowSelfIntersection: false });
      layer.on("pm:edit", () => {
        const latlngs = layer.getLatLngs() as { lat: number; lng: number }[];
        setPitLanePolyline(latlngs.map((p) => [p.lat, p.lng]));
      });
      pitLaneLayerRef.current = layer;
    }
  }, [L, pitLanePolyline]);

  // ── Render sensor markers on top ──
  useEffect(() => {
    if (!L || !mapRef.current) return;
    const map = mapRef.current;

    // Clear all existing
    for (const k of Object.keys(markerLayersRef.current) as MarkerKey[]) {
      const m = markerLayersRef.current[k];
      if (m) map.removeLayer(m);
      delete markerLayersRef.current[k];
    }

    const drawMarker = (key: MarkerKey, distanceM: number | null, label: string, color: string, polyline: [number, number][] | null, closed: boolean) => {
      if (distanceM == null || !polyline || polyline.length < 2) return;
      // Resolve distance → point. Reuse `pointAtDistance` logic via
      // dynamic import would be ideal; for now we just call it.
      import("@/lib/polyline").then(({ pointAtDistance }) => {
        const pt = pointAtDistance(polyline, distanceM, closed);
        const m = L.circleMarker([pt[0], pt[1]], {
          radius: 6, color, weight: 2, fillColor: "#000", fillOpacity: 1,
        }).bindTooltip(label, { permanent: true, direction: "top", offset: [0, -4] });
        m.addTo(map);
        markerLayersRef.current[key] = m;
      });
    };

    // Free lat/lon markers (pit-in / pit-out): the operator places them
    // where the physical sensor sits, which is usually slightly off the
    // racing line. Render directly at the saved coordinates without
    // snapping to the polyline.
    const drawFreeMarker = (key: MarkerKey, latLon: [number, number] | null, label: string, color: string) => {
      if (!latLon) return;
      const m = L.circleMarker([latLon[0], latLon[1]], {
        radius: 6, color, weight: 2, fillColor: "#000", fillOpacity: 1,
      }).bindTooltip(label, { permanent: true, direction: "top", offset: [0, -4] });
      m.addTo(map);
      markerLayersRef.current[key] = m;
    };

    drawMarker("meta", markerDistances.meta, "META", "#fff", trackPolyline, true);
    drawMarker("s1", markerDistances.s1, "S1", "#9fe556", trackPolyline, true);
    drawMarker("s2", markerDistances.s2, "S2", "#9fe556", trackPolyline, true);
    drawMarker("s3", markerDistances.s3, "S3", "#9fe556", trackPolyline, true);
    drawFreeMarker("pitIn", pitInLatLon, "PIT-IN", "#e59a2e");
    drawFreeMarker("pitOut", pitOutLatLon, "PIT-OUT", "#e59a2e");
    drawMarker("pitBox", markerDistances.pitBox, "BOX", "#888", pitLanePolyline, false);
  }, [L, markerDistances, pitInLatLon, pitOutLatLon, trackPolyline, pitLanePolyline]);

  // ── Placement mode: when active, the next map click positions the
  //    selected marker. Meta / S1 / S2 / S3 snap to the track polyline,
  //    pit-box snaps to the pit-lane polyline, and pit-in / pit-out are
  //    free (the physical sensor sits off the racing line).
  useEffect(() => {
    if (!L || !mapRef.current || !placingMarker) return;
    const map = mapRef.current;
    const handler = (e: { latlng: { lat: number; lng: number } }) => {
      // Pit-in / pit-out: store the raw click location (no snap).
      if (placingMarker === "pitIn") {
        setPitInLatLon([e.latlng.lat, e.latlng.lng]);
        setPlacingMarker(null);
        return;
      }
      if (placingMarker === "pitOut") {
        setPitOutLatLon([e.latlng.lat, e.latlng.lng]);
        setPlacingMarker(null);
        return;
      }
      // Everything else snaps to the appropriate polyline.
      const pl: [number, number][] | null = placingMarker === "pitBox" ? pitLanePolyline : trackPolyline;
      const closed = placingMarker !== "pitBox";
      if (!pl || pl.length < 2) return;
      const [dist] = snapToPolyline(pl, [e.latlng.lat, e.latlng.lng], closed);
      setMarkerDistances((prev) => ({ ...prev, [placingMarker as "meta" | "s1" | "s2" | "s3" | "pitBox"]: dist }));
      setPlacingMarker(null);
    };
    map.on("click", handler);
    return () => { map.off("click", handler); };
  }, [L, placingMarker, trackPolyline, pitLanePolyline]);

  const handleImportOsm = useCallback(async () => {
    setImporting(true);
    setImportMsg(null);
    try {
      const res = await api.adminImportOsm(circuitId);
      if (!res.polyline || res.polyline.length < 4) {
        setImportMsg(t("admin.tracking.osmNoMatch"));
      } else {
        const pts = res.polyline as [number, number][];
        // Close the loop
        if (pts[0][0] !== pts[pts.length - 1][0] || pts[0][1] !== pts[pts.length - 1][1]) {
          pts.push([pts[0][0], pts[0][1]]);
        }
        setTrackPolyline(pts);
        setImportMsg(null);
      }
    } catch (e) {
      // The backend returns 400 with a clear Spanish message when a
      // prerequisite is missing (e.g. circuit has no finish-line
      // coordinates configured yet). Surface that message verbatim
      // instead of the generic "OSM no responde", which only really
      // applies to network / 5xx failures. `fetchApi` already extracts
      // `detail` from the FastAPI response into `error.message`.
      const err = e as { message?: string };
      const msg = err?.message ?? "";
      // Heuristic: any "configura primero..." / "finish" mention is a
      // 400 from our own validator. Anything else looks like a network
      // / Overpass outage and gets the generic OSM-down message.
      if (msg && (msg.toLowerCase().includes("configura") || msg.toLowerCase().includes("meta") || msg.toLowerCase().includes("finish"))) {
        setImportMsg(msg);
      } else {
        setImportMsg(msg || t("admin.tracking.osmError"));
      }
    } finally {
      setImporting(false);
    }
  }, [circuitId, t]);

  const handleClearTrack = () => {
    setTrackPolyline(null);
    setMarkerDistances({ meta: 0, s1: null, s2: null, s3: null, pitBox: null });
    setPitInLatLon(null);
    setPitOutLatLon(null);
  };

  const handleClearPitLane = () => {
    setPitLanePolyline(null);
    setMarkerDistances((prev) => ({ ...prev, pitBox: null }));
  };

  const handleSave = async () => {
    setError(null);
    if (!trackPolyline || trackPolyline.length < 4) {
      setError(t("admin.tracking.minPolylinePoints"));
      return;
    }
    setSaving(true);
    try {
      await api.adminSaveTrackConfig(circuitId, {
        trackPolyline,
        pitLanePolyline,
        s1DistanceM: markerDistances.s1,
        s2DistanceM: markerDistances.s2,
        s3DistanceM: markerDistances.s3,
        // Pit-in / pit-out: free lat/lon (off-polyline). When the
        // operator clears them via the X button they go to null, which
        // the backend stores as NULL — TrackMap falls back to the old
        // distance-based fields in that case.
        pitEntryLat: pitInLatLon ? pitInLatLon[0] : null,
        pitEntryLon: pitInLatLon ? pitInLatLon[1] : null,
        pitExitLat: pitOutLatLon ? pitOutLatLon[0] : null,
        pitExitLon: pitOutLatLon ? pitOutLatLon[1] : null,
        pitBoxDistanceM: markerDistances.pitBox,
        // Meta as forward-distance from polyline[0]. 0 = META coincides
        // with the first vertex (default). Persisted so the kart
        // interpolator can anchor at META on every LAP event.
        metaDistanceM: markerDistances.meta ?? 0,
        defaultDirection: direction,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      const err = e as { message?: string };
      setError(err?.message ?? t("admin.tracking.error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-white">{t("admin.tracking.title")}</h3>
        <button
          onClick={onClose}
          className="text-xs text-neutral-400 hover:text-white"
        >
          ← {t("common.close")}
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={handleImportOsm}
          disabled={importing}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-accent/15 text-accent hover:bg-accent/25 transition-colors disabled:opacity-50"
        >
          {importing ? t("admin.tracking.osmFetching") : t("admin.tracking.importOsm")}
        </button>
        {trackPolyline && (
          <button
            onClick={handleClearTrack}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10"
          >
            {t("admin.tracking.clear")} · {t("admin.tracking.drawTrack")}
          </button>
        )}
        {pitLanePolyline && (
          <button
            onClick={handleClearPitLane}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10"
          >
            {t("admin.tracking.clear")} · {t("admin.tracking.drawPitLane")}
          </button>
        )}
        {importMsg && (
          <span className="text-xs text-orange-400">{importMsg}</span>
        )}
      </div>

      {/* Map */}
      <div ref={containerRef} className="w-full h-[520px] rounded-lg overflow-hidden bg-black border border-border" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Marker placement */}
        <div className="bg-surface border border-border rounded-xl p-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2">
            {t("admin.tracking.markers")}
          </div>
          <div className="space-y-1">
            {(
              [
                { key: "meta", labelKey: "admin.tracking.marker.meta" },
                { key: "s1", labelKey: "admin.tracking.marker.s1" },
                { key: "s2", labelKey: "admin.tracking.marker.s2" },
                { key: "s3", labelKey: "admin.tracking.marker.s3" },
                { key: "pitIn", labelKey: "admin.tracking.marker.pitIn" },
                { key: "pitOut", labelKey: "admin.tracking.marker.pitOut" },
                { key: "pitBox", labelKey: "admin.tracking.marker.pitBox" },
              ] as { key: MarkerKey; labelKey: string }[]
            ).map(({ key, labelKey }) => {
              // Pit-in / pit-out: free lat/lon (no snap). Everything
              // else is a distance along its polyline.
              const isFree = key === "pitIn" || key === "pitOut";
              const freeLatLon = key === "pitIn" ? pitInLatLon : key === "pitOut" ? pitOutLatLon : null;
              const dist = isFree
                ? null
                : (markerDistances as Record<string, number | null>)[key] ?? null;
              const display = isFree
                ? freeLatLon
                  ? `${freeLatLon[0].toFixed(5)}, ${freeLatLon[1].toFixed(5)}`
                  : "—"
                : dist == null
                  ? "—"
                  : `${dist.toFixed(0)} m`;
              const placeable = key === "pitBox" ? !!pitLanePolyline : !!trackPolyline;
              const active = placingMarker === key;
              return (
                <div key={key} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded bg-black/30">
                  <span className="text-[11px] text-neutral-300">{t(labelKey)}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-neutral-500">
                      {display}
                    </span>
                    <button
                      onClick={() => setPlacingMarker(active ? null : key)}
                      disabled={!placeable}
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded ${
                        active
                          ? "bg-accent text-black"
                          : "bg-white/[0.05] text-neutral-300 hover:bg-white/[0.1]"
                      } ${!placeable ? "opacity-40 cursor-not-allowed" : ""}`}
                    >
                      {active ? "···" : "↩"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Direction + save */}
        <div className="bg-surface border border-border rounded-xl p-3 flex flex-col gap-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2">
              {t("admin.tracking.direction")}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setDirection("forward")}
                className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold transition-colors ${
                  direction === "forward"
                    ? "bg-accent text-black"
                    : "bg-black/30 text-neutral-300 hover:bg-black/50"
                }`}
              >
                {t("admin.tracking.direction.forward")}
              </button>
              <button
                onClick={() => setDirection("reversed")}
                className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold transition-colors ${
                  direction === "reversed"
                    ? "bg-accent text-black"
                    : "bg-black/30 text-neutral-300 hover:bg-black/50"
                }`}
              >
                {t("admin.tracking.direction.reversed")}
              </button>
            </div>
          </div>

          <div className="mt-auto flex items-center gap-3 pt-3 border-t border-border">
            <button
              onClick={handleSave}
              disabled={saving || !trackPolyline}
              className="px-5 py-2 bg-accent hover:bg-accent-hover text-black text-sm font-bold rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? t("admin.tracking.saving") : t("admin.tracking.save")}
            </button>
            {saved && <span className="text-xs text-green-400">{t("admin.tracking.saved")}</span>}
            {error && <span className="text-xs text-red-400">{error}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
