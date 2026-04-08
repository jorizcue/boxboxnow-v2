"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRaceStore } from "@/hooks/useRaceState";
import { useSimNow } from "@/hooks/useSimNow";
import { msToLapTime, tierHex } from "@/lib/formatters";
import { getDriverChannel } from "@/lib/driverChannel";
import { useT } from "@/lib/i18n";
import { useRaceBox, useRaceBoxStore } from "@/hooks/useRaceBox";

/* ------------------------------------------------------------------ */
/*  Persistent card order                                              */
/* ------------------------------------------------------------------ */

type CardId = "lastLap" | "pace" | "position" | "gapAhead" | "gapBehind" | "realPos" | "boxScore" | "gpsLapDelta" | "gpsSpeed" | "gpsGForce";

const DEFAULT_ORDER: CardId[] = ["lastLap", "pace", "position", "gapAhead", "gapBehind", "realPos", "boxScore", "gpsLapDelta", "gpsSpeed", "gpsGForce"];

function loadOrder(): CardId[] {
  if (typeof window === "undefined") return DEFAULT_ORDER;
  try {
    const raw = localStorage.getItem("bbn-driver-order");
    if (raw) {
      const parsed = JSON.parse(raw) as CardId[];
      // Reset if card set changed (new cards added / removed)
      const hasAll = DEFAULT_ORDER.every((c) => parsed.includes(c));
      if (parsed.length === DEFAULT_ORDER.length && hasAll) return parsed;
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

  const onTouchStart = useCallback((index: number) => {
    longPressTimer.current = setTimeout(() => {
      draggingIdx.current = index;
      setDragging(index);
      if (navigator.vibrate) navigator.vibrate(30);
    }, 300);
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (draggingIdx.current === null) {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
      return;
    }
    e.preventDefault();
    const touch = e.touches[0];
    const entries = Array.from(cardRects.current.entries());
    for (const [idx, rect] of entries) {
      if (
        touch.clientX >= rect.left &&
        touch.clientX <= rect.right &&
        touch.clientY >= rect.top &&
        touch.clientY <= rect.bottom &&
        idx !== draggingIdx.current
      ) {
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
/*  Lap delta flash hook                                               */
/* ------------------------------------------------------------------ */

type LapDelta = "faster" | "slower" | null;

function useLapDelta(ourKart: number): { delta: LapDelta; deltaMs: number } {
  const karts = useRaceStore((s) => s.karts);
  const [delta, setDelta] = useState<LapDelta>(null);
  const [deltaMs, setDeltaMs] = useState(0);
  const prevLapCount = useRef<number>(0);
  const flashTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (ourKart <= 0) return;
    const kart = karts.find((k) => k.kartNumber === ourKart);
    if (!kart) return;

    // Detect new lap
    if (kart.totalLaps > prevLapCount.current && prevLapCount.current > 0) {
      if (kart.lastLapMs > 0 && kart.avgLapMs > 0) {
        const diff = kart.lastLapMs - kart.avgLapMs;
        setDelta(diff <= 0 ? "faster" : "slower");
        setDeltaMs(diff);

        // Clear flash after 8 seconds
        if (flashTimeout.current) clearTimeout(flashTimeout.current);
        flashTimeout.current = setTimeout(() => {
          setDelta(null);
          setDeltaMs(0);
        }, 8000);
      }
    }
    prevLapCount.current = kart.totalLaps;
  }, [karts, ourKart]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (flashTimeout.current) clearTimeout(flashTimeout.current);
    };
  }, []);

  return { delta, deltaMs };
}

/* ------------------------------------------------------------------ */
/*  Previous lap tracking hook                                         */
/* ------------------------------------------------------------------ */

function usePrevLap(ourKart: number): { prevLapMs: number; lastLapMs: number; lapDelta: "faster" | "slower" | null } {
  const karts = useRaceStore((s) => s.karts);
  const prevRef = useRef<number>(0);
  const [prevLapMs, setPrevLapMs] = useState(0);
  const [lastLapMs, setLastLapMs] = useState(0);
  const [lapDelta, setLapDelta] = useState<"faster" | "slower" | null>(null);

  useEffect(() => {
    if (ourKart <= 0) return;
    const kart = karts.find((k) => k.kartNumber === ourKart);
    if (!kart || kart.lastLapMs <= 0) return;

    if (kart.lastLapMs !== prevRef.current) {
      // New lap detected
      if (prevRef.current > 0) {
        setPrevLapMs(prevRef.current);
        setLapDelta(kart.lastLapMs < prevRef.current ? "faster" : "slower");
      }
      setLastLapMs(kart.lastLapMs);
      prevRef.current = kart.lastLapMs;
    }
  }, [karts, ourKart]);

  return { prevLapMs, lastLapMs, lapDelta };
}

/* ------------------------------------------------------------------ */
/*  BOX alert hook (listens on BroadcastChannel)                       */
/* ------------------------------------------------------------------ */

function useBoxAlert() {
  const [active, setActive] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const ch = getDriverChannel();
    if (!ch) return;

    const handler = (event: MessageEvent) => {
      if (event.data?.type === "boxCall") {
        setActive(true);
        // Auto-dismiss after 30 seconds
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => setActive(false), 30000);
      }
    };
    ch.addEventListener("message", handler);
    return () => {
      ch.removeEventListener("message", handler);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const dismiss = useCallback(() => {
    setActive(false);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  return { active, dismiss };
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function DriverView() {
  const t = useT();
  const { karts, config, fifo, connected } = useRaceStore();
  const { now, speed } = useSimNow();
  const [cardOrder, setCardOrder] = useState<CardId[]>(DEFAULT_ORDER);
  const [editMode, setEditMode] = useState(false);
  const [showGpsSetup, setShowGpsSetup] = useState(false);

  const { dragging, registerRect, onTouchStart, onTouchMove, onTouchEnd } =
    useTouchDrag(cardOrder, setCardOrder);
  const boxAlert = useBoxAlert();

  // RaceBox GPS
  const raceBox = useRaceBox();
  const gps = useRaceBoxStore();

  // Hydrate order from localStorage on mount
  useEffect(() => {
    setCardOrder(loadOrder());
  }, []);

  const circuitLengthM = config.circuitLengthM || 1100;
  const pitTimeS = config.pitTimeS || 0;
  const ourKart = config.ourKartNumber;

  // Lap delta flash
  const { delta, deltaMs } = useLapDelta(ourKart);
  // Previous lap tracking for lastLap card
  const { lastLapMs: lastLapVal, lapDelta } = usePrevLap(ourKart);

  /* ---------- Compute adjusted classification (distance-based) ---------- */
  const { ourData } = useMemo(() => {
    if (karts.length === 0 || ourKart <= 0)
      return { ourData: null };

    const maxPits = Math.max(...karts.filter((k) => k.pitStatus !== "in_pit").map((k) => k.pitCount), 0);

    const mapped = karts
      .filter((k) => k.totalLaps > 0)
      .map((kart) => {
        const speedMs = kart.avgLapMs > 0 ? circuitLengthM / (kart.avgLapMs / 1000) : 0;
        const baseDistM = kart.totalLaps * circuitLengthM;

        let metersExtra = 0;
        if (kart.pitStatus === "racing" && speedMs > 0 && kart.stintStartTime > 0) {
          const wallS = Math.max(0, (now - kart.stintStartTime) * speed);
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

  // Delta display for pace card
  const deltaDisplay = delta ? (
    <div className={`flex items-center gap-1.5 mt-1 ${delta === "faster" ? "text-green-400" : "text-red-400"}`}>
      {delta === "faster" ? (
        <svg className="w-5 h-5 animate-bounce" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 17a.75.75 0 01-.75-.75V5.612L5.29 9.77a.75.75 0 01-1.08-1.04l5.25-5.5a.75.75 0 011.08 0l5.25 5.5a.75.75 0 11-1.08 1.04l-3.96-4.158V16.25A.75.75 0 0110 17z" clipRule="evenodd" />
        </svg>
      ) : (
        <svg className="w-5 h-5 animate-bounce" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 3a.75.75 0 01.75.75v10.638l3.96-4.158a.75.75 0 111.08 1.04l-5.25 5.5a.75.75 0 01-1.08 0l-5.25-5.5a.75.75 0 111.08-1.04l3.96 4.158V3.75A.75.75 0 0110 3z" clipRule="evenodd" />
        </svg>
      )}
      <span className="text-sm font-mono font-bold">
        {delta === "faster" ? "" : "+"}{(deltaMs / 1000).toFixed(2)}s
      </span>
    </div>
  ) : null;

  const cards: Record<CardId, { label: string; content: React.ReactNode; accent: string }> = {
    lastLap: {
      label: t("driver.lastLap"),
      accent: lapDelta === "faster"
        ? "from-green-500/25 to-green-500/5 border-green-400/50"
        : lapDelta === "slower"
          ? "from-yellow-500/25 to-yellow-500/5 border-yellow-400/50"
          : "from-neutral-500/20 to-neutral-500/5 border-neutral-500/30",
      content: (
        <div className="flex flex-col items-center">
          <span className={`text-3xl sm:text-4xl font-mono font-black leading-none tracking-tight ${
            lapDelta === "faster" ? "text-green-400" : lapDelta === "slower" ? "text-yellow-400" : "text-white"
          }`}>
            {lastLapVal > 0 ? msToLapTime(lastLapVal) : "--:--.---"}
          </span>
          {lapDelta && (
            <div className={`flex items-center gap-1 mt-1.5 ${lapDelta === "faster" ? "text-green-400" : "text-yellow-400"}`}>
              {lapDelta === "faster" ? (
                <span className="text-lg leading-none">↓</span>
              ) : (
                <span className="text-lg leading-none">↑</span>
              )}
              <span className="text-xs font-mono font-bold">
                {lapDelta === "faster" ? t("driver.fasterLap") : t("driver.slowerLap")}
              </span>
            </div>
          )}
        </div>
      ),
    },
    pace: {
      label: t("driver.pace"),
      accent: delta === "faster"
        ? "from-green-500/25 to-green-500/5 border-green-400/50"
        : delta === "slower"
          ? "from-red-500/25 to-red-500/5 border-red-400/50"
          : "from-blue-500/20 to-blue-500/5 border-blue-500/30",
      content: (
        <div className="flex flex-col items-center">
          <span className="text-3xl sm:text-4xl font-mono font-black text-white leading-none tracking-tight">
            {paceDisplay?.avgLapMs ? msToLapTime(Math.round(paceDisplay.avgLapMs)) : "--:--.---"}
          </span>
          <span className="text-[10px] sm:text-xs text-neutral-500 mt-1">
            {t("driver.lastLap")}: {paceDisplay?.lastLapMs ? msToLapTime(paceDisplay.lastLapMs) : "-"}
          </span>
          {deltaDisplay}
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
        <span className="text-3xl sm:text-4xl font-black text-accent leading-none">P1</span>
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
    gpsLapDelta: {
      label: gps.currentLapNumber > 0
        ? `${t("driver.gpsLapDelta")} · V${gps.currentLapNumber}`
        : t("driver.gpsLapDelta"),
      accent: gps.deltaMs !== null
        ? gps.deltaMs < 0
          ? "from-green-500/25 to-green-500/5 border-green-400/50"
          : "from-red-500/25 to-red-500/5 border-red-400/50"
        : "from-cyan-500/20 to-cyan-500/5 border-cyan-500/30",
      content: raceBox.status !== "connected" ? (
        <span className="text-lg text-neutral-600 font-mono">GPS --</span>
      ) : gps.deltaMs !== null ? (
        <div className="flex flex-col items-center">
          <span className={`text-3xl sm:text-4xl font-mono font-black leading-none ${
            gps.deltaMs < 0 ? "text-green-400" : "text-red-400"
          }`}>
            {gps.deltaMs < 0 ? "" : "+"}{(gps.deltaMs / 1000).toFixed(2)}s
          </span>
          <span className="text-[10px] text-neutral-500 font-mono mt-1">
            {msToLapTime(Math.round(gps.currentLapElapsedMs))}
          </span>
        </div>
      ) : (
        <div className="flex flex-col items-center">
          <span className="text-2xl font-mono font-bold text-neutral-500">
            {gps.currentLapStartTime > 0 ? msToLapTime(Math.round(gps.currentLapElapsedMs)) : "--:--.---"}
          </span>
          {gps.lastLapMs > 0 && (
            <span className="text-[10px] text-neutral-600 font-mono mt-1">
              Prev: {msToLapTime(Math.round(gps.lastLapMs))}
            </span>
          )}
        </div>
      ),
    },
    gpsSpeed: {
      label: t("driver.gpsSpeed"),
      accent: "from-sky-500/20 to-sky-500/5 border-sky-500/30",
      content: raceBox.status !== "connected" ? (
        <span className="text-lg text-neutral-600 font-mono">GPS --</span>
      ) : (
        <div className="flex flex-col items-center">
          <span className="text-3xl sm:text-4xl font-mono font-black text-white leading-none">
            {Math.round(gps.sample?.speedKmh ?? 0)}
          </span>
          <span className="text-[9px] text-neutral-500 uppercase tracking-widest mt-0.5">km/h</span>
          {gps.maxSpeedKmh > 0 && (
            <span className="text-[10px] text-sky-400/60 font-mono mt-0.5">
              {t("driver.maxSpeed")}: {Math.round(gps.maxSpeedKmh)}
            </span>
          )}
        </div>
      ),
    },
    gpsGForce: {
      label: t("driver.gpsGForce"),
      accent: (() => {
        const lat = Math.abs(gps.sample?.gForceX ?? 0);
        if (lat > 1.2) return "from-red-500/25 to-red-500/5 border-red-400/50";
        if (lat > 0.7) return "from-yellow-500/20 to-yellow-500/5 border-yellow-400/40";
        return "from-emerald-500/20 to-emerald-500/5 border-emerald-500/30";
      })(),
      content: raceBox.status !== "connected" ? (
        <span className="text-lg text-neutral-600 font-mono">GPS --</span>
      ) : (
        <div className="flex flex-col items-center gap-1">
          <span className="text-3xl sm:text-4xl font-mono font-black text-white leading-none">
            {Math.abs(gps.sample?.gForceX ?? 0).toFixed(1)}G
          </span>
          <div className="flex gap-3 text-[10px] font-mono text-neutral-500">
            <span>{t("driver.lateral")}: {(gps.sample?.gForceX ?? 0).toFixed(1)}</span>
            <span>{t("driver.braking")}: {(gps.sample?.gForceY ?? 0).toFixed(1)}</span>
          </div>
        </div>
      ),
    },
  };

  return (
    <div className="min-h-screen bg-black flex flex-col select-none">
      {/* BOX alert overlay */}
      {boxAlert.active && (
        <div
          onClick={boxAlert.dismiss}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center cursor-pointer animate-[boxFlash_0.5s_ease-in-out_infinite]"
        >
          <span className="text-[20vw] font-black text-white leading-none tracking-wider drop-shadow-[0_0_40px_rgba(255,0,0,0.8)]">
            BOX
          </span>
          <span className="text-sm text-white/60 mt-4">{t("driver.tapDismiss")}</span>
        </div>
      )}

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
        <div className="flex items-center gap-2">
          {/* RaceBox BLE button */}
          {raceBox.supported && (
            <button
              onClick={() => {
                if (raceBox.status === "connected") {
                  setShowGpsSetup(!showGpsSetup);
                } else {
                  raceBox.connect();
                }
              }}
              className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                raceBox.status === "connected"
                  ? "bg-cyan-900/40 text-cyan-400 border border-cyan-700/40"
                  : raceBox.status === "connecting"
                    ? "bg-blue-900/30 text-blue-400 animate-pulse"
                    : "text-neutral-500 hover:text-cyan-400 border border-transparent hover:border-cyan-700/30"
              }`}
              title={raceBox.status === "connected" ? t("driver.gpsDisconnect") : t("driver.gpsConnect")}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.348 14.651a3.75 3.75 0 010-5.303m5.304 0a3.75 3.75 0 010 5.303m-7.425 2.122a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546" />
              </svg>
              {raceBox.status === "connected" && gps.sample && (
                <span className="font-mono">{gps.sample.numSatellites}{t("driver.gpsSat")}</span>
              )}
            </button>
          )}
          <button
            onClick={() => setEditMode(!editMode)}
            className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded transition-colors ${
              editMode ? "bg-accent/20 text-accent" : "text-neutral-500 hover:text-neutral-300"
            }`}
          >
            {editMode ? "✓" : "⇄"}
          </button>
        </div>
      </div>

      {/* GPS setup panel (finish line) */}
      {showGpsSetup && raceBox.status === "connected" && (
        <GpsSetupPanel onClose={() => setShowGpsSetup(false)} />
      )}

      {/* Cards grid */}
      <div className="flex-1 p-2 sm:p-3 overflow-auto">
        <div className="grid grid-cols-3 auto-rows-fr gap-2 sm:gap-3 h-full min-h-0">
          {cardOrder
            .filter((id) => {
              // Hide GPS cards when RaceBox is not connected (unless in edit mode)
              if (!editMode && raceBox.status !== "connected" && (id === "gpsLapDelta" || id === "gpsSpeed" || id === "gpsGForce")) return false;
              return true;
            })
            .map((cardId, index) => {
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
                onTouchStart={() => editMode && onTouchStart(index)}
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

/* ------------------------------------------------------------------ */
/*  GPS Setup Panel (finish line configuration)                        */
/* ------------------------------------------------------------------ */

function GpsSetupPanel({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { sample, finishLine, setFinishLine, reset } = useRaceBoxStore();
  const { disconnect } = useRaceBox();
  const [p1, setP1] = useState(finishLine?.p1 ?? null);
  const [p2, setP2] = useState(finishLine?.p2 ?? null);

  const captureP1 = () => {
    if (sample && sample.fixType >= 3) {
      const pt = { lat: sample.lat, lon: sample.lon };
      setP1(pt);
      if (p2) setFinishLine({ p1: pt, p2 });
    }
  };

  const captureP2 = () => {
    if (sample && sample.fixType >= 3) {
      const pt = { lat: sample.lat, lon: sample.lon };
      setP2(pt);
      if (p1) setFinishLine({ p1, p2: pt });
    }
  };

  return (
    <div className="bg-neutral-900/95 border-b border-cyan-800/30 px-3 py-2 space-y-2 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-bold text-cyan-400 uppercase tracking-wider text-[10px]">RaceBox GPS</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { reset(); }}
            className="text-neutral-500 hover:text-yellow-400 text-[10px] px-1.5 py-0.5 rounded border border-neutral-700 hover:border-yellow-700/40"
          >
            Reset
          </button>
          <button
            onClick={() => { disconnect(); onClose(); }}
            className="text-neutral-500 hover:text-red-400 text-[10px] px-1.5 py-0.5 rounded border border-neutral-700 hover:border-red-700/40"
          >
            {t("driver.gpsDisconnect")}
          </button>
          <button onClick={onClose} className="text-neutral-500 hover:text-white p-0.5">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Finish line setup */}
      <div className="flex items-center gap-2">
        <button
          onClick={captureP1}
          className={`flex-1 text-center py-1 rounded border transition-colors ${
            p1 ? "border-green-700/40 text-green-400 bg-green-900/20" : "border-neutral-700 text-neutral-400 hover:border-cyan-700/40 hover:text-cyan-400"
          }`}
        >
          {p1 ? `P1: ${p1.lat.toFixed(5)}, ${p1.lon.toFixed(5)}` : t("driver.setFinishP1")}
        </button>
        <button
          onClick={captureP2}
          className={`flex-1 text-center py-1 rounded border transition-colors ${
            p2 ? "border-green-700/40 text-green-400 bg-green-900/20" : "border-neutral-700 text-neutral-400 hover:border-cyan-700/40 hover:text-cyan-400"
          }`}
        >
          {p2 ? `P2: ${p2.lat.toFixed(5)}, ${p2.lon.toFixed(5)}` : t("driver.setFinishP2")}
        </button>
      </div>

      {finishLine ? (
        <div className="text-green-400/70 text-center text-[10px]">{t("driver.finishSet")}</div>
      ) : (
        <div className="text-neutral-600 text-center text-[10px]">{t("driver.noFinishLine")}</div>
      )}

      {/* Status line */}
      {sample && (
        <div className="flex justify-between text-[10px] text-neutral-500 font-mono">
          <span>Fix: {sample.fixType === 3 ? "3D" : sample.fixType === 2 ? "2D" : "None"}</span>
          <span>{sample.numSatellites} sat</span>
          <span>{sample.lat.toFixed(6)}, {sample.lon.toFixed(6)}</span>
          <span>{sample.batteryPercent}%</span>
        </div>
      )}
    </div>
  );
}
