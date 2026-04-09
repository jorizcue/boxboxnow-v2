"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { useDriverConfig, ALL_DRIVER_CARDS, type DriverCardId } from "@/hooks/useDriverConfig";

interface Circuit {
  id: number;
  name: string;
  finish_lat1: number | null;
  finish_lon1: number | null;
  finish_lat2: number | null;
  finish_lon2: number | null;
}

export function DriverConfigPanel({ onClose }: { onClose: () => void }) {
  const config = useDriverConfig();
  const [circuits, setCircuits] = useState<Circuit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getMyCircuits()
      .then((data: Circuit[]) => setCircuits(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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

      {/* Card visibility */}
      <div className="space-y-1">
        <label className="text-[10px] text-neutral-400 uppercase tracking-wider">Tarjetas visibles</label>
        <div className="grid grid-cols-2 gap-1">
          {ALL_DRIVER_CARDS.map((card) => (
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
    </div>
  );
}
