"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { create } from "zustand";
import { UbxParser, type RaceBoxSample } from "@/lib/racebox/ubxParser";
import { distanceM, segmentCrossingFraction, type GeoPoint } from "@/lib/racebox/geo";
import { ImuCalibrator, type CalibrationPhase } from "@/lib/racebox/calibration";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type RaceBoxStatus = "disconnected" | "connecting" | "connected" | "error";

export interface FinishLine {
  p1: GeoPoint;
  p2: GeoPoint;
}

interface LapRecord {
  lapNumber: number;
  durationMs: number;
  distances: number[];      // cumulative meters at each sample index
  timestamps: number[];     // performance.now() at each sample index
  totalDistanceM: number;
}

/* ------------------------------------------------------------------ */
/*  Zustand store                                                      */
/* ------------------------------------------------------------------ */

interface RaceBoxState {
  status: RaceBoxStatus;
  error: string | null;
  sample: RaceBoxSample | null;
  finishLine: FinishLine | null;

  // Lap tracking
  currentLapNumber: number;
  currentLapStartTime: number;
  currentLapDistances: number[];
  currentLapTimestamps: number[];
  prevSample: RaceBoxSample | null;
  samplesSinceCrossing: number;

  // Completed laps
  previousLap: LapRecord | null;
  bestLap: LapRecord | null;
  laps: LapRecord[];
  lastLapMs: number;
  bestLapMs: number;

  // Real-time delta
  deltaMs: number | null;
  currentLapElapsedMs: number;
  currentDistanceM: number;
  maxSpeedKmh: number;

  // IMU calibration
  calibrationPhase: CalibrationPhase;
  calibrationProgress: number;

  // Actions
  setStatus: (s: RaceBoxStatus, error?: string) => void;
  setFinishLine: (fl: FinishLine | null) => void;
  addSample: (s: RaceBoxSample) => void;
  startCalibration: () => void;
  reset: () => void;
}

const CROSSING_COOLDOWN = 75; // minimum samples between crossings (~3s at 25Hz)
const ALIGN_SPEED = 15; // km/h threshold for heading alignment

// Singleton calibrator — survives store resets
const calibrator = new ImuCalibrator();

function computeDelta(
  currentDist: number,
  currentElapsed: number,
  ref: LapRecord,
): number | null {
  if (ref.distances.length < 2 || currentDist <= 0) return null;

  // Binary search for currentDist in ref.distances
  const dists = ref.distances;
  const times = ref.timestamps;
  let lo = 0, hi = dists.length - 1;

  if (currentDist > dists[hi]) return null; // Beyond reference lap

  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (dists[mid] < currentDist) lo = mid + 1;
    else hi = mid;
  }

  // Interpolate
  const i = Math.max(0, lo - 1);
  const j = Math.min(lo, dists.length - 1);
  let refElapsed: number;
  if (i === j || dists[j] === dists[i]) {
    refElapsed = times[i] - times[0];
  } else {
    const frac = (currentDist - dists[i]) / (dists[j] - dists[i]);
    const refTime = times[i] + frac * (times[j] - times[i]);
    refElapsed = refTime - times[0];
  }

  return currentElapsed - refElapsed;
}

