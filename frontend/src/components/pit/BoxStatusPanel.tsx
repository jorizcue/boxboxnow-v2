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
 * Modo manual (drag&drop)
 * -----------------------
 *
 * Cuando el operador activa `box_manual_mode` en Config y arranca
 * una sesión live, los pit-ins entran a `fifo.preQueue` en vez de a
 * `fifo.queue`. Aquí los renderizamos como strip horizontal encima
 * del grid de filas; cada card es arrastrable. Cada fila F{N} es un
 * drop target. Al soltar:
 *
 *   1. Optimistic UI: quitamos la card del `preQueue` localmente y
 *      la metemos en la fila destino (efímero — el backend va a
 *      mandar la verdad por WS en milisegundos).
 *   2. POST `/api/race/fifo/assign`. En éxito, el broadcast del
 *      backend re-mergea el estado y todo cuadra.
 *   3. En 409 (kart ya no está / línea inválida) rollback al
 *      `preQueue` original + flash de error en el strip.
 *
 * Replay-safety: el backend NUNCA pone `manualMode=true` en una
 * ReplaySession, así que el strip solo aparece cuando ves una
 * sesión live con el toggle activado. Cero código defensivo aquí.
 */
import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";

import { useRaceStore } from "@/hooks/useRaceState";
import { useRaceClock } from "@/hooks/useRaceClock";
import { api } from "@/lib/api";
import { tierHex, secondsToHMS } from "@/lib/formatters";
import { useT } from "@/lib/i18n";
import type { FifoEntry } from "@/types/race";

import { FrozenOverlay, KartDetailModal, PitCard } from "./FifoQueue";

const MANUAL_TIMEOUT_S = 15;

export function BoxFifoView() {
  const t = useT();
  const { fifo, config, karts } = useRaceStore();
  const raceClockMs = useRaceClock();
  const [selectedEntry, setSelectedEntry] = useState<FifoEntry | null>(null);
  // Mensaje de error transitorio cuando un drop devuelve 409.
  // Se autolimpia tras 3 s.
  const [assignError, setAssignError] = useState<string | null>(null);
  useEffect(() => {
    if (!assignError) return;
    const tid = setTimeout(() => setAssignError(null), 3000);
    return () => clearTimeout(tid);
  }, [assignError]);

  const boxLines = config.boxLines || 2;
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
      realByLine[idx % boxLines].push(entry);
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

  // ── Drag & drop (modo manual) ─────────────────────────────────────

  // Sensores que cubren mouse/trackpad (pointer) y táctil (iPads en
  // la pared del box). Sin TouchSensor el drag no arranca en
  // dispositivos sin ratón.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    if (!fifo.manualMode) return;
    const kartNumber = Number(event.active.id);
    const overId = event.over?.id;
    if (overId == null) return;
    const m = String(overId).match(/^lane-(\d+)$/);
    if (!m) return;
    const line = Number(m[1]);
    // Clamp por seguridad — box_lines pudo haber cambiado mientras
    // tenías un drag a medio (el operador toca +/- en otra tab).
    if (!Number.isFinite(line) || line < 0 || line >= boxLines) {
      setAssignError(t("box.assignFailed"));
      return;
    }
    // Optimistic: quitar de preQueue local. Si el server falla,
    // restauramos. El broadcast posterior re-mergea la verdad.
    const prevFifo = useRaceStore.getState().fifo;
    useRaceStore.setState({
      fifo: {
        ...prevFifo,
        preQueue: prevFifo.preQueue.filter((e) => e.kartNumber !== kartNumber),
      },
    });
    try {
      await api.fifoAssign(kartNumber, line);
    } catch {
      // Rollback al estado previo. El broadcast del backend va a
      // pisar esto en milisegundos pero mientras tanto el strip
      // muestra la entry de vuelta.
      useRaceStore.setState({ fifo: prevFifo });
      setAssignError(t("box.assignFailed"));
    }
  };

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <>
        {/* ── Pre-cola del modo manual ── */}
        {fifo.manualMode && (
          <div className="mb-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-2">
            <div className="text-[9px] uppercase tracking-wider font-bold text-yellow-400 mb-1.5 flex items-center justify-between">
              <span>
                {t("box.preQueue.title")}
                {fifo.preQueue.length > 0 && (
                  <span className="ml-1 text-yellow-500/70">({fifo.preQueue.length})</span>
                )}
              </span>
              {assignError && (
                <span className="text-red-400 normal-case tracking-normal">
                  {assignError}
                </span>
              )}
            </div>
            {fifo.preQueue.length === 0 ? (
              <div className="text-[10px] text-yellow-500/50 italic px-1 py-2">
                {t("box.preQueue.empty")}
              </div>
            ) : (
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {fifo.preQueue.map((entry) => (
                  <DraggableKart key={entry.kartNumber} entry={entry} />
                ))}
              </div>
            )}
          </div>
        )}

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
                        const lastPit = liveKart?.pitHistory?.length
                          ? liveKart.pitHistory[liveKart.pitHistory.length - 1]
                          : null;
                        const raceElapsedMs = config.durationMin * 60 * 1000 - raceClockMs;
                        const sinceLastPitSec =
                          lastPit && lastPit.raceTimeMs > 0 && raceElapsedMs > lastPit.raceTimeMs
                            ? (raceElapsedMs - lastPit.raceTimeMs) / 1000
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

                    <div className="flex-shrink-0 flex items-center gap-0.5">
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
      </>
    </DndContext>
  );
}

