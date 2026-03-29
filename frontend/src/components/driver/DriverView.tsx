"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRaceStore } from "@/hooks/useRaceState";
import { msToLapTime, tierHex } from "@/lib/formatters";
import { useT } from "@/lib/i18n";

/* ------------------------------------------------------------------ */
/*  Persistent card order                                              */
/* ------------------------------------------------------------------ */

type CardId = "pace" | "position" | "gapAhead" | "gapBehind" | "realPos" | "boxScore";

const DEFAULT_ORDER: CardId[] = ["pace", "position", "gapAhead", "gapBehind", "realPos", "boxScore"];

function loadOrder(): CardId[] {
  if (typeof window === "undefined") return DEFAULT_ORDER;
  try {
    const raw = localStorage.getItem("bbn-driver-order");
    if (raw) {
      const parsed = JSON.parse(raw) as CardId[];
      if (parsed.length === DEFAULT_ORDER.length) return parsed;
    }
  } catch {}
  return DEFAULT_ORDER;
}

function saveOrder(order: CardId[]) {
  localStorage.setItem("bbn-driver-order", JSON.stringify(order));
}

/* ------------------------------------------------------------------ */
/*  Touch drag-and-drop hook                                           */
/* ------------------------------------------------------------------ */

function useTouchDrag(
  cardOrder: CardId[],
  setCardOrder: (order: CardId[]) => void
) {
  const draggingIdx = useRef<number | null>(null);
  const cardRects = useRef<Map<number, DOMRect>>(new Map());
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);

  const registerRect = useCallback((index: number, el: HTMLElement | null) => {
    if (el) {
      cardRects.current.set(index, el.getBoundingClientRect());
    }
  }, []);

  const onTouchStart = useCallback((index: number, e: React.TouchEvent) => {
    // Long press to start dragging (300ms)
    longPressTimer.current = setTimeout(() => {
      draggingIdx.current = index;
      setDragging(index);
      // Vibrate if available
      if (navigator.vibrate) navigator.vibrate(30);
    }, 300);
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (draggingIdx.current === null) {
      // Cancel long press if finger moves
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
      return;
    }
    e.preventDefault();
    const touch = e.touches[0];
    // Find which card the touch is over
    const entries = Array.from(cardRects.current.entries());
    for (const [idx, rect] of entries) {
      if (
        touch.clientX >= rect.left &&
        touch.clientX <= rect.right &&
        touch.clientY >= rect.top &&
        touch.clientY <= rect.bottom &&
        idx !== draggingIdx.current
      ) {
        // Swap
        const newOrder = [...cardOrder];
        const fromIdx = draggingIdx.current!;
        const [dragged] = newOrder.splice(fromIdx, 1);
        newOrder.splice(idx, 0, dragged);
        setCardOrder(newOrder);
        saveOrder(newOrder);
        draggingIdx.current = idx;
        break;
      }
    }
  }, [cardOrder, setCardOrder]);

  const onTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    draggingIdx.current = null;
    setDragging(null);
  }, []);

  return { dragging, registerRect, onTouchStart, onTouchMove, onTouchEnd };
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function DriverView() {
  const t = useT();
  const { karts, config, fifo, connected } = useRaceStore();
  const [now, setNow] = useState(() => Date.now() / 1000);
  const [cardOrder, setCardOrder] = useState<CardId[]>(DEFAULT_ORDER);
  const [editMode, setEditMode] = useState(false);

  const { dragging, registerRect, onTouchStart, onTouchMove, onTouchEnd } =
    useTouchDrag(cardOrder, setCardOrder);

  // Hydrate order from localStorage on mount
  useEffect(() => {
    setCardOrder(loadOrder());
  }, []);

  // Tick every second
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(iv);
  }, []);

  const circuitLengthM = config.circuitLengthM || 1100;
  const pitTimeS = config.pitTimeS || 0;
  const ourKart = config.ourKartNumber;

  /* ---------- Compute adjusted classification (distance-based) ---------- */
  const { ourData } = useMemo(() => {
    if (karts.length === 0 || ourKart <= 0)
      return { ourData: null };

    const maxPits = Math.max(...karts.map((k) => k.pitCount), 0);

    const mapped = karts
      .filter((k) => k.totalLaps > 0)
      .map((kart) => {
        const speedMs = kart.avgLapMs > 0 ? circuitLengthM / (kart.avgLapMs / 1000) : 0;
        const baseDistM = kart.totalLaps * circuitLengthM;

        let metersExtra = 0;
        if (kart.pitStatus === "racing" && speedMs > 0 && kart.stintStartTime > 0) {
          const wallS = Math.max(0, now - kart.stintStartTime);
          const stintElS = kart.stintElapsedMs / 1000;
          const sinceCross = wallS - stintElS;
          if (sinceCross > 0) {
            metersExtra = Math.min(sinceCross * speedMs, circuitLengthM * 0.99);
          }
        }

        const totalDist = baseDistM + metersExtra;
        const missing = Math.max(0, maxPits - kart.pitCount);
        const penalty = missing * speedMs * pitTimeS;
        const adjDist = totalDist - penalty;

        return { ...kart, speedMs, adjDist };
      })
      .sort((a, b) => b.adjDist - a.adjDist);

    const ourIdx = mapped.findIndex((k) => k.kartNumber === ourKart);
    if (ourIdx === -1) return { ourData: null };

    const our = mapped[ourIdx];
    const ahead = ourIdx > 0 ? mapped[ourIdx - 1] : null;
    const behind = ourIdx < mapped.length - 1 ? mapped[ourIdx + 1] : null;

    const aheadDistDiff = ahead ? ahead.adjDist - our.adjDist : 0;
    const aheadTimeDiff = our.speedMs > 0 ? aheadDistDiff / our.speedMs : 0;

    const behindDistDiff = behind ? our.adjDist - behind.adjDist : 0;
    const behindTimeDiff = behind && behind.speedMs > 0 ? behindDistDiff / behind.speedMs : 0;

    return {
      ourData: {
        kart: our,
        realPosition: ourIdx + 1,
        totalKarts: mapped.length,
        aheadKart: ahead,
        behindKart: behind,
        aheadMeters: Math.round(aheadDistDiff),
        aheadSeconds: aheadTimeDiff,
        behindMeters: Math.round(behindDistDiff),
        behindSeconds: behindTimeDiff,
      },
    };
  }, [karts, now, ourKart, circuitLengthM, pitTimeS]);

  /* ---------- Race position by avg pace ---------- */
  const racePosition = useMemo(() => {
    if (!ourKart || karts.length === 0) return null;
    const sorted = [...karts]
      .filter((k) => k.avgLapMs > 0)
      .sort((a, b) => a.avgLapMs - b.avgLapMs);
    const idx = sorted.findIndex((k) => k.kartNumber === ourKart);
    return idx >= 0 ? { pos: idx + 1, total: sorted.length } : null;
  }, [karts, ourKart]);

  /* ---------- Pace display ---------- */
  const paceDisplay = useMemo(() => {
    if (!ourKart) return null;
    const kart = karts.find((k) => k.kartNumber === ourKart);
    if (!kart) return null;
    return {
      avgLapMs: kart.avgLapMs,
      lastLapMs: kart.lastLapMs,
    };
  }, [karts, ourKart]);

  /* ---------- Desktop drag (HTML5 API) ---------- */
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  const onDragStart = useCallback((index: number) => {
    dragItem.current = index;
  }, []);

  const onDragEnter = useCallback((index: number) => {
    dragOverItem.current = index;
  }, []);

  const onDragEnd = useCallback(() => {
    if (dragItem.current === null || dragOverItem.current === null) return;
    if (dragItem.current === dragOverItem.current) return;
    const newOrder = [...cardOrder];
    const [d] = newOrder.splice(dragItem.current, 1);
    newOrder.splice(dragOverItem.current, 0, d);
    setCardOrder(newOrder);
    saveOrder(newOrder);
    dragItem.current = null;
    dragOverItem.current = null;
  }, [cardOrder]);

  /* ---------- Waiting for data / no kart ---------- */
  const hasReceivedData = karts.length > 0 || config.ourKartNumber > 0;

  if (!hasReceivedData) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <span className="text-accent text-lg font-bold animate-pulse">BBN</span>
          <p className="text-neutral-500 text-sm">{connected ? t("common.loading") : t("driver.connecting")}</p>
        </div>
      </div>
    );
  }

  if (ourKart <= 0) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <p className="text-4xl">🏎️</p>
          <p className="text-neutral-300 text-lg font-semibold">{t("driver.noKart")}</p>
          <p className="text-neutral-600 text-sm">{t("driver.noKartHint")}</p>
        </div>
      </div>
    );
  }

  /* ---------- Card definitions ---------- */

  const boxScore = fifo?.score ?? 0;

  const cards: Record<CardId, { label: string; content: React.ReactNode; accent: string }> = {
    pace: {
      label: t("driver.pace"),
      accent: "from-blue-500/20 to-blue-500/5 border-blue-500/30",
      content: (
        <div className="flex flex-col items-center gap-1">
          <span className="text-3xl sm:text-4xl font-mono font-black text-white leading-none tracking-tight">
            {paceDisplay?.avgLapMs ? msToLapTime(Math.round(paceDisplay.avgLapMs)) : "--:--.---"}
          </span>
          <span className="text-[10px] sm:text-xs text-neutral-500">
            {t("driver.lastLap")}: {paceDisplay?.lastLapMs ? msToLapTime(paceDisplay.lastLapMs) : "-"}
          </span>
        </div>
      ),
    },
    position: {
      label: t("driver.pacePosition"),
      accent: "from-purple-500/20 to-purple-500/5 border-purple-500/30",
      content: (
        <div className="flex items-baseline gap-1 justify-center">
          <span className="text-4xl sm:text-5xl font-black text-white leading-none">
            {racePosition ? `P${racePosition.pos}` : "-"}
          </span>
          <span className="text-base sm:text-lg text-neutral-500 font-semibold">
            {racePosition ? `/${racePosition.total}` : ""}
          </span>
        </div>
      ),
    },
    gapAhead: {
      label: `${t("driver.gapAhead")}${ourData?.aheadKart ? ` · K${ourData.aheadKart.kartNumber}` : ""}`,
      accent: "from-red-500/20 to-red-500/5 border-red-500/30",
      content: ourData?.aheadKart ? (
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-3xl sm:text-4xl font-mono font-black text-red-400 leading-none">
            -{ourData.aheadSeconds.toFixed(1)}s
          </span>
          <span className="text-xs sm:text-sm text-red-400/60 font-mono">
            -{ourData.aheadMeters.toLocaleString()}m
          </span>
        </div>
      ) : (
        <span className="text-3xl sm:text-4xl font-black text-accent leading-none">P1 🏆</span>
      ),
    },
    gapBehind: {
      label: `${t("driver.gapBehind")}${ourData?.behindKart ? ` · K${ourData.behindKart.kartNumber}` : ""}`,
      accent: "from-green-500/20 to-green-500/5 border-green-500/30",
      content: ourData?.behindKart ? (
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-3xl sm:text-4xl font-mono font-black text-green-400 leading-none">
            +{ourData.behindSeconds.toFixed(1)}s
          </span>
          <span className="text-xs sm:text-sm text-green-400/60 font-mono">
            +{ourData.behindMeters.toLocaleString()}m
          </span>
        </div>
      ) : (
        <span className="text-2xl sm:text-3xl font-black text-neutral-500 leading-none">{t("driver.last")}</span>
      ),
    },
    realPos: {
      label: t("driver.realPosition"),
      accent: "from-accent/20 to-accent/5 border-accent/30",
      content: (
        <div className="flex items-baseline gap-1 justify-center">
          <span className="text-4xl sm:text-5xl font-black text-accent leading-none">
            {ourData ? `P${ourData.realPosition}` : "-"}
          </span>
          <span className="text-base sm:text-lg text-neutral-500 font-semibold">
            {ourData ? `/${ourData.totalKarts}` : ""}
          </span>
        </div>
      ),
    },
    boxScore: {
      label: t("driver.boxScore"),
      accent: "from-yellow-500/20 to-yellow-500/5 border-yellow-500/30",
      content: (
        <div className="flex flex-col items-center gap-0.5">
          <span
            className="text-4xl sm:text-5xl font-black leading-none"
            style={{ color: tierHex(boxScore) }}
          >
            {boxScore}
          </span>
          <span className="text-[9px] sm:text-[10px] text-neutral-600 uppercase tracking-widest">/ 100</span>
        </div>
      ),
    },
  };

  return (
    <div className="min-h-screen bg-black flex flex-col select-none">
      {/* Minimal header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/20 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-white tracking-wider">
            BB<span className="text-accent">N</span>
          </span>
          <div className={`w-2 h-2 rounded-full ${connected ? "bg-accent" : "bg-red-500 animate-pulse"}`} />
        </div>
        <span className="text-sm font-bold text-white tracking-wide">
          {t("driver.title")} — K{ourKart}
        </span>
        <button
          onClick={() => setEditMode(!editMode)}
          className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded transition-colors ${
            editMode ? "bg-accent/20 text-accent" : "text-neutral-500 hover:text-neutral-300"
          }`}
        >
          {editMode ? "✓" : "⇄"}
        </button>
      </div>

      {/* Cards grid — 3×2 landscape layout */}
      <div className="flex-1 p-2 sm:p-3 overflow-hidden">
        <div className="grid grid-cols-3 grid-rows-2 gap-2 sm:gap-3 h-full">
          {cardOrder.map((cardId, index) => {
            const card = cards[cardId];
            const isDragging = dragging === index;
            return (
              <div
                key={cardId}
                ref={(el) => registerRect(index, el)}
                draggable={editMode}
                onDragStart={() => onDragStart(index)}
                onDragEnter={() => onDragEnter(index)}
                onDragEnd={onDragEnd}
                onDragOver={(e) => e.preventDefault()}
                onTouchStart={(e) => editMode && onTouchStart(index, e)}
                onTouchMove={(e) => editMode && onTouchMove(e)}
                onTouchEnd={() => editMode && onTouchEnd()}
                className={`
                  relative rounded-xl border bg-gradient-to-b ${card.accent}
                  flex flex-col items-center justify-center
                  p-1.5 sm:p-3
                  ${editMode ? "cursor-grab active:cursor-grabbing" : ""}
                  ${isDragging ? "opacity-50 scale-95" : ""}
                  ${editMode ? "animate-[wiggle_0.3s_ease-in-out_infinite]" : ""}
                  transition-all duration-150
                `}
              >
                <span className="text-[8px] sm:text-[10px] text-neutral-500 uppercase tracking-widest mb-1 sm:mb-2 font-bold text-center leading-tight">
                  {card.label}
                </span>
                {card.content}
                {editMode && (
                  <div className="absolute top-1 right-1.5 text-neutral-600 text-[10px]">⋮⋮</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
