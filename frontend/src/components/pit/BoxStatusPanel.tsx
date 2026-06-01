"use client";

/**
 * Reusable Box-status widgets — extracted del bloque grande de
 * `FifoQueue.tsx` para poder reutilizarlos en Tracking (debajo del
 * mapa) sin duplicar lógica.
 *
 *   <BoxFifoView />        — box-score card + FIFO queue grid (con
 *                            modal opcional de detalle de kart), y
 *                            cuando `fifo.manualMode === true`:
 *                            pre-cola arrastrable + drop zones por
 *                            fila vía @dnd-kit.
 *   <PitInProgressCard />  — card única "PIT EN CURSO" con el
 *                            cronómetro live del pit de NUESTRO kart.
 *
 * Ambos leen su estado de `useRaceStore` directamente (no aceptan
 * props): el contrato es "renderiza la información de box del usuario
 * actual", igual desde Box que desde Tracking — no hay diferencias.
 *
 * Las piezas DnD del modo manual (`useManualBoxDnD`,
 * `<ManualPreQueueStrip />`, `<DroppableLane />`, `<DraggableKart />`)
 * viven en `ManualBoxDnD.tsx` para evitar un ciclo de imports y se
 * usan también en `FifoQueue.tsx` (pestaña Box principal).
 *
 * Replay-safety: el backend NUNCA pone `manualMode=true` en una
 * ReplaySession salvo a velocidad 1x exacta, así que el strip solo
 * aparece cuando ves una sesión live con el toggle activado o un
 * replay a 1x con el toggle activado. Cero código defensivo aquí.
 */
import { useMemo, useState } from "react";
import clsx from "clsx";
import { DndContext } from "@dnd-kit/core";

import { useRaceStore } from "@/hooks/useRaceState";
import { useRaceClock } from "@/hooks/useRaceClock";
import { tierHex, secondsToHMS } from "@/lib/formatters";
import { useT } from "@/lib/i18n";
import type { FifoEntry } from "@/types/race";

import { resolveBoxLineColors } from "@/lib/boxLineColors";
import { FrozenOverlay, KartDetailModal, PitCard } from "./FifoQueue";
import { LineColorChip } from "./LineColorChip";
import {
  DroppableLane,
  ManualPreQueueStrip,
  useManualBoxDnD,
} from "./ManualBoxDnD";

