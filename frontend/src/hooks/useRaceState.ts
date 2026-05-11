"use client";

import { create } from "zustand";
import type {
  KartState,
  FifoState,
  ClassificationEntry,
  ClassificationMeta,
  RaceConfig,
  RaceSnapshot,
  SectorMeta,
  WsUpdateEvent,
  PitStatus,
} from "@/types/race";

interface RaceStore {
  connected: boolean;
  raceStarted: boolean;
  raceFinished: boolean;
  countdownMs: number;
  trackName: string;
  durationMs: number;
  karts: KartState[];
  fifo: FifoState;
  classification: ClassificationEntry[];
  classificationMeta: ClassificationMeta | null;
  config: RaceConfig;

  // Sector telemetry — only present on circuits whose Apex grid declares
  // `s1|s2|s3` columns. `hasSectors` flips true when the backend reports
  // its first SECTOR event in the active session; the driver-view sector
  // cards check this to decide whether to render data or a "--" stub.
  hasSectors: boolean;
  sectorMeta: SectorMeta | null;

  /** Backend-computed pit-gate state. null while the snapshot hasn't
   *  arrived yet (initial mount). StatusBar reads this to decide
   *  between PIT ABIERTO / PIT CERRADO + reason; the FifoQueue uses
   *  `nextOpenCountdownMs` to render "Pit abre en …". */
  pitStatus: PitStatus | null;

  // Apex connection status (persists across tab changes)
  apexConnected: boolean;
  apexStatusMsg: string;
  setApexStatus: (connected: boolean, msg: string) => void;

  // Replay status (persists across tab changes)
  replayActive: boolean;
  replayPaused: boolean;
  replayFilename: string;
  replayProgress: number;
  replayTime: string;
  replaySpeed: number;
  replayTotalBlocks: number;
  replayStartBlock: number;
  replayCircuitDir: string;
  setReplayStatus: (active: boolean, paused?: boolean, filename?: string, progress?: number, currentTime?: string, speed?: number, totalBlocks?: number) => void;
  setReplayStartBlock: (block: number) => void;
  setReplayCircuitDir: (dir: string) => void;

  // GPS overlay window for the active replay session. Stored globally so
  // the synced satellite map can be shown from anywhere in the app (GPS
  // Insights tab) and survive tab switches without losing the marker.
  replayGpsOverlay: {
    circuitId: number;
    kartNumber: number | null;
    windowStart: string;   // ISO timestamp
    windowEnd: string;     // ISO timestamp
  } | null;
  setReplayGpsOverlay: (overlay: RaceStore["replayGpsOverlay"]) => void;

  // WS reconnect trigger - increment to force WS to close and reconnect
  wsReconnectTrigger: number;
  requestWsReconnect: () => void;

  // Teams updated signal - incremented when backend loads teams from PHP API
  teamsUpdatedAt: number;
  notifyTeamsUpdated: () => void;

  setConnected: (v: boolean) => void;
  applySnapshot: (snapshot: RaceSnapshot) => void;
  applyUpdates: (events: WsUpdateEvent[]) => void;
  applyFifoUpdate: (data: any) => void;
  applyAnalytics: (data: any) => void;
  applyClassificationUpdate: (data: any) => void;
  /** Refresh hasSectors + sectorMeta from a top-level update message
   * (only sent by the backend when a sector event was in the batch).
   * Called from the WS hook after `applyUpdates` so per-kart sector
   * mutations and field-best refresh land in the same render. */
  applySectorMetaUpdate: (hasSectors: boolean, meta: SectorMeta | null) => void;
}

const defaultFifo: FifoState = { queue: [], score: 0, history: [] };

/** Normalize the snake_case pit_status dict sent by the backend (Python
 *  dataclass field names) into the camelCase `PitStatus` shape used by
 *  the rest of the frontend. Returns null when the input is missing or
 *  malformed so callers can fall back to "no opinion" rendering. */
function normalizePitStatus(raw: any): PitStatus | null {
  if (!raw || typeof raw !== "object") return null;
  return {
    isOpen: !!raw.is_open,
    closeReason: raw.close_reason ?? null,
    blockingDriver: raw.blocking_driver ?? null,
    blockingDriverRemainingMs: raw.blocking_driver_remaining_ms ?? 0,
    nextOpenCountdownMs: raw.next_open_countdown_ms ?? null,
    drivers: Array.isArray(raw.drivers)
      ? raw.drivers.map((d: any) => ({
          name: d.name ?? "",
          accumulatedMs: d.accumulated_ms ?? 0,
          remainingMs: d.remaining_ms ?? 0,
        }))
      : [],
  };
}
const defaultConfig: RaceConfig = {
  circuitLengthM: 1100,
  pitTimeS: 120,
  ourKartNumber: 0,
  minPits: 3,
  maxStintMin: 40,
  minStintMin: 15,
  durationMin: 180,
  boxLines: 2,
  boxKarts: 30,
  minDriverTimeMin: 30,
  pitClosedStartMin: 0,
  pitClosedEndMin: 0,
  rain: false,
  finishLat1: null,
  finishLon1: null,
  finishLat2: null,
  finishLon2: null,
};

