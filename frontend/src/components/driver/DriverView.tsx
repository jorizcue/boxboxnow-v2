"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRaceStore } from "@/hooks/useRaceState";
import { useSimNow } from "@/hooks/useSimNow";
import { useRaceClock } from "@/hooks/useRaceClock";
import { msToLapTime, tierHex, secondsToHMS } from "@/lib/formatters";
import { stableSpeedMs } from "@/lib/classificationUtils";
import { getDriverChannel } from "@/lib/driverChannel";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useRaceBox, useRaceBoxStore } from "@/hooks/useRaceBox";
import { usePhoneGps } from "@/hooks/usePhoneGps";
import { useDriverConfig, ALL_DRIVER_CARDS, DEFAULT_CARD_ORDER, type DriverCardId } from "@/hooks/useDriverConfig";
import { useAuth } from "@/hooks/useAuth";
import { GForceRadar } from "@/components/driver/GForceRadar";
// Config panel moved to separate sidebar tab (driver-config)
import { useGpsTelemetrySave } from "@/hooks/useGpsTelemetrySave";
import { useDriverSpeech } from "@/hooks/useDriverSpeech";

/* ------------------------------------------------------------------ */
/*  Touch drag-and-drop hook                                           */
/* ------------------------------------------------------------------ */

function useTouchDrag(
  cardOrder: DriverCardId[],
  setCardOrder: (order: DriverCardId[]) => void
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
  const { karts, config, fifo, connected, countdownMs, durationMs, raceFinished } = useRaceStore();
  const { now, speed } = useSimNow();
  const raceClock = useRaceClock();
  const driverCfg = useDriverConfig();
  const { user } = useAuth();

  // Hydrate driver config for current user
  useEffect(() => {
    driverCfg.hydrateForUser(user?.id ?? null);
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for config changes from dashboard via BroadcastChannel
  useEffect(() => {
    const ch = getDriverChannel();
    if (!ch) return;
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "configSync" && event.data.config) {
        const { visibleCards, cardOrder } = event.data.config;
        // Apply directly to store (bypass setters to avoid re-broadcast + re-save)
        const allCards = ALL_DRIVER_CARDS.map((c) => c.id);
        const defaultVis = Object.fromEntries(allCards.map((c) => [c, true]));
        useDriverConfig.setState({
          visibleCards: { ...defaultVis, ...visibleCards },
          cardOrder: cardOrder?.length
            ? cardOrder.filter((c: string) => allCards.includes(c as any))
                .concat(allCards.filter((c) => !cardOrder.includes(c)))
            : allCards,
        });
      }
    };
    ch.addEventListener("message", handler);
    return () => ch.removeEventListener("message", handler);
  }, []);

  const [editMode, setEditMode] = useState(false);
  const [showGpsSetup, setShowGpsSetup] = useState(false);
  const [hideCalBanner, setHideCalBanner] = useState(false);
  const [calibrationSkipped, setCalibrationSkipped] = useState(false);
  const [brightness, setBrightness] = useState(100);
  const [showBrightness, setShowBrightness] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [presets, setPresets] = useState<{ id: number; name: string; visible_cards: Record<string, boolean>; card_order: string[] }[]>([]);

  // Load presets when menu opens
  useEffect(() => {
    if (menuOpen && presets.length === 0) {
      api.getPresets().then(setPresets).catch(() => {});
    }
  }, [menuOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const { dragging, registerRect, onTouchStart, onTouchMove, onTouchEnd } =
    useTouchDrag(driverCfg.cardOrder, driverCfg.setCardOrder);
  const boxAlert = useBoxAlert();

  // GPS sources (RaceBox BLE or phone GPS)
  const raceBox = useRaceBox();
  const phoneGps = usePhoneGps();
  const gps = useRaceBoxStore();
  useGpsTelemetrySave();
  const gpsConnected = raceBox.status === "connected" || phoneGps.status === "connected";
  const gpsSource = raceBox.status === "connected" ? "racebox" : phoneGps.status === "connected" ? "phone" : null;

  // Auto-hide calibration "aligned" banner after 3s
  useEffect(() => {
    if (gps.calibrationPhase === "aligned") {
      setHideCalBanner(false);
      const t = setTimeout(() => setHideCalBanner(true), 3000);
      return () => clearTimeout(t);
    }
    setHideCalBanner(false);
  }, [gps.calibrationPhase]);

  // Sync finish line from circuit config to RaceBox store
  useEffect(() => {
    if (config.finishLat1 && config.finishLon1 && config.finishLat2 && config.finishLon2) {
      gps.setFinishLine({
        p1: { lat: config.finishLat1, lon: config.finishLon1 },
        p2: { lat: config.finishLat2, lon: config.finishLon2 },
      });
    }
  }, [config.finishLat1, config.finishLon1, config.finishLat2, config.finishLon2]);

  const circuitLengthM = config.circuitLengthM || 1100;
  const pitTimeS = config.pitTimeS || 0;
  // Kart number: user override from driver config, fallback to race session config
  const ourKart = driverCfg.selectedKartNumber ?? config.ourKartNumber;

  // Previous lap tracking for lastLap card + speech
  const { prevLapMs, lastLapMs: lastLapVal, lapDelta } = usePrevLap(ourKart);

  /* ---------- Compute adjusted classification (countdown-based, same as Beta) ---------- */
  const { ourData } = useMemo(() => {
    if (karts.length === 0 || ourKart <= 0)
      return { ourData: null };

    const expectedPits = config.minPits || 0;

    const mapped = karts
      .filter((k) => k.totalLaps > 0)
      .map((kart) => {
        const speedMs = stableSpeedMs(kart, circuitLengthM);
        const baseDistM = kart.totalLaps * circuitLengthM;

        let metersExtra = 0;
        if (kart.pitStatus === "racing" && speedMs > 0) {
          // Countdown-based: both values from Apex, no clock sync issues
          if (kart.stintStartCountdownMs > 0 && countdownMs !== 0) {
            const stintTimeMs = kart.stintStartCountdownMs - countdownMs;
            const sinceCrossMs = stintTimeMs - kart.stintElapsedMs;
            if (sinceCrossMs > 0) {
              metersExtra = (sinceCrossMs / 1000) * speedMs;
            }
          } else if (kart.stintStartTime > 0) {
            // Fallback to wall clock when countdown unavailable
            const wallS = Math.max(0, (now - kart.stintStartTime) * speed);
            const sinceCross = wallS - kart.stintElapsedMs / 1000;
            if (sinceCross > 0) {
              metersExtra = sinceCross * speedMs;
            }
          }
          metersExtra = Math.min(metersExtra, circuitLengthM * 0.95);
        }

        const totalDist = baseDistM + metersExtra;
        const missing = Math.max(0, expectedPits - kart.pitCount);
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
  }, [karts, now, countdownMs, ourKart, circuitLengthM, pitTimeS, config.minPits]);

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
      bestAvgMs: kart.bestAvgMs,
      bestStintLapMs: kart.bestStintLapMs ?? 0,
    };
  }, [karts, ourKart]);

  /* ---------- Average future stint ---------- */
  const avgFutureStintData = useMemo(() => {
    if (!ourKart || ourKart <= 0 || raceClock === 0 || raceFinished) return null;
    const kart = karts.find((k) => k.kartNumber === ourKart);
    if (!kart) return null;
    const remainingPits = Math.max(0, config.minPits - kart.pitCount);
    if (remainingPits <= 0) return null;
    const totalRaceMin = config.durationMin;
    const elapsedMs = durationMs > 0 ? Math.max(0, durationMs - raceClock) : 0;
    const elapsedMin = elapsedMs / 1000 / 60;
    const futureTimeInPitMin = remainingPits * config.pitTimeS / 60;
    const availableRaceMin = totalRaceMin - elapsedMin - futureTimeInPitMin;
    if (availableRaceMin <= 0) return null;
    const avgMin = availableRaceMin / remainingPits;
    const tooEarly = avgMin > config.maxStintMin;
    const tooLate = avgMin <= config.minStintMin + 5;
    return { avgMin, warn: tooEarly || tooLate };
  }, [karts, ourKart, raceClock, durationMs, raceFinished, config.durationMin, config.minPits, config.pitTimeS, config.minStintMin, config.maxStintMin]);

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
    const newOrder = [...driverCfg.cardOrder];
    const [d] = newOrder.splice(dragItem.current, 1);
    newOrder.splice(dragOverItem.current, 0, d);
    driverCfg.setCardOrder(newOrder);
    dragItem.current = null;
    dragOverItem.current = null;
  }, [driverCfg.cardOrder]);

  // Real max stint calculation & laps to max stint
  const { lapsToMaxStint, realMaxStintMin } = useMemo(() => {
    if (!ourKart || ourKart <= 0 || raceClock === 0 || raceFinished)
      return { lapsToMaxStint: null, realMaxStintMin: null };
    const kart = karts.find((k) => k.kartNumber === ourKart);
    if (!kart || kart.avgLapMs <= 0)
      return { lapsToMaxStint: null, realMaxStintMin: null };

    // Current stint elapsed time (seconds)
    const stintStart = kart.stintStartCountdownMs || durationMs || raceClock;
    const stintSec = Math.max(0, stintStart - raceClock) / 1000;

    // Time remaining from last pit-out (or race start) until end of race
    const timeRemainingFromStintStartMin = stintStart / 1000 / 60;

    // Pending pits
    const pendingPits = Math.max(0, config.minPits - kart.pitCount);

    // Real max stint = min(maxStintMin, timeRemaining - reserve for pending pits)
    const reserveMin = pendingPits > 0 ? ((config.pitTimeS / 60) + config.minStintMin) * pendingPits : 0;
    const availableMin = timeRemainingFromStintStartMin - reserveMin;
    const realMax = Math.min(config.maxStintMin, Math.max(0, availableMin));

    const timeToMaxSec = Math.max(0, realMax * 60 - stintSec);
    const laps = timeToMaxSec / (kart.avgLapMs / 1000);

    return { lapsToMaxStint: laps, realMaxStintMin: realMax };
  }, [karts, ourKart, raceClock, durationMs, raceFinished, config.maxStintMin, config.minPits, config.pitTimeS, config.minStintMin]);

  // Pit window open/closed (uses real min stint)
  const pitWindowOpen = useMemo(() => {
    if (!ourKart || ourKart <= 0 || raceClock === 0 || raceFinished) return null;
    const kart = karts.find((k) => k.kartNumber === ourKart);
    if (!kart) return null;

    // Time elapsed in current stint (seconds)
    const stintStart = kart.stintStartCountdownMs || durationMs || raceClock;
    const stintSec = Math.max(0, stintStart - raceClock) / 1000;
    const stintMin = stintSec / 60;

    // Real min stint: max(minStintConfig, timeFromStintStartToEnd - (pitTime + maxStint) × pendingPits)
    const pendingPits = Math.max(0, config.minPits - kart.pitCount);
    const timeFromStintStartToEndMin = stintStart / 1000 / 60;
    const reservePerPitMin = pendingPits > 0 ? (config.pitTimeS / 60 + config.maxStintMin) * pendingPits : 0;
    const realMinStintMin = Math.max(config.minStintMin, timeFromStintStartToEndMin - reservePerPitMin);

    // Pit closed if stint < realMinStintMin
    if (stintMin < realMinStintMin) return false;

    // Pit open
    return true;
  }, [karts, ourKart, raceClock, durationMs, raceFinished, config.minStintMin, config.minPits, config.pitTimeS, config.maxStintMin]);

  // Audio speech narration
  const [speechEnabled, setSpeechEnabled] = useState(false);
  const speech = useDriverSpeech(
    {
      lastLapMs: lastLapVal,
      prevLapMs,
      lapDelta,
      realPosition: ourData?.realPosition ?? null,
      totalKarts: ourData?.totalKarts ?? null,
      boxScore: fifo?.score ?? 0,
      lapsToMaxStint,
    },
    speechEnabled
  );

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

  // Format race clock
  const raceClockH = Math.floor(raceClock / 3600000);
  const raceClockM = Math.floor((raceClock % 3600000) / 60000);
  const raceClockS = Math.floor((raceClock % 60000) / 1000);
  const raceClockStr = raceClock > 0
    ? `${raceClockH}:${String(raceClockM).padStart(2, "0")}:${String(raceClockS).padStart(2, "0")}`
    : "--:--:--";

  // Current lap time (from GPS if available)
  const currentLapTimeMs = gpsConnected && gps.currentLapStartTime > 0
    ? gps.currentLapElapsedMs
    : 0;

  // Avg lap 20 from kart data
  const avgLap20Ms = paceDisplay?.avgLapMs ?? 0;

  // --- BOX: pit count + current pit elapsed (mirrors FifoQueue cards) ---
  const ourKartObj = karts.find((k) => k.kartNumber === ourKart) || null;
  const pitsDone = ourKartObj?.pitCount ?? 0;
  const pitsMissing = Math.max(0, config.minPits - pitsDone);
  const pitInProgress = ourKartObj?.pitStatus === "in_pit";
  // Elapsed seconds in pit: pitInCountdownMs is the race clock at the moment the kart entered
  // the pit lane. Elapsed = (pitInCountdownMs − raceClock) / 1000, counting up from 0.
  const pitElapsedSec = (() => {
    if (!ourKartObj || !pitInProgress || raceClock === 0) return 0;
    const pitInCd = ourKartObj.pitInCountdownMs;
    if (!pitInCd || pitInCd <= 0) return 0;
    return Math.max(0, (pitInCd - raceClock) / 1000);
  })();
  const pitElapsedStr = (() => {
    const s = Math.round(pitElapsedSec);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, "0")}`;
  })();

  const cards: Record<DriverCardId, { label: string; content: React.ReactNode; accent: string }> = {
    raceTimer: {
      label: "Tiempo de carrera",
      accent: raceClock > 0 && raceClock < 600000
        ? "from-red-500/25 to-red-500/5 border-red-400/50"
        : "from-neutral-500/20 to-neutral-500/5 border-neutral-500/30",
      content: (
        <span className={`text-3xl sm:text-4xl font-mono font-black leading-none ${
          raceClock > 0 && raceClock < 600000 ? "text-red-400 animate-pulse" : "text-white"
        }`}>
          {raceClockStr}
        </span>
      ),
    },
    currentLapTime: {
      label: "Vuelta actual",
      accent: "from-blue-500/20 to-blue-500/5 border-blue-500/30",
      content: (
        <span className="text-3xl sm:text-4xl font-mono font-black text-white leading-none">
          {currentLapTimeMs > 0 ? msToLapTime(Math.round(currentLapTimeMs)) : "--:--.---"}
        </span>
      ),
    },
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
          <span className="text-[10px] text-neutral-500 mt-0.5 truncate max-w-full">
            {ourData.aheadKart.teamName || ourData.aheadKart.driverName || `K${ourData.aheadKart.kartNumber}`}
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
          <span className="text-[10px] text-neutral-500 mt-0.5 truncate max-w-full">
            {ourData.behindKart.teamName || ourData.behindKart.driverName || `K${ourData.behindKart.kartNumber}`}
          </span>
        </div>
      ) : (
        <span className="text-2xl sm:text-3xl font-black text-neutral-500 leading-none">{t("driver.last")}</span>
      ),
    },
    avgLap20: {
      label: "Media (20v)",
      accent: "from-indigo-500/20 to-indigo-500/5 border-indigo-500/30",
      content: (
        <span className="text-3xl sm:text-4xl font-mono font-black text-white leading-none">
          {avgLap20Ms > 0 ? msToLapTime(Math.round(avgLap20Ms)) : "--:--.---"}
        </span>
      ),
    },
    best3: {
      label: "Mejor 3 (3V)",
      accent: "from-amber-500/20 to-amber-500/5 border-amber-500/30",
      content: (
        <span className="text-3xl sm:text-4xl font-mono font-black text-white leading-none">
          {(paceDisplay?.bestAvgMs ?? 0) > 0 ? msToLapTime(Math.round(paceDisplay!.bestAvgMs)) : "--:--.---"}
        </span>
      ),
    },
    avgFutureStint: {
      label: "Media stint futuro",
      accent: avgFutureStintData?.warn
        ? "from-red-500/25 to-red-500/5 border-red-400/50"
        : "from-teal-500/20 to-teal-500/5 border-teal-500/30",
      content: (
        <span className={`text-3xl sm:text-4xl font-mono font-black leading-none ${
          avgFutureStintData?.warn ? "text-red-400" : "text-white"
        }`}>
          {avgFutureStintData ? secondsToHMS(Math.round(avgFutureStintData.avgMin * 60)) : "--:--"}
        </span>
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
    bestStintLap: {
      label: t("driver.bestStintLap"),
      accent: (paceDisplay?.bestStintLapMs ?? 0) > 0
        ? "from-purple-500/20 to-purple-500/5 border-purple-500/30"
        : "from-neutral-500/20 to-neutral-500/5 border-neutral-500/30",
      content: (
        <span className="text-3xl sm:text-4xl font-mono font-black text-white leading-none">
          {(paceDisplay?.bestStintLapMs ?? 0) > 0 ? msToLapTime(paceDisplay!.bestStintLapMs) : "--:--.---"}
        </span>
      ),
    },
    deltaBestLap: {
      label: gps.bestLapMs > 0
        ? `Delta Best · ${msToLapTime(Math.round(gps.bestLapMs))}`
        : "Delta Best Lap",
      accent: gps.deltaBestMs !== null
        ? gps.deltaBestMs < 0
          ? "from-green-500/25 to-green-500/5 border-green-400/50"
          : "from-red-500/25 to-red-500/5 border-red-400/50"
        : "from-violet-500/20 to-violet-500/5 border-violet-500/30",
      content: !gpsConnected ? (
        <span className="text-lg text-neutral-600 font-mono">GPS --</span>
      ) : gps.deltaBestMs !== null ? (
        <div className="flex flex-col items-center">
          <span className={`text-3xl sm:text-4xl font-mono font-black leading-none ${
            gps.deltaBestMs < 0 ? "text-green-400" : "text-red-400"
          }`}>
            {gps.deltaBestMs < 0 ? "" : "+"}{(gps.deltaBestMs / 1000).toFixed(2)}s
          </span>
          <span className="text-[10px] text-neutral-500 font-mono mt-1">
            {msToLapTime(Math.round(gps.currentLapElapsedMs))}
          </span>
        </div>
      ) : (
        <span className="text-lg text-neutral-600 font-mono">
          {gps.bestLapMs > 0 ? "Esperando vuelta..." : "Sin best lap"}
        </span>
      ),
    },
    gForceRadar: {
      label: "G-Force",
      accent: "from-neutral-500/10 to-neutral-500/5 border-neutral-600/30",
      content: !gpsConnected ? (
        <span className="text-lg text-neutral-600 font-mono">GPS --</span>
      ) : (
        <div className="w-full h-full min-h-[80px]">
          <GForceRadar gX={gps.sample?.gForceX ?? 0} gY={gps.sample?.gForceY ?? 0} />
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
      content: !gpsConnected ? (
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
      content: !gpsConnected ? (
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
      content: !gpsConnected ? (
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
    lapsToMaxStint: {
      label: t("metric.lapsToMaxStint"),
      accent: pitWindowOpen === false
        ? "from-red-500/30 to-red-500/10 border-red-500/60"
        : lapsToMaxStint !== null && lapsToMaxStint <= 2
          ? "from-red-500/25 to-red-500/5 border-red-400/50"
          : lapsToMaxStint !== null && lapsToMaxStint <= 5
            ? "from-orange-500/20 to-orange-500/5 border-orange-400/40"
            : pitWindowOpen === true
              ? "from-green-500/20 to-green-500/5 border-green-500/40"
              : "from-teal-500/20 to-teal-500/5 border-teal-500/30",
      content: (
        <div className="flex flex-col items-center">
          <span className={`text-4xl sm:text-5xl font-mono font-black leading-none ${
            pitWindowOpen === false
              ? "text-red-400"
              : lapsToMaxStint !== null && lapsToMaxStint <= 2
                ? "text-red-400 animate-pulse"
                : lapsToMaxStint !== null && lapsToMaxStint <= 5
                  ? "text-orange-400"
                  : pitWindowOpen === true
                    ? "text-green-400"
                    : "text-white"
          }`}>
            {lapsToMaxStint !== null && lapsToMaxStint > 0 ? lapsToMaxStint.toFixed(1) : "0"}
          </span>
          {realMaxStintMin !== null && realMaxStintMin < config.maxStintMin && (
            <span className="text-[8px] sm:text-[9px] text-orange-400 font-mono mt-0.5">
              max {Math.floor(realMaxStintMin)}:{String(Math.round((realMaxStintMin % 1) * 60)).padStart(2, "0")}
            </span>
          )}
          <span className="text-[9px] sm:text-[10px] text-neutral-500 uppercase tracking-widest mt-0.5">
            {t("metric.lapsToMaxStint").toLowerCase()}
          </span>
        </div>
      ),
    },
    pitWindow: {
      label: t("driver.pitWindow"),
      accent: pitWindowOpen === true
        ? "from-green-500/25 to-green-500/5 border-green-400/50"
        : pitWindowOpen === false
          ? "from-red-500/25 to-red-500/5 border-red-400/50"
          : "from-neutral-500/20 to-neutral-500/5 border-neutral-500/30",
      content: (
        <div className="flex flex-col items-center">
          <span className={`text-3xl sm:text-4xl font-black leading-none uppercase tracking-wider ${
            pitWindowOpen === true
              ? "text-green-400"
              : pitWindowOpen === false
                ? "text-red-400 animate-pulse"
                : "text-neutral-500"
          }`}>
            {pitWindowOpen === true ? "OPEN" : pitWindowOpen === false ? "CLOSED" : "--"}
          </span>
          {pitWindowOpen === false && (() => {
            const kart = karts.find((k) => k.kartNumber === ourKart);
            if (!kart) return null;
            const stintStart = kart.stintStartCountdownMs || durationMs || raceClock;
            const stintSec = Math.max(0, stintStart - raceClock) / 1000;
            const remainSec = Math.max(0, config.minStintMin * 60 - stintSec);
            const m = Math.floor(remainSec / 60);
            const s = Math.floor(remainSec % 60);
            return (
              <span className="text-[10px] sm:text-xs text-red-400/70 font-mono mt-1">
                {m}:{String(s).padStart(2, "0")}
              </span>
            );
          })()}
        </div>
      ),
    },
    pitCount: {
      label: "PITS",
      accent: pitsMissing > 0
        ? "from-orange-500/25 to-orange-500/5 border-orange-400/50"
        : "from-green-500/20 to-green-500/5 border-green-500/30",
      content: (
        <div className="flex flex-col items-center">
          <span className={`text-4xl sm:text-5xl font-mono font-black leading-none ${
            pitsMissing > 0 ? "text-orange-400" : "text-green-400"
          }`}>
            {pitsDone}<span className="text-neutral-500">/</span>{config.minPits}
          </span>
          {pitsMissing > 0 && (
            <span className="text-[10px] text-orange-400/70 font-mono mt-1 uppercase tracking-widest">
              faltan {pitsMissing}
            </span>
          )}
        </div>
      ),
    },
    currentPit: {
      label: "Pit en curso",
      accent: pitInProgress
        ? "from-cyan-500/25 to-cyan-500/5 border-cyan-400/50"
        : "from-neutral-500/15 to-neutral-500/5 border-neutral-500/30",
      content: (
        <div className="flex flex-col items-center">
          <span className={`text-3xl sm:text-4xl font-mono font-black leading-none ${
            pitInProgress ? "text-cyan-400 animate-pulse" : "text-neutral-500"
          }`}>
            {pitInProgress ? pitElapsedStr : "--:--"}
          </span>
          <span className="text-[9px] sm:text-[10px] text-neutral-500 uppercase tracking-widest mt-1">
            {pitInProgress ? `/ ${Math.floor(config.pitTimeS / 60)}:${String(config.pitTimeS % 60).padStart(2, "0")}` : "inactivo"}
          </span>
        </div>
      ),
    },
  };

  // Count visible cards to calculate grid rows
  const visibleCardIds = driverCfg.cardOrder.filter((id) => {
    if (!driverCfg.visibleCards[id]) return false;
    const gpsCards: DriverCardId[] = ["gpsLapDelta", "gpsSpeed", "gpsGForce", "deltaBestLap", "gForceRadar"];
    if (!editMode && !gpsConnected && gpsCards.includes(id)) return false;
    return true;
  });
  const numRows = Math.ceil(visibleCardIds.length / 3);

  return (
    <div
      className="h-[100dvh] bg-black flex flex-col select-none"
      style={{
        ...(brightness !== 100 ? { filter: `brightness(${brightness / 100}) contrast(${1 + (brightness - 100) / 200})` } : {}),
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
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

      {/* Hamburger menu drawer (overlay) */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 flex" onClick={() => setMenuOpen(false)}>
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60" />
          {/* Drawer panel */}
          <div
            className="relative z-10 w-64 max-w-[75vw] bg-surface border-r border-border h-full flex flex-col overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
            style={{ paddingLeft: "env(safe-area-inset-left)" }}
          >
            {/* Drawer header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
              <span className="text-sm font-bold text-white tracking-wider">
                BB<span className="text-accent">N</span>
              </span>
              <button onClick={() => setMenuOpen(false)} className="text-neutral-400 hover:text-white p-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Menu items */}
            <div className="flex-1 px-3 py-3 space-y-2">
              {/* GPS */}
              <div className="space-y-1">
                <p className="text-[10px] text-neutral-500 uppercase tracking-wider px-1 mb-1">GPS</p>
                {gpsConnected ? (
                  <button
                    onClick={() => { setShowGpsSetup(!showGpsSetup); setMenuOpen(false); }}
                    className="w-full flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-cyan-900/30 text-cyan-400 border border-cyan-700/30"
                  >
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      {gpsSource === "racebox" ? (
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.348 14.651a3.75 3.75 0 010-5.303m5.304 0a3.75 3.75 0 010 5.303m-7.425 2.122a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546" />
                      ) : (
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                      )}
                    </svg>
                    {gpsSource === "racebox" ? "RaceBox" : "Phone GPS"}
                    {gpsSource === "racebox" && gps.sample && (
                      <span className="ml-auto font-mono text-[10px]">{gps.sample.numSatellites} sat</span>
                    )}
                  </button>
                ) : (raceBox.status === "connecting" || phoneGps.status === "connecting") ? (
                  <div className="text-xs px-3 py-2 rounded-lg bg-blue-900/20 text-blue-400 animate-pulse">
                    Conectando GPS...
                  </div>
                ) : (
                  <div className="space-y-1">
                    {raceBox.supported && (
                      <button
                        onClick={() => { raceBox.connect(); setMenuOpen(false); }}
                        className="w-full flex items-center gap-2 text-xs px-3 py-2 rounded-lg text-neutral-400 hover:text-cyan-400 hover:bg-cyan-900/20 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9.348 14.651a3.75 3.75 0 010-5.303m5.304 0a3.75 3.75 0 010 5.303m-7.425 2.122a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546" />
                        </svg>
                        Conectar RaceBox BLE
                      </button>
                    )}
                    {phoneGps.supported && (
                      <button
                        onClick={() => { phoneGps.connect(); setMenuOpen(false); }}
                        className="w-full flex items-center gap-2 text-xs px-3 py-2 rounded-lg text-neutral-400 hover:text-cyan-400 hover:bg-cyan-900/20 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                        </svg>
                        Usar GPS del telefono
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Audio */}
              {speech.supported && (
                <div className="space-y-1">
                  <p className="text-[10px] text-neutral-500 uppercase tracking-wider px-1 mb-1">Audio</p>
                  <button
                    onClick={() => {
                      const next = !speechEnabled;
                      setSpeechEnabled(next);
                      if (next && !speech.unlocked) speech.unlock();
                    }}
                    className={`w-full flex items-center gap-2 text-xs px-3 py-2 rounded-lg transition-colors ${
                      speechEnabled ? "bg-green-900/30 text-green-400 border border-green-700/30" : "text-neutral-400 hover:text-green-400 hover:bg-green-900/20"
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      {speechEnabled ? (
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                      ) : (
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                      )}
                    </svg>
                    {speechEnabled ? "Audio activado" : "Audio desactivado"}
                  </button>
                </div>
              )}

              {/* Brightness */}
              <div className="space-y-1">
                <p className="text-[10px] text-neutral-500 uppercase tracking-wider px-1 mb-1">Brillo</p>
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-black/50">
                  <svg className="w-4 h-4 text-yellow-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                  </svg>
                  <input
                    type="range"
                    min={100}
                    max={250}
                    step={10}
                    value={brightness}
                    onChange={(e) => setBrightness(Number(e.target.value))}
                    className="flex-1 h-1.5 accent-yellow-400"
                  />
                  <span className="text-[10px] text-neutral-400 font-mono w-10 text-right">{brightness}%</span>
                </div>
                {brightness !== 100 && (
                  <button
                    onClick={() => setBrightness(100)}
                    className="w-full text-[10px] text-neutral-500 hover:text-white px-3 py-1 text-left"
                  >
                    Resetear brillo
                  </button>
                )}
              </div>

              {/* Presets */}
              {presets.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] text-neutral-500 uppercase tracking-wider px-1 mb-1">Plantilla</p>
                  <select
                    value=""
                    onChange={(e) => {
                      const preset = presets.find((p) => p.id === Number(e.target.value));
                      if (!preset) return;
                      const allIds = ALL_DRIVER_CARDS.map((c) => c.id);
                      const defaultVis = Object.fromEntries(allIds.map((c) => [c, true]));
                      const visibleCards = { ...defaultVis, ...preset.visible_cards } as Record<DriverCardId, boolean>;
                      const cardOrder = preset.card_order.length
                        ? (preset.card_order.filter((c) => allIds.includes(c as DriverCardId)) as DriverCardId[])
                            .concat(allIds.filter((c) => !preset.card_order.includes(c)))
                        : DEFAULT_CARD_ORDER;
                      driverCfg.applyPreset(visibleCards, cardOrder);
                      setMenuOpen(false);
                    }}
                    className="w-full bg-black border border-border rounded-lg px-2 py-2 text-xs text-white"
                  >
                    <option value="">Aplicar plantilla...</option>
                    {presets.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Edit cards */}
              <div className="space-y-1">
                <p className="text-[10px] text-neutral-500 uppercase tracking-wider px-1 mb-1">Tarjetas</p>
                <button
                  onClick={() => { setEditMode(!editMode); setMenuOpen(false); }}
                  className={`w-full flex items-center gap-2 text-xs px-3 py-2 rounded-lg transition-colors ${
                    editMode ? "bg-accent/20 text-accent border border-accent/30" : "text-neutral-400 hover:text-accent hover:bg-accent/10"
                  }`}
                >
                  <span className="text-base">{editMode ? "✓" : "⇄"}</span>
                  {editMode ? "Terminar edicion" : "Reordenar tarjetas"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Compact header */}
      <div className="flex items-center justify-between px-3 py-1 border-b border-border/20 shrink-0">
        {/* Hamburger button */}
        <button
          onClick={() => setMenuOpen(true)}
          className="flex items-center gap-1.5 text-neutral-400 hover:text-white transition-colors p-0.5"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
          <div className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-accent" : "bg-red-500 animate-pulse"}`} />
        </button>
        {/* Title */}
        <span className="text-xs font-bold text-white tracking-wide">
          K{ourKart}
        </span>
        {/* Quick status icons (compact, no text) */}
        <div className="flex items-center gap-1.5">
          {gpsConnected && (
            <span className="text-cyan-400">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.348 14.651a3.75 3.75 0 010-5.303m5.304 0a3.75 3.75 0 010 5.303" />
              </svg>
            </span>
          )}
          {speechEnabled && (
            <span className="text-green-400">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
              </svg>
            </span>
          )}
          {brightness > 100 && (
            <span className="text-yellow-400">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
              </svg>
            </span>
          )}
          {editMode && (
            <button
              onClick={() => setEditMode(false)}
              className="text-[10px] bg-accent/20 text-accent px-1.5 py-0.5 rounded"
            >
              ✓
            </button>
          )}
        </div>
      </div>

      {/* GPS setup panel (finish line) */}
      {showGpsSetup && gpsConnected && (
        <GpsSetupPanel onClose={() => setShowGpsSetup(false)} gpsSource={gpsSource} onDisconnect={() => {
          if (gpsSource === "racebox") raceBox.disconnect();
          else phoneGps.disconnect();
        }} />
      )}

      {/* IMU Calibration banner */}
      {gpsConnected && gps.calibrationPhase === "idle" && !calibrationSkipped && (
        <div className="bg-yellow-900/40 border-b border-yellow-700/30 px-3 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-yellow-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z M12 15.75h.007v.008H12v-.008z" />
            </svg>
            <span className="text-[11px] text-yellow-300">G-force sin calibrar — mantén el kart quieto y pulsa calibrar</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setCalibrationSkipped(true)}
              className="text-[10px] font-bold px-3 py-1 rounded bg-neutral-700 text-neutral-300 hover:bg-neutral-600 transition-colors"
            >
              Saltar
            </button>
            <button
              onClick={() => gps.startCalibration()}
              className="text-[10px] font-bold px-3 py-1 rounded bg-yellow-500 text-black hover:bg-yellow-400 transition-colors"
            >
              Calibrar
            </button>
          </div>
        </div>
      )}
      {gpsConnected && gps.calibrationPhase === "sampling" && (
        <div className="bg-blue-900/40 border-b border-blue-700/30 px-3 py-2 flex items-center gap-3">
          <div className="flex-1">
            <span className="text-[11px] text-blue-300 font-medium">Calibrando... no muevas el kart</span>
            <div className="mt-1 h-1.5 bg-blue-950 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-400 rounded-full transition-all duration-200"
                style={{ width: `${Math.round(gps.calibrationProgress * 100)}%` }}
              />
            </div>
          </div>
          <span className="text-[10px] text-blue-400 font-mono">{Math.round(gps.calibrationProgress * 100)}%</span>
        </div>
      )}
      {gpsConnected && gps.calibrationPhase === "ready" && (
        <div className="bg-cyan-900/30 border-b border-cyan-700/30 px-3 py-1.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-3.5 h-3.5 text-cyan-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            <span className="text-[10px] text-cyan-300">Gravedad calibrada — empieza a rodar para alinear ejes ({">"}15 km/h)</span>
          </div>
          <button
            onClick={() => gps.skipAlignment()}
            className="text-[10px] px-2 py-0.5 rounded border border-cyan-700/40 text-cyan-400 hover:bg-cyan-900/40 transition-colors shrink-0"
          >
            Saltar
          </button>
        </div>
      )}
      {gpsConnected && gps.calibrationPhase === "aligned" && !hideCalBanner && (
        <div className="bg-green-900/30 border-b border-green-700/30 px-3 py-1.5 flex items-center gap-2 animate-in fade-in duration-500">
          <svg className="w-3.5 h-3.5 text-green-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
          <span className="text-[10px] text-green-300">IMU calibrado — G-force alineada con el vehículo</span>
        </div>
      )}

      {/* Cards grid — fills remaining height, scroll only when needed */}
      <div className="flex-1 p-1.5 sm:p-2 overflow-y-auto min-h-0">
        <div
          className="grid grid-cols-3 gap-1.5 sm:gap-2 min-h-full"
          style={{ gridTemplateRows: `repeat(${numRows}, minmax(0, 1fr))` }}
        >
          {visibleCardIds.map((cardId, index) => {
            const card = cards[cardId];
            if (!card) return null;
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

function GpsSetupPanel({ onClose, gpsSource, onDisconnect }: { onClose: () => void; gpsSource: "racebox" | "phone" | null; onDisconnect: () => void }) {
  const t = useT();
  const { sample, finishLine, setFinishLine, reset } = useRaceBoxStore();
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
        <span className="font-bold text-cyan-400 uppercase tracking-wider text-[10px]">{gpsSource === "racebox" ? "RaceBox GPS" : "Phone GPS"}</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { reset(); }}
            className="text-neutral-500 hover:text-yellow-400 text-[10px] px-1.5 py-0.5 rounded border border-neutral-700 hover:border-yellow-700/40"
          >
            Reset
          </button>
          <button
            onClick={() => { onDisconnect(); onClose(); }}
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
