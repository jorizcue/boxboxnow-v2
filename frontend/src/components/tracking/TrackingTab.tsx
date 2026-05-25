"use client";

/**
 * Live tracking module — top-level page rendered when the user clicks
 * "Tracking" in the sidebar. Composition:
 *
 *   ┌─ TrackingTab ─────────────────────────────────────────┐
 *   │  ┌─ Top bar (circuit name + direction + EN VIVO) ──┐ │
 *   │  ├─ TrackMap (Leaflet + polyline + KartMarkers) ───┤ │
 *   │  ├─ Legend (tier colors) ────────────────────────── │ │
 *   │  └─ OnTrackPanel (right side, kart ranking) ────────┘ │
 *   └────────────────────────────────────────────────────────┘
 *
 * The map is the centerpiece. The side panel + legend live in the
 * same flex layout to keep everything visible on a 1280-wide screen.
 *
 * Data sources (all already exist in the app — no new infra):
 *  - Track geometry: GET /api/tracking/circuits/{id}/track-config
 *    (fetched once on mount; rebuilds when the active session changes
 *    circuits).
 *  - Live kart state: useRaceStore (WS-driven, ticks every few seconds).
 *  - Smooth countdown: useRaceClock (interpolates at 10 Hz between
 *    server snapshots), used by `computeKartProgressM` to interpolate
 *    each kart's position along the polyline.
 */
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useRaceStore } from "@/hooks/useRaceState";
import { useRaceClock } from "@/hooks/useRaceClock";
import { useAuth } from "@/hooks/useAuth";
import type { TrackConfig } from "@/types/race";
import { TrackMap } from "./TrackMap";
import { TrackMapSVG } from "./TrackMapSVG";
import { OnTrackPanel } from "./OnTrackPanel";
import { BoxFifoView, PitInProgressCard } from "@/components/pit/BoxStatusPanel";

// LocalStorage key for the per-user renderer preference (Leaflet vs
// SVG). The SVG renderer is in beta — it animates karts with CSS
// `offset-path` so they glide smoothly along the polyline curves
// instead of cutting across them. We let the user pick which one to
// see while we validate it.
const RENDERER_PREF_KEY = "boxboxnow.tracking.renderer";
type RendererPref = "leaflet" | "svg";

