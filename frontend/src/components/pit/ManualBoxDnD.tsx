"use client";

/**
 * Piezas reutilizables para el flow de modo manual (drag&drop pre-cola → fila).
 *
 * Vive en su propio archivo para evitar un ciclo de imports
 * (BoxStatusPanel.tsx ya importa de FifoQueue.tsx para reusar
 * FrozenOverlay/KartDetailModal/PitCard; si las piezas DnD vivieran
 * en BoxStatusPanel también, FifoQueue → BoxStatusPanel → FifoQueue
 * se cerraría en ciclo).
 *
 * Exporta:
 *   - `useManualBoxDnD(boxLines)` — sensores + handler de drag-end
 *     con optimistic UI + 409 rollback + estado transitorio de error.
 *   - `<ManualPreQueueStrip />` — banner amarillo arriba con los
 *     karts arrastrables. NO incluye el `<DndContext>`; el caller lo
 *     envuelve junto con las dropzones (filas F{N}).
 *   - `<DroppableLane />` — wrapper de `useDroppable` para cada fila.
 *   - `<DraggableKart />` — card amarilla con countdown de 15 s.
 *   - `MANUAL_TIMEOUT_S` — constante (15 s) sincronizada con el
 *     `MANUAL_TIMEOUT_S` del backend (`backend/app/engine/fifo.py`).
 */
import { useEffect, useState } from "react";
import clsx from "clsx";
import {
  DragEndEvent,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";

import { useRaceStore } from "@/hooks/useRaceState";
import { api } from "@/lib/api";
import { resolveBoxLineColors } from "@/lib/boxLineColors";
import { tierHex } from "@/lib/formatters";
import { useT } from "@/lib/i18n";
import type { FifoEntry } from "@/types/race";

export const MANUAL_TIMEOUT_S = 15;

/**
 * Hook compartido por `BoxFifoView` (Tracking) y `FifoQueue` (Box
 * principal). Encapsula sensores de @dnd-kit, manejador de drag-end
 * con optimistic UI + 409 rollback, y un estado transitorio de
 * error que se autolimpia tras 3 s.
 */
export function useManualBoxDnD(boxLines: number) {
  const t = useT();
  const [assignError, setAssignError] = useState<string | null>(null);
  useEffect(() => {
    if (!assignError) return;
    const tid = setTimeout(() => setAssignError(null), 3000);
    return () => clearTimeout(tid);
  }, [assignError]);

  // Sensores que cubren mouse/trackpad (pointer) y táctil (iPads en
  // la pared del box). Sin TouchSensor el drag no arranca en
  // dispositivos sin ratón.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const fifo = useRaceStore.getState().fifo;
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

  return { sensors, handleDragEnd, assignError };
}

/**
 * Strip amarillo de pre-cola del modo manual. Solo se renderiza
 * cuando `fifo.manualMode === true`. Muestra cada entrada como un
 * `<DraggableKart>` arrastrable (countdown de 15 s incluido). Recibe
 * el `assignError` del hook para mostrarlo en la cabecera del strip
 * con flash de 3 s.
 *
 * NO incluye el DndContext — el caller lo envuelve junto con las
 * filas del box (las dropzones viven ahí).
 */
export function ManualPreQueueStrip({ assignError }: { assignError: string | null }) {
  const t = useT();
  const fifo = useRaceStore((s) => s.fifo);
  if (!fifo.manualMode) return null;
  return (
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
  );
}

/**
 * Card del strip de pre-cola con cuenta atrás del timeout (15 s).
 *
 * Dos formas de asignar a una fila del Box:
 *   1) Drag&drop sobre la fila destino — el handler de @dnd-kit
 *      registrado por el padre lo resuelve. La zona "draggable"
 *      cubre el HEADER y el BODY (score, countdown, equipo/piloto).
 *   2) Click en uno de los botones de color al pie de la card — un
 *      botón por fila configurada. Cada botón muestra el color de
 *      su fila (configurable por el operador en la cabecera del
 *      grid) y la etiqueta "F1", "F2", … Es la vía táctil rápida
 *      en iPad, que evita los segundos de imprecisión del drag.
 *
 * Los botones de color usan `e.stopPropagation()` + `onPointerDown`
 * para que el listener de drag no los confunda con el inicio de un
 * arrastre. El countdown del timeout es un %% calculado en cada
 * render a partir de `enqueuedAt` (epoch s); cuando llega a 0 el
 * backend ya habrá commiteado al auto y la entry desaparece del
 * preQueue via WS.
 */
export function DraggableKart({ entry }: { entry: FifoEntry }) {
  const t = useT();
  const config = useRaceStore((s) => s.config);
  const boxLines = config.boxLines || 2;
  const colors = resolveBoxLineColors(config.boxLineColors, boxLines);

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

  const [pendingLine, setPendingLine] = useState<number | null>(null);
  const onQuickAssign = async (line: number) => {
    setPendingLine(line);
    try {
      await api.fifoAssign(entry.kartNumber, line);
      // Optimistic: la entry desaparece del store cuando llegue el
      // broadcast del backend (fifo_update). Si falla, el broadcast
      // posterior la re-añadirá; no hacemos rollback local.
    } catch (e) {
      console.warn("fifoAssign failed", e);
    } finally {
      setPendingLine(null);
    }
  };

  return (
    <div
      style={{ transform: transformStyle }}
      className={clsx(
        "flex-shrink-0 min-w-[88px] rounded-lg border-2 border-yellow-400/70 bg-yellow-950/30 select-none relative overflow-hidden touch-none",
        isDragging && "opacity-60 z-50",
      )}
    >
      {/* Zona arrastrable: header + body. NO incluye los botones
          de abajo (cada botón captura su propio pointerdown). */}
      <div
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        title={t("box.preQueue.dragHint")}
        className="cursor-grab active:cursor-grabbing px-2 pt-1 pb-1"
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
      </div>
      {/* Botones de asignación rápida — uno por fila configurada.
          Color de fondo = color de la fila destino para asociación
          visual instantánea con la cabecera del grid. */}
      <div className="flex gap-0.5 px-1 pb-1.5">
        {colors.map((c, idx) => (
          <button
            key={idx}
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onQuickAssign(idx);
            }}
            disabled={pendingLine !== null}
            title={`Asignar a F${idx + 1}`}
            className={clsx(
              "flex-1 min-w-[18px] h-5 rounded text-[8px] font-bold text-white/95 border border-black/40 leading-none transition-opacity",
              pendingLine === idx ? "opacity-60 animate-pulse" :
              pendingLine !== null ? "opacity-40 cursor-not-allowed" :
              "active:scale-90 hover:brightness-110",
            )}
            style={{ backgroundColor: c }}
          >
            F{idx + 1}
          </button>
        ))}
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
export function DroppableLane({
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