/**
 * Card del strip de pre-cola con cuenta atrás del timeout (15 s).
 * Usa `useDraggable` para integrarse con el DndContext del parent.
 * El countdown es un %% calculado en cada render a partir de
 * `enqueuedAt` (epoch s); cuando llega a 0 el backend ya habrá
 * commiteado al auto, así que la entry desaparecerá del preQueue
 * via WS (no la quitamos nosotros aquí). */
function DraggableKart({ entry }: { entry: FifoEntry }) {
  const t = useT();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: String(entry.kartNumber),
  });
  // Countdown: si `enqueuedAt` está presente (debería siempre en
  // preQueue) calculamos los segundos restantes y el % del bar.
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const tid = setInterval(() => setNow(Date.now() / 1000), 250);
    return () => clearInterval(tid);
  }, []);
  const enq = entry.enqueuedAt ?? now;
  const elapsed = Math.max(0, now - enq);
  const remaining = Math.max(0, MANUAL_TIMEOUT_S - elapsed);
  const pct = Math.max(0, Math.min(100, (remaining / MANUAL_TIMEOUT_S) * 100));

  const transformStyle = transform
    ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
    : undefined;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ transform: transformStyle }}
      className={clsx(
        "flex-shrink-0 min-w-[72px] rounded-lg border-2 border-yellow-400/70 bg-yellow-950/30 px-2 py-1 cursor-grab active:cursor-grabbing select-none relative overflow-hidden touch-none",
        isDragging && "opacity-60 z-50",
      )}
      title={t("box.preQueue.dragHint")}
    >
      <div className="flex items-center justify-between gap-1">
        <span
          className="text-lg font-bold leading-none"
          style={{ color: tierHex(entry.score ?? 25) }}
        >
          {entry.score ?? 25}
        </span>
        <span className="text-[9px] font-mono font-bold text-yellow-200 tabular-nums">
          {Math.ceil(remaining)}s
        </span>
      </div>
      <div className="text-[8px] text-neutral-200 truncate font-medium">
        {entry.teamName || entry.driverName || `K#${entry.kartNumber}`}
      </div>
      {/* Barra de progreso del countdown */}
      <div className="absolute bottom-0 left-0 h-0.5 bg-yellow-400" style={{ width: `${pct}%` }} />
    </div>
  );
}

/**
 * Wrapper de `useDroppable` para cada fila F{N}. Cuando un
 * `DraggableKart` está pasando por encima añade un highlight visual
 * (border resaltado). Si `enabled` es false (modo auto) el wrapper
 * pasa el children tal cual sin registrarse como dropzone.
 */
function DroppableLane({
  lineIdx,
  enabled,
  children,
}: {
  lineIdx: number;
  enabled: boolean;
  children: React.ReactNode;
}) {
  // Hook SIEMPRE invocado (regla de hooks); cuando `enabled=false`
  // ignoramos el ref y devolvemos el children tal cual.
  const { setNodeRef, isOver } = useDroppable({ id: `lane-${lineIdx}` });
  if (!enabled) return <>{children}</>;
  return (
    <div
      ref={setNodeRef}
      className={clsx(
        "rounded-lg transition-colors",
        isOver && "ring-2 ring-yellow-400 ring-inset bg-yellow-500/5",
      )}
    >
      {children}
    </div>
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
