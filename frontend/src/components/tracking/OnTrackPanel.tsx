"use client";

/**
 * Side panel for the Tracking module — shows every kart sorted by
 * its current position along the polyline.
 *
 * Each row has:
 *  - Color circle with the kart number (tier color, halo if mine)
 *  - Driver name + team
 *  - Current sector + progress within it ("S2 · 47%")
 *  - Race position from the timing table (P1, P2, ...)
 *
 * Clicking a row selects the kart in the map (opens its popup).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import type { KartState, TrackConfig } from "@/types/race";
import { computeKartProgressM, isKartInPit } from "@/lib/kartPosition";
import { msToLapTime } from "@/lib/formatters";

function tierColor(score: number | undefined): string {
  const s = score ?? 0;
  if (s >= 100) return "#9fe556";
  if (s >= 75)  return "#c8e946";
  if (s >= 50)  return "#e5d43a";
  if (s >= 25)  return "#e59a2e";
  return "#e54444";
}

/** Convert a polyline-walk distance into "distance from META in race
 *  direction" — i.e. how far the kart has travelled since its last META
 *  crossing. Monotonically grows from 0 to `total` during a lap. */
function raceProgressFromMeta(
  polylineDistM: number,
  cfg: TrackConfig,
  direction: "forward" | "reversed",
): number {
  const total = cfg.trackLengthM ?? 0;
  if (total <= 0) return 0;
  const meta = cfg.metaDistanceM ?? 0;
  const raw = direction === "forward" ? polylineDistM - meta : meta - polylineDistM;
  return ((raw % total) + total) % total;
}

/** Resolve which sector the kart is in (using its race-progress from
 *  META) plus the % progress within that sector. Sensors are ordered
 *  by the race direction so the indicator flips together with the
 *  toggle in the top bar.
 *
 *  Falls back to the pseudo-sector "S—" with the kart's overall lap
 *  progress when the operator hasn't placed any S1/S2/S3 sensors yet. */
function sectorProgress(
  polylineDistM: number,
  cfg: TrackConfig,
  direction: "forward" | "reversed",
): { label: string; pct: number } {
  const total = cfg.trackLengthM ?? 0;
  if (total <= 0) return { label: "—", pct: 0 };
  const kartRace = raceProgressFromMeta(polylineDistM, cfg, direction);

  // Sensors in race-order. In reversed direction the kart crosses
  // them in the reverse SENSOR-NAME order (S3 first, then S2, then S1)
  // — we still label them by their sensor name so the operator can
  // mentally map "S3" back to the same physical point on the track.
  const sensors = [
    { name: "S1", polyline: cfg.s1DistanceM },
    { name: "S2", polyline: cfg.s2DistanceM },
    { name: "S3", polyline: cfg.s3DistanceM },
  ]
    .filter((s): s is { name: string; polyline: number } => s.polyline != null)
    .map((s) => ({ name: s.name, race: raceProgressFromMeta(s.polyline, cfg, direction) }))
    .sort((a, b) => a.race - b.race);

  if (sensors.length === 0) {
    // No sensors placed yet — show overall lap progress under a
    // neutral label so the row isn't always blank.
    return { label: "—", pct: (kartRace / total) * 100 };
  }

  let prevRace = 0;
  for (const s of sensors) {
    if (kartRace >= prevRace && kartRace < s.race) {
      const span = s.race - prevRace;
      const pct = span > 0 ? Math.min(100, ((kartRace - prevRace) / span) * 100) : 0;
      return { label: s.name, pct };
    }
    prevRace = s.race;
  }
  // Final stretch back to META — still labelled with the LAST sensor
  // crossed so the operator can read "S1 · 90 %" as "almost back at META".
  const lastSensor = sensors[sensors.length - 1];
  const span = total - lastSensor.race;
  const pct = span > 0 ? Math.min(100, ((kartRace - lastSensor.race) / span) * 100) : 0;
  return { label: lastSensor.name, pct };
}

interface Props {
  karts: KartState[];
  trackConfig: TrackConfig;
  countdownMs: number;
  myKartNumber: number;
  selectedKart: number | null;
  onSelectKart: (k: number | null) => void;
  // Effective race direction (TrackingTab override + stored default).
  // Drives the forward-distance projection so the per-row sector
  // indicator flips together with the map.
  direction: "forward" | "reversed";
}