export const useRaceStore = create<RaceStore>((set) => ({
  connected: false,
  raceStarted: false,
  raceFinished: false,
  countdownMs: 0,
  trackName: "",
  durationMs: 0,
  karts: [],
  fifo: defaultFifo,
  classification: [],
  classificationMeta: null,
  config: defaultConfig,
  hasSectors: false,
  sectorMeta: null,
  pitStatus: null,

  apexConnected: false,
  apexStatusMsg: "",
  setApexStatus: (connected, msg) => set({ apexConnected: connected, apexStatusMsg: msg }),

  replayActive: false,
  replayPaused: false,
  replayFilename: "",
  replayProgress: 0,
  replayTime: "",
  replaySpeed: 1,
  replayTotalBlocks: 0,
  replayStartBlock: 0,
  replayCircuitDir: "",
  setReplayCircuitDir: (dir) => set({ replayCircuitDir: dir }),
  setReplayStatus: (active, paused = false, filename, progress = 0, currentTime = "", speed, totalBlocks) =>
    set((s) => ({
      replayActive: active,
      replayPaused: paused,
      replayFilename: filename !== undefined ? filename : s.replayFilename,
      replayProgress: progress,
      replayTime: currentTime,
      replaySpeed: speed !== undefined ? speed : s.replaySpeed,
      replayTotalBlocks: totalBlocks !== undefined ? totalBlocks : s.replayTotalBlocks,
      // When replay stops, also drop the GPS overlay so the panel hides
      // automatically — the user explicitly opted in by hitting Play, so
      // we shouldn't keep it ghosting on the GPS Insights tab afterwards.
      replayGpsOverlay: active ? s.replayGpsOverlay : null,
    })),
  setReplayStartBlock: (block) => set({ replayStartBlock: block }),

  replayGpsOverlay: null,
  setReplayGpsOverlay: (overlay) => set({ replayGpsOverlay: overlay }),

  wsReconnectTrigger: 0,
  requestWsReconnect: () => set((s) => ({ wsReconnectTrigger: s.wsReconnectTrigger + 1 })),

  teamsUpdatedAt: 0,
  notifyTeamsUpdated: () => set((s) => ({ teamsUpdatedAt: s.teamsUpdatedAt + 1 })),

  setConnected: (v) => set({ connected: v }),

  applySnapshot: (snapshot) =>
    set((state) => {
      const out: Partial<RaceStore> = {
        raceStarted: snapshot.raceStarted,
        raceFinished: snapshot.raceFinished || false,
        countdownMs: snapshot.countdownMs,
        trackName: snapshot.trackName,
        durationMs: snapshot.durationMs || 0,
        karts: snapshot.karts,
        fifo: snapshot.fifo || defaultFifo,
        classification: snapshot.classification || [],
        classificationMeta: snapshot.classificationMeta || null,
        config: snapshot.config || defaultConfig,
      };
      // Sector telemetry: only overwrite when the snapshot actually
      // carries the keys. Analytics broadcasts can reuse the same
      // applySnapshot path without bundling sectorMeta — overwriting
      // unconditionally would flash hasSectors → false between every
      // analytics tick, making the driver-view sector cards flicker
      // to "--" every ~10-30s. Genuine clears arrive as explicit
      // `hasSectors: false` from the backend on session change.
      if (Object.prototype.hasOwnProperty.call(snapshot, "hasSectors")) {
        out.hasSectors = !!snapshot.hasSectors;
      }
      if (Object.prototype.hasOwnProperty.call(snapshot, "sectorMeta")) {
        out.sectorMeta = snapshot.sectorMeta ?? null;
      }
      // Pit-gate decision: when present, replace; when absent, keep
      // whatever we already had so transient frames without pitStatus
      // don't blank out the badge.
      const anySnap = snapshot as any;
      if (Object.prototype.hasOwnProperty.call(anySnap, "pitStatus")) {
        out.pitStatus = normalizePitStatus(anySnap.pitStatus);
      }
      return out as RaceStore;
    }),

  applyUpdates: (events) =>
    set((state) => {
      const karts = [...state.karts];
      let countdownMs = state.countdownMs;
      let trackName = state.trackName;

      let raceFinished = state.raceFinished;

      for (const ev of events) {
        if (ev.event === "raceEnd") {
          countdownMs = 0;
          raceFinished = true;
          continue;
        }
        if (ev.event === "countdown" && typeof ev.ms === "number") {
          countdownMs = ev.ms;
          continue;
        }
        if (ev.event === "track" && ev.name) {
          trackName = ev.name as string;
          continue;
        }

        if (!ev.rowId) continue;
        const idx = karts.findIndex((k) => k.rowId === ev.rowId);
        if (idx === -1) continue;

        const kart = { ...karts[idx] };

        switch (ev.event) {
          case "lap":
          case "lapMs":
            if (typeof ev.lapTimeMs === "number") {
              kart.lastLapMs = ev.lapTimeMs;
              kart.stintElapsedMs += ev.lapTimeMs; // Keep stint elapsed in sync
            }
            if (typeof ev.totalLaps === "number") kart.totalLaps = ev.totalLaps;
            break;
          case "bestLap":
            if (typeof ev.lapTimeMs === "number") kart.bestLapMs = ev.lapTimeMs;
            break;
          case "position":
            if (typeof ev.position === "number") kart.position = ev.position;
            break;
          case "pitIn":
            kart.pitStatus = "in_pit";
            if (typeof ev.pitInCountdownMs === "number") kart.pitInCountdownMs = ev.pitInCountdownMs;
            if (ev.pitRecord) {
              kart.pitHistory = [...(kart.pitHistory || []), ev.pitRecord as any];
            }
            break;
          case "pitOut":
            kart.pitStatus = "racing";
            if (typeof ev.pitCount === "number") kart.pitCount = ev.pitCount;
            if (typeof ev.stintStartCountdownMs === "number") kart.stintStartCountdownMs = ev.stintStartCountdownMs;
            kart.pitInCountdownMs = undefined;
            kart.stintDurationS = 0;
            kart.stintElapsedMs = 0;
            kart.stintLapsCount = 0;
            break;
          case "gap":
            kart.gap = (ev.value as string) || "";
            break;
          case "interval":
            kart.interval = (ev.value as string) || "";
            break;
          case "totalLaps":
            if (typeof ev.value === "number") kart.totalLaps = ev.value;
            break;
          case "pitTime":
            kart.pitTime = (ev.value as string) || "";
            break;
          case "pitCount":
            if (typeof ev.value === "number") kart.pitCount = ev.value;
            break;
          case "driver":
            kart.driverName = (ev.driverName as string) || "";
            kart.driverTime = (ev.driverTime as string) || "";
            break;
          case "team":
            kart.teamName = (ev.teamName as string) || "";
            break;
          case "sector": {
            // Per-kart sector update. Backend also bundles a fresh
            // sectorMeta at the top level of the same update message
            // (handled below) — this branch only updates the kart's
            // own currentSNMs / bestSNMs so the live "Δ vs field-best"
            // card reflects the latest sector pass for this pilot.
            const sectorIdx = typeof ev.sectorIdx === "number" ? ev.sectorIdx : 0;
            const ms = typeof ev.ms === "number" ? ev.ms : 0;
            if (ms > 0) {
              if (sectorIdx === 1) {
                kart.currentS1Ms = ms;
                if (!kart.bestS1Ms || ms < kart.bestS1Ms) kart.bestS1Ms = ms;
              } else if (sectorIdx === 2) {
                kart.currentS2Ms = ms;
                if (!kart.bestS2Ms || ms < kart.bestS2Ms) kart.bestS2Ms = ms;
              } else if (sectorIdx === 3) {
                kart.currentS3Ms = ms;
                if (!kart.bestS3Ms || ms < kart.bestS3Ms) kart.bestS3Ms = ms;
              }
            }
            break;
          }
        }

        karts[idx] = kart;
      }

      return { karts, countdownMs, trackName, raceFinished };
    }),

  applyFifoUpdate: (data) =>
    set((state) => ({
      fifo: data.fifo || { queue: [], score: 0, history: [] },
      // Backend bundles the recomputed pit-gate state on every
      // fifo_update so the badge reacts immediately to a pit-in / pit-
      // out shifting driver totals. Missing field → keep previous value.
      pitStatus: Object.prototype.hasOwnProperty.call(data, "pitStatus")
        ? normalizePitStatus(data.pitStatus)
        : state.pitStatus,
    })),

  applyAnalytics: (data) =>
    set((state) => {
      const out: Partial<RaceStore> = {
        karts: data.karts || [],
        fifo: data.fifo || defaultFifo,
        classification: data.classification || [],
        classificationMeta: data.classificationMeta ?? state.classificationMeta,
        // Merge config if present (allows live config updates without reconnect)
        config: data.config ? { ...state.config, ...data.config } : state.config,
      };
      // Forward sector telemetry through analytics frames too — the
      // backend bundles it on every analytics broadcast since flicker
      // fix. Falling back to the existing state when keys are absent
      // keeps the cards stable on older backends.
      if (Object.prototype.hasOwnProperty.call(data, "hasSectors")) {
        out.hasSectors = !!data.hasSectors;
      }
      if (Object.prototype.hasOwnProperty.call(data, "sectorMeta")) {
        out.sectorMeta = data.sectorMeta ?? null;
      }
      if (Object.prototype.hasOwnProperty.call(data, "pitStatus")) {
        out.pitStatus = normalizePitStatus(data.pitStatus);
      }
      return out as RaceStore;
    }),

  // Lightweight: backend pushes this on every batch with a LAP event so the
  // Clasif Real table re-orders live (instead of waiting up to 10-30s for
  // the next analytics tick). Only touches classification + meta.
  applyClassificationUpdate: (data) =>
    set((state) => ({
      classification: data.classification || state.classification,
      classificationMeta: data.classificationMeta ?? state.classificationMeta,
    })),

  applySectorMetaUpdate: (hasSectors, meta) =>
    set({ hasSectors, sectorMeta: meta }),
}));