export const useRaceBoxStore = create<RaceBoxState>((set, get) => ({
  status: "disconnected",
  error: null,
  sample: null,
  finishLine: loadFinishLine(),

  currentLapNumber: 0,
  currentLapStartTime: 0,
  currentLapDistances: [],
  currentLapTimestamps: [],
  prevSample: null,
  samplesSinceCrossing: 0,

  previousLap: null,
  bestLap: null,
  laps: [],
  lastLapMs: 0,
  bestLapMs: 0,

  deltaMs: null,
  currentLapElapsedMs: 0,
  currentDistanceM: 0,
  maxSpeedKmh: 0,

  calibrationPhase: "idle",
  calibrationProgress: 0,

  setStatus: (status, error) => set({ status, error: error ?? null }),

  setFinishLine: (fl) => {
    set({ finishLine: fl });
    saveFinishLine(fl);
  },

  startCalibration: () => {
    calibrator.startCalibration();
    set({ calibrationPhase: "sampling", calibrationProgress: 0 });
  },

  addSample: (s) => {
    const state = get();
    const calPhase = calibrator.state.phase;

    // Phase 1: static calibration — accumulate gravity samples
    if (calPhase === "sampling") {
      const raw = { x: s.gForceX, y: s.gForceY, z: s.gForceZ };
      const done = calibrator.addStaticSample(raw);
      set({
        sample: s,
        calibrationProgress: calibrator.state.progress,
        ...(done ? { calibrationPhase: "ready" as CalibrationPhase } : {}),
      });
      return; // Don't process laps during calibration
    }

    // Phase 2: dynamic alignment — check on each sample if moving fast enough
    if (calPhase === "ready" && s.speedKmh >= ALIGN_SPEED) {
      const noGrav = calibrator.removeGravity({ x: s.gForceX, y: s.gForceY, z: s.gForceZ });
      const aligned = calibrator.addHeadingSample(s.headingDeg, noGrav);
      if (aligned) {
        set({ calibrationPhase: "aligned" });
      }
    }

    // Apply calibration to G-force values
    if (calPhase === "ready" || calPhase === "aligned") {
      const calibrated = calibrator.transform({ x: s.gForceX, y: s.gForceY, z: s.gForceZ });
      s = { ...s, gForceX: calibrated.x, gForceY: calibrated.y, gForceZ: calibrated.z };
    }

    const fl = state.finishLine;
    const prev = state.prevSample;
    let {
      currentLapDistances, currentLapTimestamps, currentLapStartTime,
      currentLapNumber, samplesSinceCrossing, previousLap, bestLap,
      laps, lastLapMs, bestLapMs, maxSpeedKmh,
    } = state;

    samplesSinceCrossing++;
    maxSpeedKmh = Math.max(maxSpeedKmh, s.speedKmh);

    // Distance accumulation
    let currentDist = currentLapDistances.length > 0
      ? currentLapDistances[currentLapDistances.length - 1]
      : 0;

    if (prev && s.fixType >= 2) {
      const d = distanceM(prev, s);
      // Filter GPS jitter: ignore jumps > 50m in one sample (~2m at 25Hz/100kmh)
      if (d < 50) {
        currentDist += d;
      }
    }

    const newDistances = [...currentLapDistances, currentDist];
    const newTimestamps = [...currentLapTimestamps, s.timestamp];

    // Finish line crossing check
    let crossed = false;
    if (fl && prev && s.fixType >= 3 && samplesSinceCrossing > CROSSING_COOLDOWN) {
      const frac = segmentCrossingFraction(prev, s, fl.p1, fl.p2);
      if (frac !== null) {
        crossed = true;
      }
    }

    let deltaMs = state.deltaMs;
    let currentElapsed = currentLapStartTime > 0
      ? s.timestamp - currentLapStartTime : 0;

    if (crossed) {
      // Complete current lap (if we have a start time)
      if (currentLapStartTime > 0 && currentLapNumber > 0) {
        const lapDuration = s.timestamp - currentLapStartTime;
        const lap: LapRecord = {
          lapNumber: currentLapNumber,
          durationMs: lapDuration,
          distances: newDistances,
          timestamps: newTimestamps,
          totalDistanceM: currentDist,
        };
        previousLap = lap;
        lastLapMs = lapDuration;
        laps = [...laps, lap];

        if (bestLapMs === 0 || lapDuration < bestLapMs) {
          bestLapMs = lapDuration;
          bestLap = lap;
        }
      }

      // Start new lap
      currentLapNumber++;
      samplesSinceCrossing = 0;
      maxSpeedKmh = s.speedKmh;
      deltaMs = null;
      currentElapsed = 0;

      set({
        sample: s,
        prevSample: s,
        currentLapNumber,
        currentLapStartTime: s.timestamp,
        currentLapDistances: [0],
        currentLapTimestamps: [s.timestamp],
        samplesSinceCrossing,
        previousLap,
        bestLap,
        laps,
        lastLapMs,
        bestLapMs,
        deltaMs: null,
        currentLapElapsedMs: 0,
        currentDistanceM: 0,
        maxSpeedKmh,
      });
      return;
    }

    // Compute delta against previous lap
    if (previousLap && currentLapStartTime > 0) {
      deltaMs = computeDelta(currentDist, currentElapsed, previousLap);
    }

    set({
      sample: s,
      prevSample: s,
      currentLapDistances: newDistances,
      currentLapTimestamps: newTimestamps,
      samplesSinceCrossing,
      deltaMs,
      currentLapElapsedMs: currentElapsed,
      currentDistanceM: currentDist,
      maxSpeedKmh,
    });
  },

  reset: () => {
    calibrator.reset();
    set({
      currentLapNumber: 0,
      currentLapStartTime: 0,
      currentLapDistances: [],
      currentLapTimestamps: [],
      prevSample: null,
      samplesSinceCrossing: 0,
      previousLap: null,
      bestLap: null,
      laps: [],
      lastLapMs: 0,
      bestLapMs: 0,
      deltaMs: null,
      currentLapElapsedMs: 0,
      currentDistanceM: 0,
      maxSpeedKmh: 0,
      calibrationPhase: "idle",
      calibrationProgress: 0,
    });
  },
}));