export function BoxFifoView() {
  const t = useT();
  const { fifo, config, karts } = useRaceStore();
  const raceClockMs = useRaceClock();
  const [selectedEntry, setSelectedEntry] = useState<FifoEntry | null>(null);

  const boxLines = config.boxLines || 2;
  // Colores por fila: defaults + override del operador. Se usan tanto
  // para el chip de la cabecera, los botones de asignación rápida en
  // el strip, y el refuerzo visual del borde-izquierdo de cada card.
  const lineColors = resolveBoxLineColors(config.boxLineColors, boxLines);
  const boxKarts = config.boxKarts || 4;
  const kartsPerRow = Math.max(1, Math.ceil(boxKarts / boxLines));

  // Karts "congelados": sin pit-in en los últimos 15 min, o sin
  // historia (placeholders de arranque).
  const frozenKarts = useMemo(() => {
    const raceElapsedMs = config.durationMin * 60 * 1000 - raceClockMs;
    const frozen = new Set<number>();
    for (const kart of karts) {
      const history = kart.pitHistory;
      if (history.length === 0) {
        frozen.add(kart.kartNumber);
        continue;
      }
      if (raceElapsedMs <= 0) continue;
      const last = history[history.length - 1];
      if (last.raceTimeMs > 0) {
        const sinceEntryMin = (raceElapsedMs - last.raceTimeMs) / 1000 / 60;
        if (sinceEntryMin > 15) frozen.add(kart.kartNumber);
      }
    }
    return frozen;
  }, [karts, config.durationMin, raceClockMs]);

  const entryScore = (e: FifoEntry | number): number =>
    typeof e === "number" ? e : (e?.score ?? 25);
  const entryTeam = (e: FifoEntry | number): string =>
    typeof e === "object" && e ? (e.teamName || "") : "";
  const entryDriver = (e: FifoEntry | number): string =>
    typeof e === "object" && e ? (e.driverName || "") : "";

  const rows = useMemo(() => {
    const queue = fifo.queue.slice(0, boxKarts);
    const result: (FifoEntry | number)[][] = Array.from({ length: boxLines }, () => []);
    const realByLine: FifoEntry[][] = Array.from({ length: boxLines }, () => []);
    const defaults: (FifoEntry | number)[] = [];

    // Asignación de fila: respetamos `entry.line` del backend cuando
    // está dentro de rango. Necesario para que el drop del modo
    // manual aparezca en la fila destino. Si `line >= boxLines` (el
    // estratega bajó box_lines mid-race) caemos a `idx % boxLines`
    // como fallback en vez de empujar la entry a "defaults" — ese
    // path rompe el orden cronológico. Misma lógica que `FifoQueue`
    // (la pestaña Box principal).
    const realEntries: FifoEntry[] = [];
    for (const entry of queue) {
      const kartNumber = typeof entry === "object" && entry?.kartNumber ? entry.kartNumber : 0;
      if (kartNumber > 0) {
        realEntries.push(entry as FifoEntry);
      } else {
        defaults.push(entry);
      }
    }
    realEntries.forEach((entry, idx) => {
      const declaredLine = typeof entry.line === "number" ? entry.line : -1;
      const targetLine =
        declaredLine >= 0 && declaredLine < boxLines
          ? declaredLine
          : idx % boxLines;
      realByLine[targetLine].push(entry);
    });

    for (let r = 0; r < boxLines; r++) {
      const realCount = realByLine[r].length;
      const defaultCount = kartsPerRow - realCount;
      for (let i = 0; i < defaultCount && defaults.length > 0; i++) {
        result[r].push(defaults.shift()!);
      }
      result[r].push(...realByLine[r]);
    }
    return result.filter((r) => r.length > 0);
  }, [fifo.queue, boxLines, boxKarts, kartsPerRow]);

  const boxScore = fifo.score ?? 0;
  const scoreDotColor =
    boxScore >= 75 ? "bg-accent" :
    boxScore >= 50 ? "bg-yellow-500" :
    boxScore >= 25 ? "bg-orange-500" :
    "bg-red-500";

  const { sensors, handleDragEnd, assignError } = useManualBoxDnD(boxLines);

  // El return va envuelto en un único <div className="flex flex-col">
  // EN VEZ de un Fragment. Cuando este componente se mete dentro del
  // grid `grid-cols-[1fr_140px]` de Tracking, un Fragment hacía que
  // sus children siblings ocuparan celdas separadas del grid →
  // strip a la izquierda y rows a la derecha. El wrapper div agrupa
  // todo en una sola celda y restablece el flujo strip-arriba /
  // rows-abajo.
  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex flex-col">
        <ManualPreQueueStrip assignError={assignError} />

        <div className="flex gap-2 sm:gap-3" data-tour="box-lanes">
          {/* Box score card (left) */}
          <div className="flex-shrink-0 bg-surface rounded-xl border border-border p-3 sm:p-4 flex flex-col items-center justify-center w-24 sm:w-28">
            <span className={`w-2.5 h-2.5 rounded-full ${scoreDotColor} mb-1.5`} />
            <span className="text-[8px] sm:text-[9px] text-neutral-300 uppercase tracking-widest font-bold mb-1">
              {t("driver.boxScore")}
            </span>
            <span
              className="text-3xl sm:text-4xl font-black leading-none"
              style={{ color: tierHex(boxScore) }}
            >
              {boxScore > 0 ? boxScore.toFixed(1) : "-"}
            </span>
            <span className="text-[8px] text-neutral-600 uppercase tracking-widest mt-0.5">/ 100</span>
          </div>

          {/* FIFO queue rows (right, takes remaining space) */}
          <div className="flex-1 bg-surface rounded-xl border border-border p-2 sm:p-3">
            <div className="space-y-2 sm:space-y-3">
              {rows.map((row, rowIdx) => (
                <DroppableLane key={rowIdx} lineIdx={rowIdx} enabled={fifo.manualMode}>
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <div className="flex-shrink-0 w-6 sm:w-8 text-center text-base sm:text-xl">🏁</div>

                    <div className="flex gap-1 sm:gap-2 flex-1 overflow-x-auto">
                      {row.map((entry, colIdx) => {
                        const score = entryScore(entry);
                        const team = entryTeam(entry);
                        const driver = entryDriver(entry);
                        const kartNum = typeof entry === "object" && entry ? entry.kartNumber : null;
                        const isFrozen = kartNum ? frozenKarts.has(kartNum) : true;
                        const hasInfo = team || driver;

                        const liveKart = kartNum
                          ? karts.find((k) => k.kartNumber === kartNum)
                          : null;
                        const raceElapsedMs = config.durationMin * 60 * 1000 - raceClockMs;
                        // Preferimos el timestamp PROPIO de la entry
                        // (entry.pitInRaceTimeMs) sobre `pit_history[-1]`
                        // del kart. Cuando un kart tiene N entries en
                        // el FIFO (varias pits dentro del rolling
                        // window), pit_history[-1] devuelve la última
                        // → todas las cards mostraban el mismo timer.
                        // El backend emite `pitInRaceTimeMs` desde el
                        // commit del `add_entry`; los backends viejos
                        // no lo envían y caemos al fallback antiguo.
                        const entryPitMs =
                          typeof entry === "object" && entry && typeof entry.pitInRaceTimeMs === "number"
                            ? entry.pitInRaceTimeMs
                            : 0;
                        const lastPit = liveKart?.pitHistory?.length
                          ? liveKart.pitHistory[liveKart.pitHistory.length - 1]
                          : null;
                        const refPitMs = entryPitMs > 0
                          ? entryPitMs
                          : (lastPit?.raceTimeMs ?? 0);
                        const sinceLastPitSec =
                          refPitMs > 0 && raceElapsedMs > refPitMs
                            ? (raceElapsedMs - refPitMs) / 1000
                            : 0;
                        const showPitTimer = sinceLastPitSec > 0;
                        const isInPit = liveKart?.pitStatus === "in_pit";

                        return (
                          <button
                            key={colIdx}
                            onClick={() => typeof entry === "object" && entry && setSelectedEntry(entry)}
                            className={clsx(
                              "flex-1 min-w-[48px] sm:min-w-[80px] max-w-[140px] rounded-lg border-2 flex flex-col items-center justify-center py-1 sm:py-1.5 px-1 transition-all hover:border-accent/50 cursor-pointer active:scale-95 relative overflow-hidden",
                              isFrozen
                                ? "border-blue-400/70 bg-blue-950/30 hover:bg-blue-900/40"
                                : "border-neutral-600 bg-neutral-800/50 hover:bg-neutral-700/50"
                            )}
                            // Refuerzo visual: franja de color en el
                            // borde izquierdo del color de SU fila.
                            // Solo cuando es una entry real (con kart);
                            // los placeholders 25/Box no llevan franja
                            // para no enturbiar el grid.
                            style={
                              kartNum
                                ? { boxShadow: `inset 4px 0 0 ${lineColors[rowIdx] ?? "transparent"}` }
                                : undefined
                            }
                          >
                            {isFrozen && <FrozenOverlay />}

                            {showPitTimer && (
                              <span
                                className={clsx(
                                  "hidden sm:flex absolute top-0.5 right-0.5 items-center gap-0.5 rounded text-[9px] font-mono font-bold px-1 py-px z-10 border",
                                  isInPit
                                    ? "bg-cyan-500/20 border-cyan-400/60 text-cyan-300 animate-pulse"
                                    : "bg-neutral-700/40 border-neutral-500/40 text-neutral-300"
                                )}
                                title={
                                  isInPit
                                    ? `En pit hace ${secondsToHMS(sinceLastPitSec)}`
                                    : `Última entrada a boxes hace ${secondsToHMS(sinceLastPitSec)}`
                                }
                              >
                                {secondsToHMS(sinceLastPitSec)}
                              </span>
                            )}

                            <span
                              className="text-lg sm:text-2xl font-bold leading-tight"
                              style={{ color: tierHex(score) }}
                            >
                              {score}
                            </span>
                            {hasInfo ? (
                              <>
                                <span className="text-[7px] sm:text-[9px] text-neutral-300 mt-0.5 truncate w-full text-center leading-tight font-medium">
                                  {team}
                                </span>
                                <span className="text-[6px] sm:text-[8px] text-neutral-500 truncate w-full text-center leading-tight">
                                  {driver}
                                </span>
                              </>
                            ) : (
                              <span className="text-[9px] sm:text-[10px] text-neutral-500 mt-0.5">Box</span>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex-shrink-0 flex items-center gap-1">
                      <LineColorChip lineIdx={rowIdx} boxLines={boxLines} />
                      <span className="text-[10px] sm:text-xs text-red-400 font-bold">F{rowIdx + 1}</span>
                      <span className="text-red-400 text-xs sm:text-sm">&larr;</span>
                    </div>
                  </div>
                </DroppableLane>
              ))}
            </div>
          </div>
        </div>

        {selectedEntry !== null && (
          <KartDetailModal entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
        )}
      </div>
    </DndContext>
  );
}

/**
 * Card único "PIT EN CURSO" con cronómetro live del pit del kart del
 * usuario. Cuando el kart no está en pit, muestra 00:00:00 y sin
 * acento. Cuando está en pit, muestra el tiempo desde el cruce de
 * PIT-IN (mismo cálculo que la columna "Current pit" de FifoQueue
 * para que ambas pestañas estén en sync).
 *
 * Se sirve dentro de un grid de PitCards en Box; en Tracking lo
 * usamos como tile suelto al lado de BoxFifoView.
 */
export function PitInProgressCard({ className }: { className?: string }) {
  const t = useT();
  const { config, karts } = useRaceStore();
  const raceClockMs = useRaceClock();

  const ourKart = config.ourKartNumber > 0
    ? karts.find((k) => k.kartNumber === config.ourKartNumber)
    : undefined;

  const pitElapsedSec = useMemo(() => {
    if (!ourKart || ourKart.pitStatus !== "in_pit" || raceClockMs === 0) return 0;
    const history = ourKart.pitHistory;
    if (history.length > 0) {
      const last = history[history.length - 1];
      if (last.pitTimeMs === 0 && last.raceTimeMs > 0) {
        const raceElapsedMs = config.durationMin * 60 * 1000 - raceClockMs;
        return Math.max(0, (raceElapsedMs - last.raceTimeMs) / 1000);
      }
    }
    return 0;
  }, [ourKart, config.durationMin, raceClockMs]);

  const inPit = ourKart?.pitStatus === "in_pit";

  return (
    <div className={className}>
      <PitCard
        label={t("pit.currentPit")}
        value={inPit ? secondsToHMS(pitElapsedSec) : secondsToHMS(0)}
        accent={inPit}
      />
    </div>
  );
}