export function OnTrackPanel({
  karts,
  trackConfig,
  countdownMs,
  myKartNumber,
  selectedKart,
  onSelectKart,
  direction,
}: Props) {
  const t = useT();

  // Refs para el scroll interno: `listRef` es el contenedor scrollable
  // y `myRowRef` apunta al botón de NUESTRO kart, que centramos la
  // primera vez que aparece (y cada vez que cambia el our_kart_number
  // en la config). `centeredForKartRef` evita re-centrar en cada
  // tick del countdown — si la posición de nuestro kart en la
  // tabla cambia (subimos o bajamos en clasificación) NO forzamos
  // re-scroll, porque eso robaría la posición de scroll si el
  // estratega ha bajado a mirar otro kart.
  const listRef = useRef<HTMLDivElement | null>(null);
  const myRowRef = useRef<HTMLButtonElement | null>(null);
  const centeredForKartRef = useRef<number | null>(null);

  // META-crossing highlight: each time a kart's
  // `lastLapCompleteCountdownMs` changes (new lap closed) we flash the
  // corresponding row for ~1.5 s. The previous value is kept in a ref
  // so we don't re-flash on every re-render — only on real transitions.
  // First-observation values (no `prev` yet) are seeded into the ref
  // silently so the panel doesn't flash every kart when the user first
  // opens the tab.
  const lastLapRef = useRef<Map<number, number>>(new Map());
  const [flashKarts, setFlashKarts] = useState<Set<number>>(new Set());
  useEffect(() => {
    const justCrossed: number[] = [];
    for (const k of karts) {
      const curr = k.lastLapCompleteCountdownMs ?? 0;
      const prev = lastLapRef.current.get(k.kartNumber);
      if (prev != null && curr > 0 && prev !== curr) {
        justCrossed.push(k.kartNumber);
      }
      lastLapRef.current.set(k.kartNumber, curr);
    }
    if (justCrossed.length === 0) return;
    setFlashKarts((s) => {
      const next = new Set(s);
      justCrossed.forEach((n) => next.add(n));
      return next;
    });
    const tid = setTimeout(() => {
      setFlashKarts((s) => {
        const next = new Set(s);
        justCrossed.forEach((n) => next.delete(n));
        return next;
      });
    }, 1500);
    return () => clearTimeout(tid);
  }, [karts]);

  // Compute progress + race-position for each kart once per render.
  // `lapPct` is the kart's lap progress 0…100 % from META in race
  // direction — drives the per-row progress bar.
  // `currentLapMs` is the time elapsed since the kart last crossed
  // META (live, ticks at the race-clock cadence).
  const rows = useMemo(() => {
    const total = trackConfig.trackLengthM ?? 0;
    return karts
      .map((k) => {
        const inPit = isKartInPit(k);
        const progressM = inPit ? null : computeKartProgressM(k, trackConfig, countdownMs, direction);
        const sector = progressM != null ? sectorProgress(progressM, trackConfig, direction) : null;
        const raceProgress = progressM != null
          ? raceProgressFromMeta(progressM, trackConfig, direction)
          : null;
        const lapPct = raceProgress != null && total > 0
          ? Math.min(100, (raceProgress / total) * 100)
          : 0;
        const lastLap = k.lastLapCompleteCountdownMs ?? 0;
        const currentLapMs = lastLap > 0 ? Math.max(0, lastLap - countdownMs) : 0;
        return { kart: k, inPit, progressM, sector, lapPct, currentLapMs };
      })
      .sort((a, b) => {
        // Strictly the Apex timing-table order: P1 first. Karts without
        // an Apex position yet (0/undefined — practice, race start) go
        // to the bottom, tie-broken by kart number so the order is
        // stable and NEVER biased toward our configured/selected kart.
        const pa = a.kart.position && a.kart.position > 0 ? a.kart.position : Infinity;
        const pb = b.kart.position && b.kart.position > 0 ? b.kart.position : Infinity;
        if (pa !== pb) return pa - pb;
        return a.kart.kartNumber - b.kart.kartNumber;
      });
  }, [karts, trackConfig, countdownMs, direction]);

  // Centrar la lista en NUESTRO kart la primera vez que aparece (y
  // cada vez que el operador cambia su kart en config). Sin esto,
  // con grids de 30+ karts el panel scrolea como bloque vertical y
  // nuestro kart suele quedar fuera del viewport del lado del mapa.
  // Solo re-centramos en cambio de `myKartNumber` (no en cada tick)
  // para no robar la posición del scroll cuando el estratega ha
  // bajado manualmente a inspeccionar otro kart.
  const hasMyKart = useMemo(
    () => karts.some((k) => k.kartNumber === myKartNumber),
    [karts, myKartNumber],
  );
  useEffect(() => {
    if (!hasMyKart || !myRowRef.current || !listRef.current) return;
    if (centeredForKartRef.current === myKartNumber) return;
    // `scrollIntoView` scrolea el ancestor scrollable más cercano,
    // que es `listRef.current` gracias al `overflow-y-auto` del
    // contenedor. `block: "center"` posiciona el botón en el
    // centro vertical del viewport del scroll.
    myRowRef.current.scrollIntoView({ block: "center", behavior: "auto" });
    centeredForKartRef.current = myKartNumber;
  }, [hasMyKart, myKartNumber]);

  // Botón "centrar mi kart" en la cabecera del panel: re-centra a
  // demanda cuando el estratega ha bajado a inspeccionar otro kart
  // y quiere volver a ver el suyo. Usa `behavior: "smooth"` (en lugar
  // del "auto" del effect inicial) para que la animación se sienta
  // como una acción explícita en lugar de un salto.
  const recenterMyKart = useCallback(() => {
    if (!myRowRef.current) return;
    myRowRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
  }, []);

  return (
    // El aside se estira a la altura del mapa por defecto (grid
    // items-stretch). Con `flex flex-col` + `min-h-0` el div interno
    // puede tener su propio scroll sin empujar al aside más alto que
    // el mapa. Sin estas dos clases, con 30+ karts la lista crecía
    // verticalmente arrastrando al grid entero y los paneles de Box
    // quedaban muy abajo en la pantalla.
    <aside className="bg-surface border border-border rounded-xl p-3 flex flex-col min-h-0">
      <div className="flex items-center justify-between gap-2 mb-2 px-1 shrink-0">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">
          {t("tracking.panel.title")}
        </h3>
        {/* "Centrar mi kart" — solo se muestra cuando nuestro kart
            está en la lista. Útil cuando el estratega ha scroleado
            para ver otro kart y quiere volver al suyo sin tener
            que buscar en la lista. El icono (⊙) está inspirado en
            el "center on me" de mapas tipo Google Maps. */}
        {hasMyKart && (
          <button
            type="button"
            onClick={recenterMyKart}
            title={t("tracking.panel.recenter")}
            aria-label={t("tracking.panel.recenter")}
            className="text-accent hover:text-accent-hover text-sm leading-none px-1 py-0.5 rounded transition-colors"
          >
            ⊙
          </button>
        )}
      </div>
      <div ref={listRef} className="space-y-0 overflow-y-auto flex-1 min-h-0 pr-1 -mr-1">
        {rows.map(({ kart, inPit, sector, lapPct, currentLapMs }) => {
          const isMine = kart.kartNumber === myKartNumber;
          const isSelected = kart.kartNumber === selectedKart;
          const isCrossingMeta = flashKarts.has(kart.kartNumber);
          const fill = tierColor(kart.tierScore);
          const textColor = fill === "#e54444" ? "#fff" : "#000";
          // The lap-progress bar uses the kart's tier colour so the
          // operator can quickly spot fast vs slow karts even when the
          // bar is short. Mi-kart gets the accent green halo by
          // default via `bg-accent/[0.05]` above.
          return (
            <button
              key={kart.kartNumber}
              ref={isMine ? myRowRef : undefined}
              onClick={() => onSelectKart(isSelected ? null : kart.kartNumber)}
              className={`w-full text-left flex items-center gap-2 px-1.5 py-1.5 rounded-lg transition-colors border-b border-border/40 last:border-0 ${
                isMine
                  ? "bg-accent/15 ring-1 ring-inset ring-accent/60"
                  : isSelected
                  ? "bg-white/[0.05]"
                  : "hover:bg-white/[0.02]"
              } ${isCrossingMeta ? "tracking-meta-flash" : ""}`}
            >
              <span
                className="w-6 h-6 rounded-full flex items-center justify-center font-mono font-bold text-[10px] shrink-0"
                style={{
                  background: fill,
                  color: textColor,
                  boxShadow: isMine ? "0 0 0 2px #9fe556" : "none",
                }}
              >
                {kart.kartNumber}
              </span>
              <div className="flex-1 min-w-0 space-y-0.5">
                {/* Row 1: team / driver + race position. */}
                <div className="flex items-center justify-between gap-1">
                  {(() => {
                    const team = kart.teamName?.trim() || "";
                    const drv = kart.driverName?.trim() || "";
                    const primary = team || drv || "—";
                    const secondary = team && drv && team !== drv ? drv : null;
                    return (
                      <span className="min-w-0 truncate text-[11px]">
                        <span className="font-semibold text-neutral-200">{primary}</span>
                        {secondary && (
                          <span className="ml-1 text-neutral-500">· {secondary}</span>
                        )}
                      </span>
                    );
                  })()}
                  <span className="text-[10px] font-mono font-bold text-neutral-400 shrink-0">
                    P{kart.position || "?"}
                  </span>
                </div>
                {/* Row 2: lap status (pit / sector + pct) + lap times.
                    The times block shows `lastLap → currentLap`. The
                    arrow makes it obvious which is past and which is
                    in-progress. Tabular-nums so dots line up between
                    rows. */}
                <div className="flex items-center justify-between gap-1 text-[9px] font-mono text-neutral-500">
                  <span className="truncate">
                    {inPit ? (
                      <span className="text-orange-400 font-bold">
                        {t("tracking.panel.inPit")}
                      </span>
                    ) : sector ? (
                      <>
                        v{kart.totalLaps} · <span className="text-accent font-bold">{sector.label}</span> · {sector.pct.toFixed(0)}%
                      </>
                    ) : (
                      "—"
                    )}
                  </span>
                  <span className="tabular-nums shrink-0 text-neutral-400">
                    {kart.lastLapMs > 0 ? msToLapTime(kart.lastLapMs) : "—"}
                    <span className="mx-0.5 text-neutral-600">→</span>
                    {/*
                     * Colour-code the current-lap counter:
                     *  - green (accent) when within ~120 % of the
                     *    kart's last lap = normal in-progress lap.
                     *  - orange when between 120 % and 200 % = lap is
                     *    visibly slower than usual, could be traffic,
                     *    yellow flag, OR a delayed/lost c7 event from
                     *    Apex (the kart already crossed META but the
                     *    backend hasn't seen the event yet).
                     *  - red when > 200 % = almost certainly stale
                     *    data — the kart has lapped at least once
                     *    without us being told.
                     */}
                    {(() => {
                      const ref = kart.lastLapMs > 0 ? kart.lastLapMs : 0;
                      const ratio = ref > 0 && currentLapMs > 0 ? currentLapMs / ref : 1;
                      const cls =
                        currentLapMs <= 0 ? "" :
                        ratio <= 1.2 ? "text-accent" :
                        ratio <= 2.0 ? "text-orange-400 font-bold" :
                        "text-red-500 font-bold";
                      return (
                        <span className={cls} title={ratio > 1.2 ? `lap overrun: ${(ratio * 100 - 100).toFixed(0)} % sobre la última` : undefined}>
                          {currentLapMs > 0 ? msToLapTime(currentLapMs) : "—"}
                        </span>
                      );
                    })()}
                  </span>
                </div>
                {/* Row 3: progress bar 0 → 100 % of the lap from META
                    in race direction. The bar grows smoothly because
                    `lapPct` is recomputed at the race-clock cadence
                    (10 Hz on the Tracking tab). */}
                <div className="h-1 bg-white/[0.05] rounded-sm overflow-hidden">
                  <div
                    className="h-full transition-[width] duration-200 ease-linear"
                    style={{
                      width: `${inPit ? 0 : lapPct.toFixed(1)}%`,
                      background: inPit ? "transparent" : fill,
                      opacity: inPit ? 0 : 0.85,
                    }}
                  />
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