/* ------------------------------------------------------------------ */
/*  Finish line persistence (localStorage)                             */
/* ------------------------------------------------------------------ */

function loadFinishLine(): FinishLine | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("bbn-racebox-finishline");
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function saveFinishLine(fl: FinishLine | null) {
  if (typeof window === "undefined") return;
  if (fl) localStorage.setItem("bbn-racebox-finishline", JSON.stringify(fl));
  else localStorage.removeItem("bbn-racebox-finishline");
}

/* ------------------------------------------------------------------ */
/*  BLE connection hook                                                */
/* ------------------------------------------------------------------ */

const UART_SERVICE = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const UART_TX_CHAR = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";

export function useRaceBox() {
  const store = useRaceBoxStore();
  const deviceRef = useRef<BluetoothDevice | null>(null);
  const parserRef = useRef(new UbxParser());
  const sampleBuf = useRef<RaceBoxSample | null>(null);
  const [supported] = useState(() =>
    typeof window !== "undefined" && "bluetooth" in navigator
  );

  // Throttle state updates to ~10Hz
  useEffect(() => {
    if (store.status !== "connected") return;
    const iv = setInterval(() => {
      const s = sampleBuf.current;
      if (s) {
        store.addSample(s);
        sampleBuf.current = null;
      }
    }, 100);
    return () => clearInterval(iv);
  }, [store.status]);

  const connect = useCallback(async () => {
    if (!supported) return;
    store.setStatus("connecting");
    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: "RaceBox" }],
        optionalServices: [UART_SERVICE],
      });
      deviceRef.current = device;

      device.addEventListener("gattserverdisconnected", () => {
        store.setStatus("disconnected");
      });

      const server = await device.gatt!.connect();
      const service = await server.getPrimaryService(UART_SERVICE);
      const txChar = await service.getCharacteristic(UART_TX_CHAR);

      parserRef.current.reset();

      txChar.addEventListener("characteristicvaluechanged", (event: any) => {
        const dv = event.target.value as DataView;
        const samples = parserRef.current.feed(dv);
        if (samples.length > 0) {
          // Keep latest sample for throttled processing
          sampleBuf.current = samples[samples.length - 1];
        }
      });

      await txChar.startNotifications();
      store.setStatus("connected");
    } catch (e: any) {
      if (e.name === "NotFoundError") {
        // User cancelled device picker
        store.setStatus("disconnected");
      } else {
        store.setStatus("error", e.message || "BLE connection failed");
      }
    }
  }, [supported]);

  const disconnect = useCallback(() => {
    if (deviceRef.current?.gatt?.connected) {
      deviceRef.current.gatt.disconnect();
    }
    deviceRef.current = null;
    store.setStatus("disconnected");
  }, []);

  return {
    supported,
    status: store.status,
    error: store.error,
    connect,
    disconnect,
  };
}
