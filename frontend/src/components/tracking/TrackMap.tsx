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
import { pointAtDistance } from "@/lib/polyline";
import { computeKartProgressM, isKartInPit, computePitGhostProgressM } from "@/lib/kartPosition";
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
  /** Configured pit-stop duration (s) — drives the "if I pit now" ghost. */
  pitTimeS: number;
  /** Rotación del mapa en grados (CW desde norte). Aplicada vía
   *  plugin `leaflet-rotate` (parchea `L.Map` con `setBearing`),
   *  no via CSS transform — el plugin gestiona la carga de tiles
   *  para el viewport rotado y mantiene los markers en sus
   *  coordenadas geográficas correctas. */
  rotation?: number;
}

export function TrackMap({
  trackConfig,
  karts,
  myKartNumber,
  countdownMs,
  selectedKart,
  onSelectKart,
  direction,
  pitTimeS,
  rotation = 0,
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
  // Per-kart cache of the visual state we baked into its divIcon.
  // We only call `setIcon` when one of these changes — otherwise Leaflet
  // would tear down and rebuild the DOM element on every countdown tick,
  // which kills any CSS `transition: transform` on the marker. With the
  // cache, the same DOM element survives across ticks and CSS smooths
  // the kart's path between server snapshots.
  const iconCacheRef = useRef<Map<number, { tier: number; isMine: boolean; isPit: boolean }>>(new Map());
  // Ghost del "if I pit now" — formado por TRES capas Leaflet:
  //  - outline: línea negra gruesa perpendicular al trazado (10 px)
  //  - bar:     línea verde discontinua encima de la outline (6 px)
  //  - label:   divIcon "PIT" con halo verde sobre el punto del ghost
  // La barra extiende ~22 m a cada lado del polyline, así sigue
  // visible aunque el ghost caiga en medio de un cluster de karts
  // (los markers de karts son divIcons de ~22 px). Cada capa tiene
  // su propio ref para poder updatearlas in-place en cada tick sin
  // recrear los DOM nodes — preserva las transiciones CSS.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ghostBarRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ghostOutlineRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ghostLabelRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [L, setL] = useState<any>(null);

  // Cargamos Leaflet en cliente (el paquete sólo funciona en browser).
  // Acto seguido cargamos el plugin `leaflet-rotate` para que parchee
  // `L.Map` y nos dé soporte de rotación nativa (carga de tiles
  // alineada al bearing, contra-rotación opcional de markers, etc.).
  // El plugin lee `window.L` para encontrar Leaflet en runtime, así
  // que lo asignamos antes del import dinámico. El import es de
  // side-effect: no exporta nada, sólo muta L.Map.prototype.
  useEffect(() => {
    (async () => {
      const mod = await import("leaflet");
      if (typeof window !== "undefined") {
        (window as unknown as { L: typeof mod.default }).L = mod.default;
      }
      // @ts-expect-error — leaflet-rotate no expone tipos.
      // El side-effect import sólo parchea L.Map.prototype; la API
      // resultante (setBearing, opciones rotate/bearing/…) está
      // augmentada en src/types/leaflet-rotate.d.ts.
      await import("leaflet-rotate");
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
      // Soporte de rotación vía plugin leaflet-rotate (parcheado al
      // load). Desactivamos el control nativo del plugin porque ya
      // hay un slider en TrackingTab; touchRotate / shiftKeyRotate
      // off para no robar gestos al pan/zoom del estratega.
      rotate: true,
      bearing: 0,
      rotateControl: false,
      touchRotate: false,
      shiftKeyRotate: false,
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
      ghostBarRef.current = null;
      ghostOutlineRef.current = null;
      ghostLabelRef.current = null;
    };
  }, [L, trackConfig.trackPolyline]);

  // Aplica `rotation` (deg, CW desde norte) cada vez que cambia el
  // slider del top bar. `setBearing` es el método añadido por el
  // plugin leaflet-rotate cuando el mapa se crea con `rotate: true`.
  // El plugin redibuja tiles + transforma layers correctamente, así
  // que no hay que tocar nada más aquí.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || typeof map.setBearing !== "function") return;
    map.setBearing(rotation);
  }, [rotation]);

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

    // Sector + meta markers. Tiny circles + label.
    //
    // IMPORTANT: sensors are PHYSICAL points on the track. They do not
    // move when the operator toggles the race direction — only the
    // kart's instantaneous position needs the flip. So we draw them at
    // their raw polyline-walk distance (the same coordinate system the
    // editor uses when storing them).
    const drawSensorTick = (distanceM: number | null, label: string, color: string) => {
      if (distanceM == null || !trackConfig.trackPolyline || !trackConfig.trackLengthM) return;
      const pt = pointAtDistance(trackConfig.trackPolyline, distanceM, true);
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

    // Pit-in / pit-out: marker simple (mismo tratamiento que sectores).
    // Originalmente se probó una barra perpendicular al trazado para
    // que asomara fuera del cluster de karts, pero confundía
    // visualmente con el ghost del "if I pit now" (que también es
    // perpendicular). El usuario pidió revertir a markers normales —
    // los sensores son fijos, sin contenido dinámico, así que el dot
    // + tooltip clásico es suficiente.
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
    // No `direction` in deps: sensors are physical points and the
    // visual position does NOT change with the direction toggle.
  }, [L, trackConfig]);

  // Update kart markers on every render — cheap because we mutate
  // existing markers instead of recreating them.
  //
  // Smoothness note: we only invoke `setIcon` when one of the visual
  // properties of the kart (tier color, mine-halo, pit-lane styling)
  // actually changed; otherwise the divIcon DOM element survives the
  // tick and CSS `transition: transform` on `.tracking-kart-icon` (see
  // globals.css) interpolates the position between snapshots. Without
  // the cache, `setIcon` would replace the DOM element on every tick
  // (≈10 Hz) and there'd be nothing to transition from.
  useEffect(() => {
    if (!L || !mapRef.current || !trackConfig.trackPolyline || !trackConfig.trackLengthM) return;
    const map = mapRef.current;
    const refs = layerRefs.current;
    const iconCache = iconCacheRef.current;

    // Index of in-pit karts, used to fan them slightly when there's no
    // pit-lane polyline and we have to stack them at the PIT-IN marker.
    let pitFanIdx = 0;

    const seenKarts = new Set<number>();
    for (const kart of karts) {
      const isPit = isKartInPit(kart);
      let latlon: [number, number] | null = null;

      if (isPit) {
        // Preferred: park on pit_lane at pit_box position (operator
        // traced the pit lane + box).
        if (trackConfig.pitLanePolyline && trackConfig.pitBoxDistanceM != null) {
          latlon = pointAtDistance(trackConfig.pitLanePolyline, trackConfig.pitBoxDistanceM, false);
        }
        // Fallback 1: no pit-lane traced yet but the operator did place
        // PIT-IN. Stack the in-pit karts near that point with a small
        // vertical fan so they don't fully overlap. ~3 m between karts.
        else if (trackConfig.pitEntryLat != null && trackConfig.pitEntryLon != null) {
          const dLat = (pitFanIdx * 3) / 111000;  // 1° lat ≈ 111 km
          latlon = [trackConfig.pitEntryLat + dLat, trackConfig.pitEntryLon];
          pitFanIdx += 1;
        }
        // Fallback 2: legacy distance-along-polyline pit-in (old configs
        // that haven't been migrated to lat/lon yet).
        else if (trackConfig.pitEntryDistanceM != null) {
          latlon = pointAtDistance(trackConfig.trackPolyline, trackConfig.pitEntryDistanceM, true);
        }
      } else {
        // `computeKartProgressM` already accounts for race direction and
        // returns a polyline-walk distance, so we resolve it to lat/lon
        // directly. No `effectiveDistanceForward` wrap needed — that
        // legacy helper assumed meta=polyline[0] and broke for circuits
        // with a non-zero `metaDistanceM`.
        const progress = computeKartProgressM(kart, trackConfig, countdownMs, direction);
        if (progress != null) {
          latlon = pointAtDistance(trackConfig.trackPolyline, progress, true);
        }
      }

      if (!latlon) continue;
      seenKarts.add(kart.kartNumber);

      const isMine = kart.kartNumber === myKartNumber;
      const tier = kart.tierScore ?? 0;

      const existing = refs.markers.get(kart.kartNumber);
      const cached = iconCache.get(kart.kartNumber);
      const visualChanged =
        !cached || cached.tier !== tier || cached.isMine !== isMine || cached.isPit !== isPit;

      // (Re)build the divIcon ONLY when visuals change — otherwise the
      // marker DOM is preserved and the CSS transition can do its job.
      const buildIcon = () => {
        const fill = tierColor(tier);
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
              ${isPit ? "outline: 2px dashed #e59a2e; outline-offset: 2px;" : ""}
            ">${kart.kartNumber}</div>
          </div>
        `;
        return L.divIcon({
          html,
          className: "tracking-kart-icon",
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        });
      };

      if (existing) {
        existing.setLatLng(latlon);
        if (visualChanged) {
          existing.setIcon(buildIcon());
          iconCache.set(kart.kartNumber, { tier, isMine, isPit });
        }
      } else {
        const m = L.marker(latlon, { icon: buildIcon(), interactive: true });
        m.on("click", () => onSelectKart(kart.kartNumber === selectedKart ? null : kart.kartNumber));
        m.addTo(map);
        refs.markers.set(kart.kartNumber, m);
        iconCache.set(kart.kartNumber, { tier, isMine, isPit });
      }
    }

    // Remove markers for karts that disappeared (rare during a session).
    Array.from(refs.markers.entries()).forEach(([num, marker]) => {
      if (!seenKarts.has(num)) {
        map.removeLayer(marker);
        refs.markers.delete(num);
        iconCache.delete(num);
      }
    });

    // "If I pit now" ghost — where our kart would rejoin relative to
    // the field shown now (static-field estimate). Antes era un
    // circulito verde de 30 px con "PIT" dentro que quedaba enterrado
    // bajo el cluster de markers de karts (cada kart es un divIcon
    // de ~22 px, hasta 30 karts apilándose en el mismo tramo).
    //
    // Ahora son TRES capas:
    //  - outline: barra negra perpendicular al trazado (~44 m total)
    //  - bar:     barra verde discontinua encima del outline
    //  - label:   chip "PIT" elevado por encima del cluster vía
    //             zIndexOffset alto + halo verde para destacar
    //
    // La perpendicular se calcula vía: pointAtDistance(walk±5 m) para
    // obtener dos puntos cercanos al ghost → tangente local en planar
    // (lat scale 1, lon scale cos(lat)) → rotación 90° → endpoints.
    // Cada capa se update-ea in-place (setLatLngs / setLatLng) en
    // lugar de recrear el DOM, así Leaflet no rompe transiciones.
    const mine = karts.find((k) => k.kartNumber === myKartNumber);
    let ghostLatLon: [number, number] | null = null;
    let ghostBarP1: [number, number] | null = null;
    let ghostBarP2: [number, number] | null = null;
    if (mine) {
      const gw = computePitGhostProgressM(mine, trackConfig, countdownMs, direction, pitTimeS);
      const total = trackConfig.trackLengthM ?? 0;
      if (gw != null && total > 0) {
        ghostLatLon = pointAtDistance(trackConfig.trackPolyline, gw, true);
        const before = pointAtDistance(trackConfig.trackPolyline, ((gw - 5) % total + total) % total, true);
        const after  = pointAtDistance(trackConfig.trackPolyline, (gw + 5) % total, true);
        const cosLat = Math.cos(ghostLatLon[0] * Math.PI / 180);
        const dLatM = (after[0] - before[0]) * 111000;
        const dLonM = (after[1] - before[1]) * 111000 * cosLat;
        const mag = Math.hypot(dLatM, dLonM);
        if (mag > 0) {
          const halfLen = 22; // m a cada lado — un pelín más larga que PIT-IN/OUT (18 m)
          const dLatDeg = (-dLonM / mag) / 111000;
          const dLonDeg = ( dLatM  / mag) / (111000 * cosLat);
          ghostBarP1 = [ghostLatLon[0] + dLatDeg * halfLen, ghostLatLon[1] + dLonDeg * halfLen];
          ghostBarP2 = [ghostLatLon[0] - dLatDeg * halfLen, ghostLatLon[1] - dLonDeg * halfLen];
        }
      }
    }

    if (ghostLatLon) {
      // ── outline ──
      if (ghostBarP1 && ghostBarP2) {
        if (ghostOutlineRef.current) {
          ghostOutlineRef.current.setLatLngs([ghostBarP1, ghostBarP2]);
        } else {
          ghostOutlineRef.current = L.polyline([ghostBarP1, ghostBarP2], {
            color: "#000", weight: 12, opacity: 0.9, lineCap: "round",
            interactive: false,
          }).addTo(map);
        }
        if (ghostBarRef.current) {
          ghostBarRef.current.setLatLngs([ghostBarP1, ghostBarP2]);
        } else {
          ghostBarRef.current = L.polyline([ghostBarP1, ghostBarP2], {
            color: "#9fe556", weight: 6, opacity: 1, lineCap: "round",
            dashArray: "8 4",
            interactive: false,
          }).addTo(map);
        }
      }
      // ── label ──
      // Halo verde alrededor del chip ("box-shadow: 0 0 ... ") + chip
      // con borde negro grueso. zIndexOffset 1800 lo pone POR ENCIMA
      // de los kart markers (zIndexOffset 0) y de las barras PIT-IN/OUT
      // (zIndexOffset 1500).
      if (ghostLabelRef.current) {
        ghostLabelRef.current.setLatLng(ghostLatLon);
      } else {
        const ghostIcon = L.divIcon({
          html: `<div style="
            background:#9fe556;color:#0a0a0a;border:2px solid #0a0a0a;
            padding:2px 7px;font-size:11px;font-weight:800;
            letter-spacing:1px;white-space:nowrap;border-radius:4px;
            font-family:ui-monospace,'SF Mono',monospace;
            transform:translate(-50%,-160%);
            box-shadow:0 0 0 1px rgba(0,0,0,0.7),0 0 16px rgba(159,229,86,0.7);
          ">PIT</div>`,
          className: "tracking-pit-ghost",
          iconSize: [0, 0],
        });
        ghostLabelRef.current = L.marker(ghostLatLon, {
          icon: ghostIcon,
          interactive: false,
          zIndexOffset: 1800,
        }).addTo(map);
      }
    } else {
      // No hay ghost → quitar las tres capas
      if (ghostOutlineRef.current) { map.removeLayer(ghostOutlineRef.current); ghostOutlineRef.current = null; }
      if (ghostBarRef.current)     { map.removeLayer(ghostBarRef.current);     ghostBarRef.current     = null; }
      if (ghostLabelRef.current)   { map.removeLayer(ghostLabelRef.current);   ghostLabelRef.current   = null; }
    }
  }, [L, karts, countdownMs, trackConfig, direction, myKartNumber, selectedKart, onSelectKart, pitTimeS]);

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
