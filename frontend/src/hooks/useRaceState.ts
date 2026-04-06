"use client";

import { create } from "zustand";
import type {
  KartState,
  FifoState,
  ClassificationEntry,
  RaceConfig,
  RaceSnapshot,
  WsUpdateEvent,
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
  config: RaceConfig;

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
  setReplayStatus: (active: boolean, paused?: boolean, filename?: string, progress?: number, currentTime?: string, speed?: number, totalBlocks?: number) => void;
  setReplayStartBlock: (block: number) => void;

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
}

const defaultFifo: FifoState = { queue: [], score: 0, history: [] };
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
  config: defaultConfig,

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
  setReplayStatus: (active, paused = false, filename, progress = 0, currentTime = "", speed, totalBlocks) =>
    set((s) => ({
      replayActive: active,
      replayPaused: paused,
      replayFilename: filename !== undefined ? filename : s.replayFilename,
      replayProgress: progress,
      replayTime: currentTime,
      replaySpeed: speed !== undefined ? speed : s.replaySpeed,
      replayTotalBlocks: totalBlocks !== undefined ? totalBlocks : s.replayTotalBlocks,
    })),
  setReplayStartBlock: (block) => set({ replayStartBlock: block }),

  wsReconnectTrigger: 0,
  requestWsReconnect: () => set((s) => ({ wsReconnectTrigger: s.wsReconnectTrigger + 1 })),

  teamsUpdatedAt: 0,
  notifyTeamsUpdated: () => set((s) => ({ teamsUpdatedAt: s.teamsUpdatedAt + 1 })),

  setConnected: (v) => set({ connected: v }),

  applySnapshot: (snapshot) =>
    set({
      raceStarted: snapshot.raceStarted,
      raceFinished: snapshot.raceFinished || false,
      countdownMs: snapshot.countdownMs,
      trackName: snapshot.trackName,
      durationMs: snapshot.durationMs || 0,
      karts: snapshot.karts,
      fifo: snapshot.fifo || defaultFifo,
      classification: snapshot.classification || [],
      config: snapshot.config || defaultConfig,
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
            if (typeof ev.lapTimeMs === "number") kart.lastLapMs = ev.lapTimeMs;
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
            if (ev.pitRecord) {
              kart.pitHistory = [...(kart.pitHistory || []), ev.pitRecord as any];
            }
            break;
          case "pitOut":
            kart.pitStatus = "racing";
            if (typeof ev.pitCount === "number") kart.pitCount = ev.pitCount;
            if (typeof ev.stintStartCountdownMs === "number") kart.stintStartCountdownMs = ev.stintStartCountdownMs;
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
        }

        karts[idx] = kart;
      }

      return { karts, countdownMs, trackName, raceFinished };
    }),

  applyFifoUpdate: (data) =>
    set({
      fifo: data.fifo || { queue: [], score: 0, history: [] },
    }),

  applyAnalytics: (data) =>
    set((state) => ({
      karts: data.karts || [],
      fifo: data.fifo || defaultFifo,
      classification: data.classification || [],
      // Merge config if present (allows live config updates without reconnect)
      config: data.config ? { ...state.config, ...data.config } : state.config,
    })),
}));
