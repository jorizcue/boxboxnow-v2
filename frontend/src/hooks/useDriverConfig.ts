"use client";

import { create } from "zustand";
import { api } from "@/lib/api";
import { broadcastDriverConfig } from "@/lib/driverChannel";

/* ------------------------------------------------------------------ */
/*  Driver View Configuration Store                                    */
/*  Persisted to DB via /api/config/preferences                        */
/*  localStorage used as instant cache + offline fallback              */
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
  | "lapsToMaxStint"
  | "pitWindow";

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
  { id: "pitWindow", label: "Ventana de pit (open/closed)", requiresGps: false },
];

export const DEFAULT_CARD_ORDER: DriverCardId[] = ALL_DRIVER_CARDS.map((c) => c.id);

interface DriverConfig {
  selectedCircuitId: number | null;
  selectedKartNumber: number | null;
  visibleCards: Record<DriverCardId, boolean>;
  cardOrder: DriverCardId[];

  setCircuitId: (id: number | null) => void;
  setKartNumber: (kart: number | null) => void;
  setCardVisible: (card: DriverCardId, visible: boolean) => void;
  setCardOrder: (order: DriverCardId[]) => void;
  /** Apply a preset (batch update visibleCards + cardOrder) */
  applyPreset: (visibleCards: Record<DriverCardId, boolean>, cardOrder: DriverCardId[]) => void;
  /** Re-hydrate from localStorage + API for a specific user */
  hydrateForUser: (userId: number | null) => void;
}

/* ------------------------------------------------------------------ */
/*  localStorage helpers (cache + offline fallback)                    */
/* ------------------------------------------------------------------ */

const STORAGE_PREFIX = "bbn-driver-config";
let _currentUserId: number | null = null;

function storageKey(userId: number | null): string {
  return userId ? `${STORAGE_PREFIX}-${userId}` : STORAGE_PREFIX;
}

function validateCardOrder(cardOrder: DriverCardId[]): DriverCardId[] {
  const missing = DEFAULT_CARD_ORDER.filter((c) => !cardOrder.includes(c));
  const valid = cardOrder.filter((c) => DEFAULT_CARD_ORDER.includes(c));
  return [...valid, ...missing];
}

function loadLocalConfig(userId: number | null): Partial<Pick<DriverConfig, "selectedCircuitId" | "selectedKartNumber" | "visibleCards" | "cardOrder">> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (raw) {
      const data = JSON.parse(raw);
      if (data.cardOrder) data.cardOrder = validateCardOrder(data.cardOrder);
      return data;
    }
    // Migrate from old global key
    if (userId) {
      const oldRaw = localStorage.getItem(STORAGE_PREFIX);
      if (oldRaw) {
        const data = JSON.parse(oldRaw);
        if (data.cardOrder) data.cardOrder = validateCardOrder(data.cardOrder);
        localStorage.setItem(storageKey(userId), oldRaw);
        localStorage.removeItem(STORAGE_PREFIX);
        return data;
      }
    }
  } catch {}
  return {};
}

function saveLocalConfig(userId: number | null, state: Pick<DriverConfig, "selectedCircuitId" | "selectedKartNumber" | "visibleCards" | "cardOrder">) {
  if (typeof window === "undefined") return;
  localStorage.setItem(storageKey(userId), JSON.stringify({
    selectedCircuitId: state.selectedCircuitId,
    selectedKartNumber: state.selectedKartNumber,
    visibleCards: state.visibleCards,
    cardOrder: state.cardOrder,
  }));
}

/* ------------------------------------------------------------------ */
/*  Debounced API save                                                 */
/* ------------------------------------------------------------------ */

let _saveTimer: ReturnType<typeof setTimeout> | null = null;
let _pendingUpdate: Partial<{
  visible_cards: Record<string, boolean>;
  card_order: string[];
}> = {};

