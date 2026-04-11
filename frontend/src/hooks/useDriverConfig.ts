"use client";

import { create } from "zustand";

/* ------------------------------------------------------------------ */
/*  Driver View Configuration Store (persisted to localStorage)        */
/* ------------------------------------------------------------------ */

export type DriverCardId =
  | "raceTimer"
  | "currentLapTime"
  | "lastLap"
  | "deltaBestLap"
  | "gForceRadar"
  | "position"
  | "realPos"
  | "gapAhead"
  | "gapBehind"
  | "avgLap20"
  | "best3"
  | "avgFutureStint"
  | "boxScore"
  | "gpsLapDelta"
  | "gpsSpeed"
  | "gpsGForce"
  | "bestStintLap"
  | "lapsToMaxStint";

export const ALL_DRIVER_CARDS: { id: DriverCardId; label: string; requiresGps: boolean }[] = [
  { id: "raceTimer", label: "Tiempo de carrera", requiresGps: false },
  { id: "currentLapTime", label: "Vuelta actual (tiempo real)", requiresGps: true },
  { id: "lastLap", label: "Última vuelta", requiresGps: false },
  { id: "deltaBestLap", label: "Delta vs Best Lap (GPS)", requiresGps: true },
  { id: "gForceRadar", label: "G-Force (diana)", requiresGps: true },
  { id: "position", label: "Posición (tiempos medios)", requiresGps: false },
  { id: "realPos", label: "Posición (clasif. real)", requiresGps: false },
  { id: "gapAhead", label: "Gap kart delante", requiresGps: false },
  { id: "gapBehind", label: "Gap kart detrás", requiresGps: false },
  { id: "avgLap20", label: "Vuelta media (20v)", requiresGps: false },
  { id: "best3", label: "Mejor 3 (3V)", requiresGps: false },
  { id: "avgFutureStint", label: "Media stint futuro", requiresGps: false },
  { id: "boxScore", label: "Puntuación Box", requiresGps: false },
  { id: "bestStintLap", label: "Mejor vuelta stint", requiresGps: false },
  { id: "gpsLapDelta", label: "Delta vuelta anterior GPS", requiresGps: true },
  { id: "gpsSpeed", label: "Velocidad GPS", requiresGps: true },
  { id: "gpsGForce", label: "G-Force (números)", requiresGps: true },
  { id: "lapsToMaxStint", label: "Vueltas hasta stint máximo", requiresGps: false },
];

export const DEFAULT_CARD_ORDER: DriverCardId[] = ALL_DRIVER_CARDS.map((c) => c.id);

interface DriverConfig {
  // Circuit selection (for finish line GPS coords)
  selectedCircuitId: number | null;
  // Kart number override (null = use from race session config)
  selectedKartNumber: number | null;
  // Visible cards (true = visible)
  visibleCards: Record<DriverCardId, boolean>;
  // Card display order
  cardOrder: DriverCardId[];

  // Actions
  setCircuitId: (id: number | null) => void;
  setKartNumber: (kart: number | null) => void;
  setCardVisible: (card: DriverCardId, visible: boolean) => void;
  setCardOrder: (order: DriverCardId[]) => void;
  /** Re-hydrate from localStorage for a specific user */
  hydrateForUser: (userId: number | null) => void;
}

const STORAGE_PREFIX = "bbn-driver-config";

/** Current user ID tracked for save operations */
let _currentUserId: number | null = null;

function storageKey(userId: number | null): string {
  return userId ? `${STORAGE_PREFIX}-${userId}` : STORAGE_PREFIX;
}

function loadConfig(userId: number | null): Partial<Pick<DriverConfig, "selectedCircuitId" | "selectedKartNumber" | "visibleCards" | "cardOrder">> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (raw) {
      const data = JSON.parse(raw);
      // Validate card order has all cards — append any missing ones
      if (data.cardOrder) {
        const missing = DEFAULT_CARD_ORDER.filter((c) => !data.cardOrder.includes(c));
        if (missing.length > 0) data.cardOrder = [...data.cardOrder, ...missing];
        // Remove cards that no longer exist
        data.cardOrder = data.cardOrder.filter((c: string) => DEFAULT_CARD_ORDER.includes(c as DriverCardId));
      }
      return data;
    }
    // Migrate from old global key if user-specific key doesn't exist yet
    if (userId) {
      const oldRaw = localStorage.getItem(STORAGE_PREFIX);
      if (oldRaw) {
        const data = JSON.parse(oldRaw);
        if (data.cardOrder) {
          const missing = DEFAULT_CARD_ORDER.filter((c) => !data.cardOrder.includes(c));
          if (missing.length > 0) data.cardOrder = [...data.cardOrder, ...missing];
          data.cardOrder = data.cardOrder.filter((c: string) => DEFAULT_CARD_ORDER.includes(c as DriverCardId));
        }
        // Save as user-specific and remove old global key
        localStorage.setItem(storageKey(userId), oldRaw);
        localStorage.removeItem(STORAGE_PREFIX);
        return data;
      }
    }
  } catch {}
  return {};
}

function saveConfig(userId: number | null, state: Pick<DriverConfig, "selectedCircuitId" | "selectedKartNumber" | "visibleCards" | "cardOrder">) {
  if (typeof window === "undefined") return;
  localStorage.setItem(storageKey(userId), JSON.stringify({
    selectedCircuitId: state.selectedCircuitId,
    selectedKartNumber: state.selectedKartNumber,
    visibleCards: state.visibleCards,
    cardOrder: state.cardOrder,
  }));
}

const defaultVisible: Record<DriverCardId, boolean> = Object.fromEntries(
  ALL_DRIVER_CARDS.map((c) => [c.id, true])
) as Record<DriverCardId, boolean>;

const loaded = loadConfig(null);

export const useDriverConfig = create<DriverConfig>((set, get) => ({
  selectedCircuitId: loaded.selectedCircuitId ?? null,
  selectedKartNumber: loaded.selectedKartNumber ?? null,
  visibleCards: { ...defaultVisible, ...loaded.visibleCards },
  cardOrder: loaded.cardOrder ?? DEFAULT_CARD_ORDER,

  setCircuitId: (id) => {
    set({ selectedCircuitId: id });
    saveConfig(_currentUserId, get());
  },
  setKartNumber: (kart) => {
    set({ selectedKartNumber: kart });
    saveConfig(_currentUserId, get());
  },
  setCardVisible: (card, visible) => {
    const visibleCards = { ...get().visibleCards, [card]: visible };
    set({ visibleCards });
    saveConfig(_currentUserId, get());
  },
  setCardOrder: (order) => {
    set({ cardOrder: order });
    saveConfig(_currentUserId, get());
  },
  hydrateForUser: (userId) => {
    _currentUserId = userId;
    const cfg = loadConfig(userId);
    set({
      selectedCircuitId: cfg.selectedCircuitId ?? null,
      selectedKartNumber: cfg.selectedKartNumber ?? null,
      visibleCards: { ...defaultVisible, ...cfg.visibleCards },
      cardOrder: cfg.cardOrder ?? DEFAULT_CARD_ORDER,
    });
  },
}));
