"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "@/lib/api";
import { useDriverConfig, ALL_DRIVER_CARDS, DEFAULT_CARD_ORDER, DRIVER_CARD_GROUPS, type DriverCardId } from "@/hooks/useDriverConfig";
import { useAuth } from "@/hooks/useAuth";

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
}

/**
 * Full-page driver configuration tab.
 * Shows circuit selector, kart number, and card visibility/order management.
 */
export function DriverConfigTab() {
  const config = useDriverConfig();
  const { user } = useAuth();
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
      setPresets((prev) => [...prev, created]);
      setPresetName("");
      setShowSaveInput(false);
    } catch (e: any) {
      const msg = e?.message || "Error al guardar";
      setPresetError(msg.includes("409") ? "Ya existe una plantilla con ese nombre" : msg.includes("400") ? "Máximo 10 plantillas" : msg);
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
  };

  const handleDeletePreset = async (id: number) => {
    try {
      await api.deletePreset(id);
      setPresets((prev) => prev.filter((p) => p.id !== id));
    } catch {}
  };

  const visibleGroups = DRIVER_CARD_GROUPS.filter((g) => g.id !== "box" || canBox);
  const canSaveMore = presets.length < 10;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-lg font-bold text-white">Configuracion Vista Piloto</h2>
        <p className="text-xs text-neutral-500 mt-1">Personaliza la vista del piloto: circuito GPS, numero de kart y tarjetas visibles.</p>
      </div>

      {/* Presets */}
      <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
        <h3 className="text-xs font-bold text-accent uppercase tracking-wider">Plantillas</h3>
        <p className="text-[11px] text-neutral-500">Guarda la configuracion actual como plantilla para reutilizarla mas tarde.</p>

        {presets.length > 0 && (
          <div className="space-y-1.5">
            {presets.map((preset) => (
              <div
                key={preset.id}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-black/40 border border-border hover:border-neutral-600 group transition-colors"
              >
                <button
                  onClick={() => handleApplyPreset(preset)}
                  className="flex-1 text-left text-sm text-neutral-200 hover:text-white transition-colors"
                >
                  {preset.name}
                </button>
                <span className="text-[10px] text-neutral-600">
                  {Object.values(preset.visible_cards).filter(Boolean).length} tarjetas
                </span>
                <button
                  onClick={() => handleDeletePreset(preset.id)}
                  className="text-neutral-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all p-0.5"
                  title="Eliminar plantilla"
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
          <p className="text-[11px] text-neutral-600 italic">No tienes plantillas guardadas.</p>
        )}

        {showSaveInput ? (
          <div className="flex items-center gap-2">
            <input
              ref={saveInputRef}
              type="text"
              value={presetName}
              onChange={(e) => { setPresetName(e.target.value); setPresetError(null); }}
              onKeyDown={(e) => e.key === "Enter" && handleSavePreset()}
              placeholder="Nombre de la plantilla"
              maxLength={50}
              className="flex-1 bg-black border border-border rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 focus:border-accent focus:outline-none"
            />
            <button
              onClick={handleSavePreset}
              disabled={!presetName.trim() || presetSaving}
              className="px-3 py-2 rounded-lg bg-accent text-black text-xs font-bold hover:bg-accent/90 disabled:opacity-40 transition-colors"
            >
              {presetSaving ? "..." : "Guardar"}
            </button>
            <button
              onClick={() => { setShowSaveInput(false); setPresetName(""); setPresetError(null); }}
              className="px-2 py-2 text-neutral-500 hover:text-white text-xs"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowSaveInput(true)}
            disabled={!canSaveMore}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-neutral-700 hover:border-accent text-xs text-neutral-400 hover:text-accent disabled:opacity-40 disabled:hover:border-neutral-700 disabled:hover:text-neutral-400 transition-colors"
            title={canSaveMore ? "Guardar configuracion actual como plantilla" : "Máximo 10 plantillas"}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Guardar como plantilla
          </button>
        )}

        {presetError && (
          <p className="text-[11px] text-red-400">{presetError}</p>
        )}
      </div>

      {/* Circuit selector */}
      <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
        <h3 className="text-xs font-bold text-accent uppercase tracking-wider">Circuito GPS</h3>
        <p className="text-[11px] text-neutral-500">Selecciona el circuito para la linea de meta GPS. Si lo dejas en automatico, usara la sesion activa.</p>
        <select
          value={config.selectedCircuitId ?? ""}
          onChange={(e) => config.setCircuitId(e.target.value ? Number(e.target.value) : null)}
          className="w-full bg-black border border-border rounded-lg px-3 py-2 text-sm text-white focus:border-accent focus:outline-none"
        >
          <option value="">Automatico (sesion activa)</option>
          {circuits.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} {c.finish_lat1 ? " - GPS configurado" : ""}
            </option>
          ))}
        </select>
        {loading && <span className="text-[10px] text-neutral-500">Cargando circuitos...</span>}
      </div>

      {/* Kart number */}
      <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
        <h3 className="text-xs font-bold text-accent uppercase tracking-wider">Numero de Kart</h3>
        <p className="text-[11px] text-neutral-500">Sobrescribe el numero de kart. Si lo dejas vacio, usara el de la sesion activa.</p>
        <input
          type="number"
          min={0}
          max={999}
          value={config.selectedKartNumber ?? ""}
          onChange={(e) => config.setKartNumber(e.target.value ? Number(e.target.value) : null)}
          placeholder="Automatico (sesion activa)"
          className="w-full bg-black border border-border rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 focus:border-accent focus:outline-none"
        />
      </div>

      {/* Card visibility */}
      <div className="bg-surface border border-border rounded-xl p-4 space-y-4">
        <h3 className="text-xs font-bold text-accent uppercase tracking-wider">Tarjetas visibles</h3>
        <p className="text-[11px] text-neutral-500">Selecciona las tarjetas que quieres ver en la vista del piloto.</p>

        {visibleGroups.map((group) => {
          const groupCards = ALL_DRIVER_CARDS.filter((c) => c.group === group.id);
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
                {group.label}
                {isGps && <span className="text-[9px] text-cyan-700 normal-case tracking-normal font-normal">(requieren RaceBox o GPS del movil)</span>}
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
                      {card.label}
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
        <h3 className="text-xs font-bold text-accent uppercase tracking-wider">Preview y orden</h3>
        <p className="text-[11px] text-neutral-500">Arrastra las tarjetas para reordenarlas. La vista refleja como se vera en la pantalla del piloto.</p>

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
          <span className="text-[8px] text-neutral-600 font-mono">K42 · Vista Piloto</span>
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
                  {card.label}
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
            <span className="font-semibold text-neutral-500">{hiddenCards.length} tarjeta{hiddenCards.length !== 1 ? "s" : ""} oculta{hiddenCards.length !== 1 ? "s" : ""}:</span>{" "}
            {hiddenCards.map((id) => ALL_DRIVER_CARDS.find((c) => c.id === id)?.label).filter(Boolean).join(", ")}
          </p>
        </div>
      )}
    </div>
  );
}
