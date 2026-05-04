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
  | "pitWindow"
  | "pitCount"
  | "currentPit"
  // Sector telemetry — only meaningful on circuits whose Apex grid
  // declares `s1|s2|s3` data-type columns. The cards self-handle the
  // "no sector data" state with a "--" placeholder, so they're safe
  // to leave enabled on circuits without sectors.
  | "deltaBestS1"
  | "deltaBestS2"
  | "deltaBestS3"
  | "theoreticalBestLap"
  | "deltaSectors"  // S1/S2/S3 deltas combined into one card, 3 lines
  // Raw Apex live timing — distinct from gapAhead/gapBehind (which
  // derive from the adjusted classification) and from position
  // (avg-pace) / realPos (adjusted). These surface the values
  // straight from Apex's `data-type="int"` and `data-type="rk"`.
  | "intervalAhead"
  | "intervalBehind"
  | "apexPosition";

export type DriverCardGroup = "race" | "box" | "gps";

export const ALL_DRIVER_CARDS: {
  id: DriverCardId;
  label: string;
  requiresGps: boolean;
  group: DriverCardGroup;
}[] = [
  // --- Race group (alphabetical by label) ---
  { id: "gapAhead", label: "Gap kart delante", requiresGps: false, group: "race" },
  { id: "gapBehind", label: "Gap kart detrás", requiresGps: false, group: "race" },
  { id: "lastLap", label: "Última vuelta", requiresGps: false, group: "race" },
  { id: "avgFutureStint", label: "Media stint futuro", requiresGps: false, group: "race" },
  { id: "best3", label: "Mejor 3 (3V)", requiresGps: false, group: "race" },
  { id: "bestStintLap", label: "Mejor vuelta stint", requiresGps: false, group: "race" },
  { id: "realPos", label: "Posición (clasif. real)", requiresGps: false, group: "race" },
  { id: "position", label: "Posición (tiempos medios)", requiresGps: false, group: "race" },
  { id: "raceTimer", label: "Tiempo de carrera", requiresGps: false, group: "race" },
  { id: "currentLapTime", label: "Vuelta actual (tiempo real)", requiresGps: true, group: "race" },
  { id: "avgLap20", label: "Vuelta media (20v)", requiresGps: false, group: "race" },
  { id: "lapsToMaxStint", label: "Vueltas hasta stint máximo", requiresGps: false, group: "race" },
  // Sector cards live in the Race group — pilots think of sector
  // deltas as race telemetry, not a separate device feature. They
  // appear "--" on circuits without S1/S2/S3 columns.
  { id: "deltaBestS1", label: "Δ Mejor S1", requiresGps: false, group: "race" },
  { id: "deltaBestS2", label: "Δ Mejor S2", requiresGps: false, group: "race" },
  { id: "deltaBestS3", label: "Δ Mejor S3", requiresGps: false, group: "race" },
  { id: "theoreticalBestLap", label: "Vuelta teórica", requiresGps: false, group: "race" },
  { id: "deltaSectors", label: "Δ Sectores", requiresGps: false, group: "race" },
  // Raw Apex live timing cards — distinct from gapAhead/gapBehind
  // (adjusted classification) and from position/realPos (avg pace /
  // adjusted). Mirrors what the pilot would see on the Apex live
  // timing screen, no client-side recomputation.
  { id: "intervalAhead", label: "Intervalo kart delantero", requiresGps: false, group: "race" },
  { id: "intervalBehind", label: "Intervalo kart trasero", requiresGps: false, group: "race" },
  { id: "apexPosition", label: "Posición Apex", requiresGps: false, group: "race" },
  // --- BOX group (alphabetical by label) ---
  { id: "currentPit", label: "Pit en curso", requiresGps: false, group: "box" },
  { id: "pitCount", label: "PITS (realizados / mínimos)", requiresGps: false, group: "box" },
  { id: "boxScore", label: "Puntuación Box", requiresGps: false, group: "box" },
  { id: "pitWindow", label: "Ventana de pit (open/closed)", requiresGps: false, group: "box" },
  // --- GPS group (alphabetical by label) ---
  { id: "deltaBestLap", label: "Delta vs Best Lap (GPS)", requiresGps: true, group: "gps" },
  { id: "gpsLapDelta", label: "Delta vuelta anterior GPS", requiresGps: true, group: "gps" },
  { id: "gForceRadar", label: "G-Force (diana)", requiresGps: true, group: "gps" },
  { id: "gpsGForce", label: "G-Force (números)", requiresGps: true, group: "gps" },
  { id: "gpsSpeed", label: "Velocidad GPS", requiresGps: true, group: "gps" },
];

export const DRIVER_CARD_GROUPS: { id: DriverCardGroup; label: string }[] = [
  { id: "race", label: "Carrera" },
  { id: "box", label: "BOX" },
  { id: "gps", label: "GPS" },
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
    // Stale presets (saved before newer cards existed) don't carry
    // their ids in cardOrder. validateCardOrder appends any missing
    // DEFAULT_CARD_ORDER ids so the new cards still render after a
    // preset apply — and we backfill `visibleCards` with the
    // defaultVisible value for entries the preset didn't include.
    const fixedOrder = validateCardOrder(cardOrder);
    const fixedVisible = { ...defaultVisible, ...visibleCards };
    set({ visibleCards: fixedVisible, cardOrder: fixedOrder });
    saveLocalConfig(_currentUserId, get());
    _pendingUpdate.visible_cards = fixedVisible;
    _pendingUpdate.card_order = fixedOrder;
    scheduleSave();
    broadcastDriverConfig({ visibleCards: fixedVisible, cardOrder: fixedOrder });
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