export function TrackingTab() {
  const t = useT();
  const { user } = useAuth();
  const karts = useRaceStore((s) => s.karts);
  const config = useRaceStore((s) => s.config);
  const trackName = useRaceStore((s) => s.trackName);
  // Tracking needs a 10 Hz clock so that `computeKartProgressM` updates
  // every 100 ms instead of every 1 s. Combined with the CSS transition
  // on `.tracking-kart-icon` (220 ms linear), the karts now glide
  // smoothly along the polyline instead of teleporting once per second.
  const countdownMs = useRaceClock(100);

  const [circuitId, setCircuitId] = useState<number | null>(null);
  const [trackConfig, setTrackConfig] = useState<TrackConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedKart, setSelectedKart] = useState<number | null>(null);
  // Local runtime override for the race direction. `null` = use the
  // value stored in trackConfig.defaultDirection; otherwise the operator
  // flipped it from the top bar (occasional events go anti-clockwise,
  // and the admin-stored default doesn't always match). Resets when the
  // circuit changes.
  const [directionOverride, setDirectionOverride] = useState<"forward" | "reversed" | null>(null);
  // Renderer preference: "leaflet" (legacy, Leaflet + setLatLng) or
  // "svg" (new, CSS offset-path). Persisted in localStorage so the
  // operator's choice survives reloads. Default is "svg" because we
  // expect it to be visibly smoother once we validate it.
  const [renderer, setRenderer] = useState<RendererPref>("svg");
  // Map rotation (deg, -180..180). Vive aquí (no en los renderers)
  // para que cambiar de Leaflet ↔ SVG preserve la orientación que el
  // estratega ya tenía elegida. Leaflet usa el plugin leaflet-rotate
  // (parchea L.Map con `setBearing`); SVG aplica un `<g transform>`
  // sobre el viewBox. Ambos respetan el mismo prop.
  const [rotation, setRotation] = useState(0);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(RENDERER_PREF_KEY);
      if (stored === "leaflet" || stored === "svg") setRenderer(stored);
    } catch {/* localStorage blocked in private mode */}
  }, []);
  const setRendererPref = (r: RendererPref) => {
    setRenderer(r);
    try { localStorage.setItem(RENDERER_PREF_KEY, r); } catch {/* ignore */}
  };

  // Resolve which circuit we're viewing from the active session. This
  // is one API call on mount — the active session rarely changes
  // mid-page, and re-fetching when it does is handled by the user
  // navigating away and back.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sess = await api.getActiveSession();
        if (!cancelled) setCircuitId(sess?.circuit_id ?? null);
      } catch {
        if (!cancelled) setCircuitId(null);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Fetch the track config for the active circuit.
  useEffect(() => {
    if (circuitId == null) {
      setTrackConfig(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const cfg = await api.getTrackConfig(circuitId);
        if (!cancelled) setTrackConfig(cfg);
      } catch {
        if (!cancelled) setTrackConfig(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [circuitId]);

  const myKartNumber = config.ourKartNumber;
  // Effective direction = override (if set by the operator) → stored
  // default → "forward". TrackMap and OnTrackPanel both receive this
  // resolved value so kart interpolation flips consistently.
  const direction: "forward" | "reversed" =
    directionOverride ?? trackConfig?.defaultDirection ?? "forward";

  // Reset the manual override every time the active circuit changes.
  // Without this the override would stick across sessions and confuse
  // the next opening of the page.
  useEffect(() => {
    setDirectionOverride(null);
  }, [circuitId]);

  // Sort karts by progress on track (descending = leading kart first).
  // Resolved client-side in OnTrackPanel since it needs the same
  // computation; we pass karts as-is and let it sort.
  const visibleKarts = useMemo(
    () => karts.filter((k) => k.kartNumber > 0),
    [karts],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
      </div>
    );
  }

  if (circuitId == null) {
    return (
      <div className="text-neutral-500 text-sm text-center py-20">
        {t("tracking.emptyNoCircuit")}
      </div>
    );
  }

  if (!trackConfig?.trackPolyline) {
    return (
      <div className="bg-surface border border-border rounded-xl p-10 text-center">
        <svg className="w-12 h-12 mx-auto text-neutral-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <ellipse cx="12" cy="12" rx="8.5" ry="6" />
          <circle cx="15" cy="9" r="1.5" fill="currentColor" stroke="none" />
        </svg>
        <p className="text-neutral-400 text-sm max-w-md mx-auto leading-relaxed">
          {t("tracking.emptyNoTrack")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">
            {trackName || t("tracking.title")}
          </h2>
          <button
            type="button"
            onClick={() =>
              setDirectionOverride(direction === "forward" ? "reversed" : "forward")
            }
            title={t("tracking.direction.toggleHint")}
            className="text-[10px] font-bold uppercase tracking-wider text-accent border border-accent rounded px-1.5 py-0.5 hover:bg-accent hover:text-black transition-colors cursor-pointer"
          >
            {direction === "reversed"
              ? t("tracking.direction.reversed")
              : t("tracking.direction.forward")}
            <span className="ml-1 opacity-60">⇄</span>
          </button>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Rotación del mapa — disponible en ambos renderers.
              Leaflet vía plugin `leaflet-rotate` (rota tiles + layers
              nativamente), SVG vía transform sobre el viewBox. El
              slider va de -180° a +180° en pasos de 5° + botón ⟲
              para volver a 0 (norte arriba). */}
          <div className="inline-flex items-center gap-1 text-[10px] text-neutral-400">
            <span className="font-bold uppercase tracking-wider mr-1">{t("tracking.rotate")}</span>
            <input
              type="range"
              min={-180}
              max={180}
              step={5}
              value={rotation}
              onChange={(e) => setRotation(Number(e.target.value))}
              className="w-24 accent-accent"
              title={`${rotation}°`}
            />
            <span className="font-mono w-9 text-right">{rotation}°</span>
            <button
              type="button"
              onClick={() => setRotation(0)}
              disabled={rotation === 0}
              className="ml-0.5 px-1 py-0.5 rounded border border-border text-neutral-400 hover:text-white disabled:opacity-30 transition-colors"
              title="Reset rotación"
            >⟲</button>
          </div>
          {/* Renderer picker. The SVG path-based renderer (offset-path)
              is in beta — letting the operator A/B between them on
              the fly is the fastest way to validate the new approach
              without breaking the production view. */}
          <div className="inline-flex rounded border border-border overflow-hidden text-[9px] font-bold uppercase tracking-wider">
            <button
              type="button"
              onClick={() => setRendererPref("leaflet")}
              className={`px-1.5 py-0.5 transition-colors ${
                renderer === "leaflet" ? "bg-accent text-black" : "bg-surface text-neutral-400 hover:text-white"
              }`}
              title="Renderer: Leaflet (legacy)"
            >Leaflet</button>
            <button
              type="button"
              onClick={() => setRendererPref("svg")}
              className={`px-1.5 py-0.5 transition-colors ${
                renderer === "svg" ? "bg-accent text-black" : "bg-surface text-neutral-400 hover:text-white"
              }`}
              title="Renderer: SVG offset-path (beta)"
            >SVG <sup>β</sup></button>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-red-500 uppercase tracking-wider">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            {t("tracking.live")}
          </span>
        </div>
      </div>

      {/* `lg:items-start` evita que el grid estire el aside del lado
          derecho a la altura del mapa cuando éste es la card más
          alta (o al revés). El aside lleva su propia altura fija
          (`lg:h-[504px]`) y scroll interno; sin items-start, el grid
          forzaría a ambos al mismo alto y la lista del lado derecho
          empujaba al box hacia abajo en carreras con 30+ karts. */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] lg:items-start gap-3">
        {/* Map */}
        <div className="bg-surface border border-border rounded-xl p-3 overflow-hidden">
          {renderer === "svg" ? (
            <TrackMapSVG
              trackConfig={trackConfig}
              karts={visibleKarts}
              myKartNumber={myKartNumber}
              countdownMs={countdownMs}
              selectedKart={selectedKart}
              onSelectKart={setSelectedKart}
              direction={direction}
              pitTimeS={config.pitTimeS}
              rotation={rotation}
            />
          ) : (
            <TrackMap
              trackConfig={trackConfig}
              karts={visibleKarts}
              myKartNumber={myKartNumber}
              countdownMs={countdownMs}
              selectedKart={selectedKart}
              onSelectKart={setSelectedKart}
              direction={direction}
              pitTimeS={config.pitTimeS}
              rotation={rotation}
            />
          )}
          {/* Legend */}
          <div className="flex items-center gap-3 mt-2 px-1 text-[10px] text-neutral-500 flex-wrap">
            <span className="font-semibold text-neutral-400">
              {t("tracking.legend.tier")}
            </span>
            <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-full border border-black" style={{ background: "#9fe556" }} />100</span>
            <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-full border border-black" style={{ background: "#c8e946" }} />75</span>
            <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-full border border-black" style={{ background: "#e5d43a" }} />50</span>
            <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-full border border-black" style={{ background: "#e59a2e" }} />25</span>
            <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-full border border-black" style={{ background: "#e54444" }} />1</span>
            <span className="flex items-center gap-1.5 ml-auto">
              <span className="inline-block w-2.5 h-2.5 rounded-full border border-black" style={{ background: "#e54444", boxShadow: "0 0 0 2px #9fe556" }} />
              {t("tracking.legend.mine")}
            </span>
          </div>
        </div>

        {/* Side panel */}
        <OnTrackPanel
          karts={visibleKarts}
          trackConfig={trackConfig}
          countdownMs={countdownMs}
          myKartNumber={myKartNumber}
          selectedKart={selectedKart}
          onSelectKart={setSelectedKart}
          direction={direction}
        />
      </div>

      {/* ── Box (score + queue) + Pit en curso ──
          Mismas piezas que muestra la pestaña Box. Aquí se renderizan
          en una fila por debajo del mapa para que el estratega no
          tenga que cambiar de pestaña durante el seguimiento en vivo.
          PitInProgressCard ocupa un tile fino a la derecha del bloque
          de Box; el grid auto-fit baja el card a la fila siguiente en
          móviles. */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_140px] gap-3 mt-3">
        <BoxFifoView />
        <PitInProgressCard />
      </div>
    </div>
  );
}
