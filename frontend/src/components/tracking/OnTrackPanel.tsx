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
import { useEffect, useMemo, useRef, useState } from "react";
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
  //   `progressM`     — distancia en el polyline (m). null si en pit.
  //   `raceProgress`  — distancia recorrida desde META en sentido de
  //                     carrera (0..total). Crece monotónicamente
  //                     durante una vuelta. null si en pit.
  //   `lapPct`        — % de vuelta para la barra inferior.
  //   `currentLapMs`  — tiempo desde el último cruce de META.
  const allRows = useMemo(() => {
    const total = trackConfig.trackLengthM ?? 0;
    return karts.map((k) => {
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
      return { kart: k, inPit, progressM, raceProgress, sector, lapPct, currentLapMs };
    });
  }, [karts, trackConfig, countdownMs, direction]);

  // ─── Modo "ventana de 9 alrededor de mi kart" ────────────────────
  //
  // Sustituye la lista clásica (P1..PN del timing-table) por una
  // ventana de 4 delante + yo + 4 detrás según el ORDEN FÍSICO EN
  // PISTA (no la clasificación). Lo que es "delante en pista" se
  // calcula con `raceProgressFromMeta`: a más recorrido en la
  // vuelta actual, más cerca de META → físicamente más adelante.
  //
  // Reglas (acordadas con el user):
  //   - Karts en pit se excluyen del orden — no están en pista.
  //   - Si MI kart está en pit (o no configurado) caemos a la
  //     lista clásica ordenada por posición Apex con scroll, igual
  //     que antes. La ventana solo aplica cuando estoy en pista.
  //   - Wrap-around modulo N: si soy el líder, los "4 delante" son
  //     los 4 últimos del campo en el polyline (físicamente delante
  //     de mí si sigo avanzando, aunque estén una vuelta por detrás
  //     en clasificación).
  const myRow = useMemo(
    () => allRows.find((r) => r.kart.kartNumber === myKartNumber),
    [allRows, myKartNumber],
  );
  const useWindow = !!myRow && !myRow.inPit && myRow.raceProgress != null && myKartNumber > 0;

  const { rows, windowMode } = useMemo(() => {
    if (!useWindow) {
      // Fallback: lista completa por posición Apex, con scroll.
      const sortedByPos = [...allRows].sort((a, b) => {
        const pa = a.kart.position && a.kart.position > 0 ? a.kart.position : Infinity;
        const pb = b.kart.position && b.kart.position > 0 ? b.kart.position : Infinity;
        if (pa !== pb) return pa - pb;
        return a.kart.kartNumber - b.kart.kartNumber;
      });
      return { rows: sortedByPos, windowMode: false };
    }

    // Ordenar SOLO los on-track por raceFromMeta descendente
    // (mayor = más recorrido en la vuelta = físicamente más
    // adelante). Empates por número de kart para estabilidad.
    const onTrack = allRows
      .filter((r) => !r.inPit && r.raceProgress != null)
      .sort((a, b) => {
        const dr = (b.raceProgress as number) - (a.raceProgress as number);
        if (dr !== 0) return dr;
        return a.kart.kartNumber - b.kart.kartNumber;
      });

    const N = onTrack.length;
    // Con menos de 9 on-track no hay nada que recortar.
    if (N <= 9) return { rows: onTrack, windowMode: true };

    const myIdx = onTrack.findIndex((r) => r.kart.kartNumber === myKartNumber);
    if (myIdx < 0) return { rows: onTrack.slice(0, 9), windowMode: true };

    // Ventana ±4 con wrap-around. `off=-4` arriba (más delante),
    // `off=+4` abajo (más detrás).
    const win: typeof onTrack = [];
    for (let off = -4; off <= 4; off++) {
      const idx = ((myIdx + off) % N + N) % N;
      win.push(onTrack[idx]);
    }
    return { rows: win, windowMode: true };
  }, [allRows, useWindow, myKartNumber]);

  // Auto-centrar la lista en NUESTRO kart SOLO en modo fallback (mi
  // kart en pit, o sin kart configurado): ahí mostramos la lista
  // completa con scroll y conviene centrarla automáticamente la
  // primera vez. En modo ventana el kart está siempre centrado por
  // construcción y no hace falta scroll alguno.
  const hasMyKart = useMemo(
    () => karts.some((k) => k.kartNumber === myKartNumber),
    [karts, myKartNumber],
  );
  useEffect(() => {
    if (windowMode) return; // ventana = ya centrado por construcción
    if (!hasMyKart || !myRowRef.current || !listRef.current) return;
    if (centeredForKartRef.current === myKartNumber) return;
    myRowRef.current.scrollIntoView({ block: "center", behavior: "auto" });
    centeredForKartRef.current = myKartNumber;
  }, [hasMyKart, myKartNumber, windowMode]);

  return (
    // En modo VENTANA (kart configurado y on-track) el aside sizea a
    // contenido — 9 filas exactas + labels delante/detrás + header.
    // En modo FALLBACK (mi kart en pit, o sin kart configurado)
    // mantiene `lg:h-[504px]` con scroll interno como antes.
    // `lg:items-start` en el grid parent (TrackingTab) permite que
    // el aside no se estire a la altura del map card cuando es más
    // bajo o más alto.
    <aside className={`bg-surface border border-border rounded-xl p-3 flex flex-col min-h-0 ${windowMode ? "" : "lg:h-[504px]"}`}>
      <h3 className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2 px-1 shrink-0">
        {t("tracking.panel.title")}
      </h3>
      {/* Label "▲ DELANTE EN PISTA" — solo en modo ventana. Enmarca
          las 4 filas superiores que están físicamente por delante de
          nosotros en la vuelta actual (con wrap-around si somos
          líderes). Color tenue para no robar protagonismo a las
          filas de karts. */}
      {windowMode && rows.length > 1 && (
        <div className="text-[9px] font-semibold uppercase tracking-widest text-neutral-600 px-1 pb-0.5 flex items-center gap-1 shrink-0">
          <span className="text-accent">▲</span>
          <span>{t("tracking.panel.ahead")}</span>
        </div>
      )}
      <div ref={listRef} className={`space-y-0 ${windowMode ? "shrink-0" : "overflow-y-auto flex-1 min-h-0 pr-1 -mr-1"}`}>
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
      {/* Label "▼ DETRÁS EN PISTA" — cierra la ventana de 9. Mismo
          tratamiento visual que el de delante para mantener la
          simetría. Se oculta en fallback (todos los karts ordenados
          por Apex). */}
      {windowMode && rows.length > 1 && (
        <div className="text-[9px] font-semibold uppercase tracking-widest text-neutral-600 px-1 pt-0.5 flex items-center gap-1 shrink-0">
          <span className="text-accent">▼</span>
          <span>{t("tracking.panel.behind")}</span>
        </div>
      )}
    </aside>
  );
}
