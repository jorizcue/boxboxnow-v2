"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "@/lib/api";
import { trackAction } from "@/lib/tracker";
import { useDriverConfig, ALL_DRIVER_CARDS, DEFAULT_CARD_ORDER, DRIVER_CARD_GROUPS, type DriverCardId } from "@/hooks/useDriverConfig";
import { useAuth } from "@/hooks/useAuth";
import { useT, useLangStore } from "@/lib/i18n";

interface Circuit {
  id: number;
  name: string;
  finish_lat1: number | null;
  finish_lon1: number | null;
  finish_lat2: number | null;
  finish_lon2: number | null;
}

interface Preset {
  id: number;
  name: string;
  visible_cards: Record<string, boolean>;
  card_order: string[];
  is_default: boolean;
}

/**
 * Full-page driver configuration tab.
 * Shows circuit selector, kart number, and card visibility/order management.
 */
export function DriverConfigTab() {
  const config = useDriverConfig();
  const { user } = useAuth();
  const t = useT();
  const lang = useLangStore((s) => s.lang);
  const userTabs = user?.tab_access ?? [];
  const canBox = user?.is_admin || userTabs.includes("app-config-box");
  const [circuits, setCircuits] = useState<Circuit[]>([]);
  const [loading, setLoading] = useState(true);

  // Preset state
  const [presets, setPresets] = useState<Preset[]>([]);
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [presetSaving, setPresetSaving] = useState(false);
  const [presetError, setPresetError] = useState<string | null>(null);
  const saveInputRef = useRef<HTMLInputElement>(null);

  // Hydrate driver config for current user
  useEffect(() => {
    config.hydrateForUser(user?.id ?? null);
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    api.getMyCircuits()
      .then((data: Circuit[]) => setCircuits(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Load presets
  useEffect(() => {
    api.getPresets().then(setPresets).catch(() => {});
  }, []);

  // Focus input when save form opens
  useEffect(() => {
    if (showSaveInput) saveInputRef.current?.focus();
  }, [showSaveInput]);

  const handleSavePreset = async () => {
    const name = presetName.trim();
    if (!name) return;
    setPresetSaving(true);
    setPresetError(null);
    try {
      const created = await api.createPreset({
        name,
        visible_cards: config.visibleCards,
        card_order: config.cardOrder,
      });
      trackAction("preset.create", { name_len: name.length });
      setPresets((prev) => [...prev, created]);
      setPresetName("");
      setShowSaveInput(false);
    } catch (e: any) {
      const msg = e?.message || t("driverConfig.tab.presetError");
      setPresetError(
        msg.includes("409") ? t("driverConfig.tab.presetExists")
        : msg.includes("400") ? t("driverConfig.tab.presetMax")
        : msg,
      );
    } finally {
      setPresetSaving(false);
    }
  };

  const handleApplyPreset = (preset: Preset) => {
    const allIds = ALL_DRIVER_CARDS.map((c) => c.id);
    const defaultVis = Object.fromEntries(allIds.map((c) => [c, true]));
    const visibleCards = { ...defaultVis, ...preset.visible_cards } as Record<DriverCardId, boolean>;
    const cardOrder = preset.card_order.length
      ? (preset.card_order.filter((c) => allIds.includes(c as DriverCardId)) as DriverCardId[])
          .concat(allIds.filter((c) => !preset.card_order.includes(c)))
      : DEFAULT_CARD_ORDER;
    config.applyPreset(visibleCards, cardOrder);
    trackAction("preset.apply", { preset_id: preset.id });
  };

  const handleDeletePreset = async (id: number) => {
    try {
      await api.deletePreset(id);
      trackAction("preset.delete", { preset_id: id });
      setPresets((prev) => prev.filter((p) => p.id !== id));
    } catch {}
  };

  // Toggle default preset. Only one preset can be default at a time; the
  // backend enforces that rule, so after the update we just refresh the list
  // (the sidebar/driver view on mobile will live-sync via WebSocket).
  const handleToggleDefault = async (preset: Preset) => {
    try {
      const want = !preset.is_default;
      await api.updatePreset(preset.id, { is_default: want });
      setPresets((prev) =>
        prev.map((p) => ({
          ...p,
          is_default: p.id === preset.id ? want : want ? false : p.is_default,
        }))
      );
    } catch {}
  };

  const visibleGroups = DRIVER_CARD_GROUPS.filter((g) => g.id !== "box" || canBox);
  const canSaveMore = presets.length < 10;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-lg font-bold text-white">{t("driverConfig.tab.title")}</h2>
        <p className="text-xs text-neutral-500 mt-1">{t("driverConfig.tab.subtitle")}</p>
      </div>

      {/* Presets */}
      <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
        <h3 className="text-xs font-bold text-accent uppercase tracking-wider">{t("driverConfig.tab.presets")}</h3>
        <p className="text-[11px] text-neutral-500">{t("driverConfig.tab.presetsHint")}</p>

        {presets.length > 0 && (
          <div className="space-y-1.5">
            {presets.map((preset) => (
              <div
                key={preset.id}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg bg-black/40 border group transition-colors ${preset.is_default ? "border-accent/60" : "border-border hover:border-neutral-600"}`}
              >
                <button
                  onClick={() => handleToggleDefault(preset)}
                  className={`p-0.5 transition-colors ${preset.is_default ? "text-accent" : "text-neutral-600 hover:text-accent/80"}`}
                  title={preset.is_default ? t("driverConfig.tab.presetTitleDefault") : t("driverConfig.tab.presetTitleSetDefault")}
                >
                  <svg className="w-4 h-4" fill={preset.is_default ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                  </svg>
                </button>
                <button
                  onClick={() => handleApplyPreset(preset)}
                  className="flex-1 text-left text-sm text-neutral-200 hover:text-white transition-colors"
                >
                  {preset.name}
                  {preset.is_default && (
                    <span className="ml-2 text-[9px] uppercase tracking-wider text-accent">{t("driverConfig.tab.presetDefault")}</span>
                  )}
                </button>
                <span className="text-[10px] text-neutral-600">
                  {t("driverConfig.tab.presetCards", { n: Object.values(preset.visible_cards).filter(Boolean).length })}
                </span>
                <button
                  onClick={() => handleDeletePreset(preset.id)}
                  className="text-neutral-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all p-0.5"
                  title={t("driverConfig.tab.presetDelete")}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {presets.length === 0 && !showSaveInput && (
          <p className="text-[11px] text-neutral-600 italic">{t("driverConfig.tab.presetEmpty")}</p>
        )}

        {showSaveInput ? (
          <div className="flex items-center gap-2">
            <input
              ref={saveInputRef}
              type="text"
              value={presetName}
              onChange={(e) => { setPresetName(e.target.value); setPresetError(null); }}
              onKeyDown={(e) => e.key === "Enter" && handleSavePreset()}
              placeholder={t("driverConfig.tab.presetNamePlaceholder")}
              maxLength={50}
              className="flex-1 bg-black border border-border rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 focus:border-accent focus:outline-none"
            />
            <button
              onClick={handleSavePreset}
              disabled={!presetName.trim() || presetSaving}
              className="px-3 py-2 rounded-lg bg-accent text-black text-xs font-bold hover:bg-accent/90 disabled:opacity-40 transition-colors"
            >
              {presetSaving ? "..." : t("driverConfig.tab.presetSave")}
            </button>
            <button
              onClick={() => { setShowSaveInput(false); setPresetName(""); setPresetError(null); }}
              className="px-2 py-2 text-neutral-500 hover:text-white text-xs"
            >
              {t("driverConfig.tab.presetCancel")}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowSaveInput(true)}
            disabled={!canSaveMore}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-neutral-700 hover:border-accent text-xs text-neutral-400 hover:text-accent disabled:opacity-40 disabled:hover:border-neutral-700 disabled:hover:text-neutral-400 transition-colors"
            title={canSaveMore ? t("driverConfig.tab.presetSaveAsTitle") : t("driverConfig.tab.presetMax")}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            {t("driverConfig.tab.presetSaveAs")}
          </button>
        )}

        {presetError && (
          <p className="text-[11px] text-red-400">{presetError}</p>
        )}
      </div>

      {/*
        Circuit selector and Kart number were intentionally removed from
        the preset config UI per product request — the driver view always
        resolves circuit + kart from the active session, so exposing these
        per-preset overrides only confused users. The underlying config
        state (setCircuitId / setKartNumber) is kept in the hook in case
        we reintroduce it elsewhere, but it's no longer user-editable here.
      */}

      {/* Card visibility */}
      <div className="bg-surface border border-border rounded-xl p-4 space-y-4">
        <h3 className="text-xs font-bold text-accent uppercase tracking-wider">{t("driverConfig.panel.visibleCards")}</h3>
        <p className="text-[11px] text-neutral-500">{t("driverConfig.tab.cardsHint")}</p>

        {visibleGroups.map((group) => {
          // Plan-aware filter: only show cards in `user.allowed_cards`.
          // Empty / missing list = fall back to the full catalog (older
          // backends, admins, trial users without a plan match).
          const allowed = user?.allowed_cards;
          const allowedSet = allowed && allowed.length > 0 ? new Set(allowed) : null;
          // Resolve the localized label up-front so the alphabetical sort
          // matches what the user sees (German "Ø Runde" vs Spanish
          // "Vuelta media" → totally different order).
          const groupCards = ALL_DRIVER_CARDS
            .filter((c) => c.group === group.id)
            .filter((c) => !allowedSet || allowedSet.has(c.id))
            .map((c) => ({ ...c, _localLabel: t(c.labelKey) }))
            .sort((a, b) => a._localLabel.localeCompare(b._localLabel, lang, { sensitivity: 'base' }));
          if (groupCards.length === 0) return null;
          const isGps = group.id === "gps";
          return (
            <div key={group.id} className="space-y-3">
              <h4 className={`text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1.5 ${isGps ? "text-cyan-500" : "text-accent"}`}>
                {isGps && (
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                  </svg>
                )}
                {t(group.labelKey)}
                {isGps && <span className="text-[9px] text-cyan-700 normal-case tracking-normal font-normal">{t("driverConfig.tab.gpsRequirement")}</span>}
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {groupCards.map((card) => (
                  <label
                    key={card.id}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg bg-black/40 border cursor-pointer transition-colors ${isGps ? "border-cyan-900/30 hover:border-cyan-700/40" : "border-border hover:border-neutral-600"}`}
                  >
                    <input
                      type="checkbox"
                      checked={config.visibleCards[card.id] ?? true}
                      onChange={(e) => config.setCardVisible(card.id, e.target.checked)}
                      className={`w-3.5 h-3.5 rounded ${isGps ? "accent-cyan-500" : "accent-accent"}`}
                    />
                    <span className={`text-xs ${config.visibleCards[card.id] ? "text-neutral-200" : "text-neutral-500"}`}>
                      {card._localLabel}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Visual preview with drag-and-drop */}
      <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
        <h3 className="text-xs font-bold text-accent uppercase tracking-wider">{t("driverConfig.tab.preview")}</h3>
        <p className="text-[11px] text-neutral-500">{t("driverConfig.tab.previewHint")}</p>

        <CardOrderPreview config={config} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Static accent colors per card (default/neutral variants)           */
/* ------------------------------------------------------------------ */

const CARD_ACCENTS: Record<DriverCardId, string> = {
  raceTimer: "from-neutral-500/20 to-neutral-500/5 border-neutral-500/30",
  currentLapTime: "from-blue-500/20 to-blue-500/5 border-blue-500/30",
  lastLap: "from-neutral-500/20 to-neutral-500/5 border-neutral-500/30",
  deltaBestLap: "from-violet-500/20 to-violet-500/5 border-violet-500/30",
  gForceRadar: "from-neutral-500/10 to-neutral-500/5 border-neutral-600/30",
  position: "from-purple-500/20 to-purple-500/5 border-purple-500/30",
  realPos: "from-accent/20 to-accent/5 border-accent/30",
  gapAhead: "from-red-500/20 to-red-500/5 border-red-500/30",
  gapBehind: "from-green-500/20 to-green-500/5 border-green-500/30",
  avgLap20: "from-indigo-500/20 to-indigo-500/5 border-indigo-500/30",
  best3: "from-amber-500/20 to-amber-500/5 border-amber-500/30",
  avgFutureStint: "from-teal-500/20 to-teal-500/5 border-teal-500/30",
  boxScore: "from-yellow-500/20 to-yellow-500/5 border-yellow-500/30",
  bestStintLap: "from-purple-500/20 to-purple-500/5 border-purple-500/30",
  gpsLapDelta: "from-cyan-500/20 to-cyan-500/5 border-cyan-500/30",
  gpsSpeed: "from-sky-500/20 to-sky-500/5 border-sky-500/30",
  gpsGForce: "from-emerald-500/20 to-emerald-500/5 border-emerald-500/30",
  lapsToMaxStint: "from-teal-500/20 to-teal-500/5 border-teal-500/30",
  pitWindow: "from-green-500/25 to-green-500/5 border-green-400/50",
  pitCount: "from-orange-500/25 to-orange-500/5 border-orange-400/50",
  currentPit: "from-cyan-500/25 to-cyan-500/5 border-cyan-400/50",
  deltaBestS1: "from-yellow-500/20 to-yellow-500/5 border-yellow-500/30",
  deltaBestS2: "from-yellow-500/20 to-yellow-500/5 border-yellow-500/30",
  deltaBestS3: "from-yellow-500/20 to-yellow-500/5 border-yellow-500/30",
  theoreticalBestLap: "from-pink-500/20 to-pink-500/5 border-pink-500/30",
  intervalAhead: "from-red-500/20 to-red-500/5 border-red-500/30",
  intervalBehind: "from-green-500/20 to-green-500/5 border-green-500/30",
  apexPosition: "from-purple-500/20 to-purple-500/5 border-purple-500/30",
  deltaSectors: "from-yellow-500/20 to-yellow-500/5 border-yellow-500/30",
  deltaCurrentS1: "from-yellow-500/20 to-yellow-500/5 border-yellow-500/30",
  deltaCurrentS2: "from-yellow-500/20 to-yellow-500/5 border-yellow-500/30",
  deltaCurrentS3: "from-yellow-500/20 to-yellow-500/5 border-yellow-500/30",
  deltaSectorsCurrent: "from-yellow-500/20 to-yellow-500/5 border-yellow-500/30",
};

const CARD_SAMPLE_VALUES: Record<DriverCardId, string> = {
  raceTimer: "1:23:45",
  currentLapTime: "0:42.318",
  lastLap: "1:02.456",
  deltaBestLap: "-0.32s",
  gForceRadar: "G",
  position: "P3/12",
  realPos: "P5/12",
  gapAhead: "-1.2s",
  gapBehind: "+0.8s",
  avgLap20: "1:03.120",
  best3: "1:01.890",
  avgFutureStint: "0:38:20",
  boxScore: "87",
  bestStintLap: "1:01.234",
  gpsLapDelta: "+0.15s",
  gpsSpeed: "94 km/h",
  gpsGForce: "1.2G",
  lapsToMaxStint: "5.2",
  pitWindow: "OPEN",
  pitCount: "2/4",
  currentPit: "0:45",
  deltaBestS1: "+0.21s",
  deltaBestS2: "-0.15s",
  deltaBestS3: "+0.08s",
  theoreticalBestLap: "1:01.67",
  intervalAhead: "0.968s",
  intervalBehind: "0.973s",
  apexPosition: "P4/12",
  deltaSectors: "S1 -0.04s",
  deltaCurrentS1: "+0.18s",
  deltaCurrentS2: "-0.09s",
  deltaCurrentS3: "+0.31s",
  deltaSectorsCurrent: "S1 +0.12s",
};

/* ------------------------------------------------------------------ */
/*  Card Order Preview (3-col grid with drag-and-drop)                 */
/* ------------------------------------------------------------------ */

interface CardOrderPreviewProps {
  config: {
    cardOrder: DriverCardId[];
    visibleCards: Record<DriverCardId, boolean>;
    setCardOrder: (order: DriverCardId[]) => void;
  };
}

function CardOrderPreview({ config }: CardOrderPreviewProps) {
  const t = useT();
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  // Touch drag state
  const touchDragIdx = useRef<number | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardRefs = useRef<Map<number, HTMLElement>>(new Map());
  const [touchDragging, setTouchDragging] = useState<number | null>(null);

  const visibleOrder = config.cardOrder.filter((id) => config.visibleCards[id] !== false);

  // --- HTML5 drag-and-drop (desktop) ---
  const onDragStart = useCallback((idx: number) => {
    setDragIdx(idx);
  }, []);

  const onDragEnter = useCallback((idx: number) => {
    setOverIdx(idx);
  }, []);

  const onDragEnd = useCallback(() => {
    if (dragIdx !== null && overIdx !== null && dragIdx !== overIdx) {
      const newOrder = [...config.cardOrder];
      // Map visible indices back to full order indices
      const fromCardId = visibleOrder[dragIdx];
      const toCardId = visibleOrder[overIdx];
      const fromFull = newOrder.indexOf(fromCardId);
      const toFull = newOrder.indexOf(toCardId);
      if (fromFull >= 0 && toFull >= 0) {
        const [moved] = newOrder.splice(fromFull, 1);
        newOrder.splice(toFull, 0, moved);
        config.setCardOrder(newOrder);
      }
    }
    setDragIdx(null);
    setOverIdx(null);
  }, [dragIdx, overIdx, config, visibleOrder]);

  // --- Touch drag-and-drop (mobile) ---
  const onTouchStart = useCallback((idx: number) => {
    longPressTimer.current = setTimeout(() => {
      touchDragIdx.current = idx;
      setTouchDragging(idx);
      if (navigator.vibrate) navigator.vibrate(30);
    }, 300);
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchDragIdx.current === null) {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
      return;
    }
    e.preventDefault();
    const touch = e.touches[0];
    const entries = Array.from(cardRefs.current.entries());
    for (const [idx, el] of entries) {
      const rect = el.getBoundingClientRect();
      if (
        touch.clientX >= rect.left &&
        touch.clientX <= rect.right &&
        touch.clientY >= rect.top &&
        touch.clientY <= rect.bottom &&
        idx !== touchDragIdx.current
      ) {
        const fromCardId = visibleOrder[touchDragIdx.current!];
        const toCardId = visibleOrder[idx];
        const newOrder = [...config.cardOrder];
        const fromFull = newOrder.indexOf(fromCardId);
        const toFull = newOrder.indexOf(toCardId);
        if (fromFull >= 0 && toFull >= 0) {
          const [moved] = newOrder.splice(fromFull, 1);
          newOrder.splice(toFull, 0, moved);
          config.setCardOrder(newOrder);
        }
        touchDragIdx.current = idx;
        break;
      }
    }
  }, [config, visibleOrder]);

  const onTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    touchDragIdx.current = null;
    setTouchDragging(null);
  }, []);

  const registerRef = useCallback((idx: number, el: HTMLElement | null) => {
    if (el) cardRefs.current.set(idx, el);
    else cardRefs.current.delete(idx);
  }, []);

  // Hidden cards listed below
  const hiddenCards = config.cardOrder.filter((id) => config.visibleCards[id] === false);

  return (
    <div className="space-y-3">
      {/* Simulated driver view frame */}
      <div className="bg-black rounded-xl border border-neutral-800 p-2 sm:p-3">
        {/* Mini header to mimic the driver view */}
        <div className="flex items-center justify-between mb-2 px-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-bold text-white">BB<span className="text-accent">N</span></span>
            <div className="w-1.5 h-1.5 rounded-full bg-accent" />
          </div>
          <span className="text-[8px] text-neutral-600 font-mono">K42 · {t("driverConfig.driverViewBadge")}</span>
        </div>

        {/* 3-column grid */}
        <div
          className="grid grid-cols-3 auto-rows-fr gap-1.5 sm:gap-2"
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {visibleOrder.map((cardId, idx) => {
            const card = ALL_DRIVER_CARDS.find((c) => c.id === cardId);
            if (!card) return null;
            const accent = CARD_ACCENTS[cardId];
            const isDragging = dragIdx === idx || touchDragging === idx;
            const isOver = overIdx === idx && dragIdx !== null && dragIdx !== idx;
            return (
              <div
                key={cardId}
                ref={(el) => registerRef(idx, el)}
                draggable
                onDragStart={() => onDragStart(idx)}
                onDragEnter={() => onDragEnter(idx)}
                onDragEnd={onDragEnd}
                onDragOver={(e) => e.preventDefault()}
                onTouchStart={() => onTouchStart(idx)}
                className={`
                  relative rounded-xl border bg-gradient-to-b ${accent}
                  flex flex-col items-center justify-center
                  p-2 sm:p-3 min-h-[60px] sm:min-h-[80px]
                  cursor-grab active:cursor-grabbing
                  select-none
                  ${isDragging ? "opacity-40 scale-95" : ""}
                  ${isOver ? "ring-2 ring-accent/50 scale-[1.02]" : ""}
                  transition-all duration-150
                `}
              >
                {/* Drag handle indicator */}
                <div className="absolute top-1 right-1.5 text-neutral-700 text-[9px]">⋮⋮</div>

                {/* Card label */}
                <span className="text-[7px] sm:text-[9px] text-neutral-500 uppercase tracking-widest mb-1 font-bold text-center leading-tight">
                  {t(card.labelKey)}
                </span>

                {/* Sample value */}
                <span className="text-sm sm:text-lg font-mono font-black text-white/70 leading-none">
                  {CARD_SAMPLE_VALUES[cardId]}
                </span>

                {/* GPS badge */}
                {card.requiresGps && (
                  <span className="absolute bottom-1 left-1.5 text-[7px] text-cyan-600 font-semibold">GPS</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Hidden cards info */}
      {hiddenCards.length > 0 && (
        <div className="px-1">
          <p className="text-[10px] text-neutral-600">
            <span className="font-semibold text-neutral-500">
              {t(hiddenCards.length === 1 ? "driverConfig.tab.hiddenCardsOne" : "driverConfig.tab.hiddenCardsMany", { n: hiddenCards.length })}
            </span>{" "}
            {hiddenCards.map((id) => {
              const card = ALL_DRIVER_CARDS.find((c) => c.id === id);
              return card ? t(card.labelKey) : null;
            }).filter(Boolean).join(", ")}
          </p>
        </div>
      )}
    </div>
  );
}
