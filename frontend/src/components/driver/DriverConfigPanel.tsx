"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { useDriverConfig, ALL_DRIVER_CARDS, DEFAULT_CARD_ORDER, DRIVER_CARD_GROUPS, type DriverCardId, type DriverCardGroup } from "@/hooks/useDriverConfig";
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

export function DriverConfigPanel({ onClose }: { onClose: () => void }) {
  const config = useDriverConfig();
  const { user } = useAuth();
  const userTabs = user?.tab_access ?? [];
  const canBox = user?.is_admin || userTabs.includes("app-config-box");
  const [circuits, setCircuits] = useState<Circuit[]>([]);
  const [loading, setLoading] = useState(true);
  const [presets, setPresets] = useState<Preset[]>([]);

  useEffect(() => {
    api.getMyCircuits()
      .then((data: Circuit[]) => setCircuits(data))
      .catch(() => {})
      .finally(() => setLoading(false));
    api.getPresets().then(setPresets).catch(() => {});
  }, []);

  const handleApplyPreset = (presetId: string) => {
    const preset = presets.find((p) => p.id === Number(presetId));
    if (!preset) return;
    const allIds = ALL_DRIVER_CARDS.map((c) => c.id);
    const defaultVis = Object.fromEntries(allIds.map((c) => [c, true]));
    const visibleCards = { ...defaultVis, ...preset.visible_cards } as Record<DriverCardId, boolean>;
    const cardOrder = preset.card_order.length
      ? (preset.card_order.filter((c) => allIds.includes(c as DriverCardId)) as DriverCardId[])
          .concat(allIds.filter((c) => !preset.card_order.includes(c)))
      : DEFAULT_CARD_ORDER;
    config.applyPreset(visibleCards, cardOrder);
  };

  return (
    <div className="bg-neutral-900/98 border-b border-border/40 px-3 py-3 space-y-3 text-xs max-h-[70vh] overflow-y-auto">
      <div className="flex items-center justify-between">
        <span className="font-bold text-accent uppercase tracking-wider text-[10px]">Configuración Piloto</span>
        <button onClick={onClose} className="text-neutral-500 hover:text-white p-0.5">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Preset quick selector */}
      {presets.length > 0 && (
        <div className="space-y-1">
          <label className="text-[10px] text-neutral-400 uppercase tracking-wider">Plantilla</label>
          <select
            value=""
            onChange={(e) => { if (e.target.value) handleApplyPreset(e.target.value); }}
            className="w-full bg-black border border-border rounded-md px-2 py-1.5 text-xs text-white"
          >
            <option value="">Aplicar plantilla...</option>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Circuit selector */}
      <div className="space-y-1">
        <label className="text-[10px] text-neutral-400 uppercase tracking-wider">Circuito (GPS finish line)</label>
        <select
          value={config.selectedCircuitId ?? ""}
          onChange={(e) => config.setCircuitId(e.target.value ? Number(e.target.value) : null)}
          className="w-full bg-black border border-border rounded-md px-2 py-1.5 text-xs text-white"
        >
          <option value="">Automático (sesión activa)</option>
          {circuits.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} {c.finish_lat1 ? "📍" : ""}
            </option>
          ))}
        </select>
        {loading && <span className="text-[10px] text-neutral-500">Cargando circuitos...</span>}
      </div>

      {/* Kart number */}
      <div className="space-y-1">
        <label className="text-[10px] text-neutral-400 uppercase tracking-wider">Número de Kart</label>
        <input
          type="number"
          min={0}
          max={999}
          value={config.selectedKartNumber ?? ""}
          onChange={(e) => config.setKartNumber(e.target.value ? Number(e.target.value) : null)}
          placeholder="Automático (sesión activa)"
          className="w-full bg-black border border-border rounded-md px-2 py-1.5 text-xs text-white"
        />
      </div>

      {/* Card visibility — grouped by category */}
      <div className="space-y-2">
        <label className="text-[10px] text-neutral-400 uppercase tracking-wider">Tarjetas visibles</label>
        {DRIVER_CARD_GROUPS.map((group) => {
          if (group.id === "box" && !canBox) return null;
          // Filter the catalog by the user's plan-allowed cards. If the
          // backend didn't provide a list (older clients / trial users
          // / admins), `allowed_cards` is empty/undefined and we fall
          // back to the full catalog so we don't accidentally strip
          // the editor down to nothing.
          const allowed = user?.allowed_cards;
          const allowedSet = allowed && allowed.length > 0 ? new Set(allowed) : null;
          const groupCards = ALL_DRIVER_CARDS
            .filter((c) => c.group === group.id)
            .filter((c) => !allowedSet || allowedSet.has(c.id))
            .sort((a, b) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' }));
          if (groupCards.length === 0) return null;
          return (
            <div key={group.id} className="space-y-1">
              <div className="text-[9px] font-bold uppercase tracking-widest text-accent/80 border-b border-border/30 pb-0.5">
                {group.label}
              </div>
              <div className="grid grid-cols-2 gap-1">
                {groupCards.map((card) => (
                  <label
                    key={card.id}
                    className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-white/5 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={config.visibleCards[card.id] ?? true}
                      onChange={(e) => config.setCardVisible(card.id, e.target.checked)}
                      className="w-3 h-3 rounded border-neutral-600 accent-accent"
                    />
                    <span className={`text-[10px] ${config.visibleCards[card.id] ? "text-neutral-200" : "text-neutral-500"}`}>
                      {card.label}
                      {card.requiresGps && (
                        <span className="ml-1 text-cyan-600 text-[8px]">GPS</span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