function scheduleSave() {
  if (!_currentUserId) return;
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    if (Object.keys(_pendingUpdate).length > 0) {
      api.updatePreferences({ ..._pendingUpdate }).catch(() => {});
      _pendingUpdate = {};
    }
  }, 500);
}

/* ------------------------------------------------------------------ */
/*  Zustand store                                                      */
/* ------------------------------------------------------------------ */

const defaultVisible: Record<DriverCardId, boolean> = Object.fromEntries(
  ALL_DRIVER_CARDS.map((c) => [c.id, true])
) as Record<DriverCardId, boolean>;

const loaded = loadLocalConfig(null);

export const useDriverConfig = create<DriverConfig>((set, get) => ({
  selectedCircuitId: loaded.selectedCircuitId ?? null,
  selectedKartNumber: loaded.selectedKartNumber ?? null,
  visibleCards: { ...defaultVisible, ...loaded.visibleCards },
  cardOrder: loaded.cardOrder ?? DEFAULT_CARD_ORDER,

  setCircuitId: (id) => {
    set({ selectedCircuitId: id });
    saveLocalConfig(_currentUserId, get());
    // Note: selectedCircuitId is not in DB preferences (comes from race session config)
  },

  setKartNumber: (kart) => {
    set({ selectedKartNumber: kart });
    saveLocalConfig(_currentUserId, get());
    // Note: selectedKartNumber is not in DB preferences (comes from race session config)
  },

  setCardVisible: (card, visible) => {
    const visibleCards = { ...get().visibleCards, [card]: visible };
    set({ visibleCards });
    saveLocalConfig(_currentUserId, get());
    _pendingUpdate.visible_cards = visibleCards;
    scheduleSave();
    broadcastDriverConfig({ visibleCards, cardOrder: get().cardOrder });
  },

  setCardOrder: (order) => {
    set({ cardOrder: order });
    saveLocalConfig(_currentUserId, get());
    _pendingUpdate.card_order = order;
    scheduleSave();
    broadcastDriverConfig({ visibleCards: get().visibleCards, cardOrder: order });
  },

  applyPreset: (visibleCards, cardOrder) => {
    set({ visibleCards, cardOrder });
    saveLocalConfig(_currentUserId, get());
    _pendingUpdate.visible_cards = visibleCards;
    _pendingUpdate.card_order = cardOrder;
    scheduleSave();
    broadcastDriverConfig({ visibleCards, cardOrder });
  },

  hydrateForUser: (userId) => {
    _currentUserId = userId;
    // 1. Instant: load from localStorage
    const localCfg = loadLocalConfig(userId);
    set({
      selectedCircuitId: localCfg.selectedCircuitId ?? null,
      selectedKartNumber: localCfg.selectedKartNumber ?? null,
      visibleCards: { ...defaultVisible, ...localCfg.visibleCards },
      cardOrder: localCfg.cardOrder ?? DEFAULT_CARD_ORDER,
    });

    // 2. Async: fetch from API and override if available
    if (userId) {
      api.getPreferences().then((prefs) => {
        const hasDbData = (prefs.card_order?.length > 0) || (Object.keys(prefs.visible_cards || {}).length > 0);
        if (hasDbData) {
          // DB has config — use it
          const cardOrder = prefs.card_order?.length ? validateCardOrder(prefs.card_order as DriverCardId[]) : DEFAULT_CARD_ORDER;
          const visibleCards = { ...defaultVisible, ...prefs.visible_cards } as Record<DriverCardId, boolean>;
          set({ visibleCards, cardOrder });
          saveLocalConfig(userId, get());
        } else if (localCfg.visibleCards || localCfg.cardOrder) {
          // DB empty but localStorage has config — migrate to DB
          api.updatePreferences({
            visible_cards: localCfg.visibleCards ?? defaultVisible,
            card_order: localCfg.cardOrder ?? DEFAULT_CARD_ORDER,
          }).catch(() => {});
        }
      }).catch(() => {
        // API unavailable — localStorage fallback already applied
      });
    }
  },
}));
