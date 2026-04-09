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

/**
 * Full-page driver configuration tab.
 * Shows circuit selector, kart number, and card visibility/order management.
 */
export function DriverConfigTab() {
  const config = useDriverConfig();
  const [circuits, setCircuits] = useState<Circuit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getMyCircuits()
      .then((data: Circuit[]) => setCircuits(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const gpsCards = ALL_DRIVER_CARDS.filter((c) => c.requiresGps);
  const standardCards = ALL_DRIVER_CARDS.filter((c) => !c.requiresGps);

  const moveCard = (id: DriverCardId, direction: "up" | "down") => {
    const order = [...config.cardOrder];
    const idx = order.indexOf(id);
    if (idx < 0) return;
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= order.length) return;
    [order[idx], order[targetIdx]] = [order[targetIdx], order[idx]];
    config.setCardOrder(order);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-lg font-bold text-white">Configuracion Vista Piloto</h2>
        <p className="text-xs text-neutral-500 mt-1">Personaliza la vista del piloto: circuito GPS, numero de kart y tarjetas visibles.</p>
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

        <div className="space-y-3">
          <h4 className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Estandar</h4>
          <div className="grid grid-cols-2 gap-2">
            {standardCards.map((card) => (
              <label
                key={card.id}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-black/40 border border-border hover:border-neutral-600 cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  checked={config.visibleCards[card.id] ?? true}
                  onChange={(e) => config.setCardVisible(card.id, e.target.checked)}
                  className="w-3.5 h-3.5 rounded accent-accent"
                />
                <span className={`text-xs ${config.visibleCards[card.id] ? "text-neutral-200" : "text-neutral-500"}`}>
                  {card.label}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="text-[10px] font-semibold text-cyan-500 uppercase tracking-wider flex items-center gap-1.5">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
            </svg>
            GPS (requieren RaceBox o GPS del movil)
          </h4>
          <div className="grid grid-cols-2 gap-2">
            {gpsCards.map((card) => (
              <label
                key={card.id}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-black/40 border border-cyan-900/30 hover:border-cyan-700/40 cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  checked={config.visibleCards[card.id] ?? true}
                  onChange={(e) => config.setCardVisible(card.id, e.target.checked)}
                  className="w-3.5 h-3.5 rounded accent-cyan-500"
                />
                <span className={`text-xs ${config.visibleCards[card.id] ? "text-neutral-200" : "text-neutral-500"}`}>
                  {card.label}
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Card order */}
      <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
        <h3 className="text-xs font-bold text-accent uppercase tracking-wider">Orden de tarjetas</h3>
        <p className="text-[11px] text-neutral-500">Arrastra o usa las flechas para reordenar las tarjetas en la vista del piloto.</p>

        <div className="space-y-1">
          {config.cardOrder.map((cardId, idx) => {
            const card = ALL_DRIVER_CARDS.find((c) => c.id === cardId);
            if (!card) return null;
            const isVisible = config.visibleCards[cardId] ?? true;
            return (
              <div
                key={cardId}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                  isVisible
                    ? "bg-black/40 border-border text-neutral-200"
                    : "bg-black/20 border-border/50 text-neutral-600"
                }`}
              >
                <span className="text-neutral-600 text-xs font-mono w-5 text-right">{idx + 1}</span>
                <span className="flex-1 text-xs truncate">
                  {card.label}
                  {card.requiresGps && <span className="ml-1.5 text-cyan-600 text-[9px]">GPS</span>}
                  {!isVisible && <span className="ml-1.5 text-neutral-600 text-[9px]">(oculta)</span>}
                </span>
                <div className="flex gap-0.5">
                  <button
                    onClick={() => moveCard(cardId, "up")}
                    disabled={idx === 0}
                    className="p-1 rounded hover:bg-white/10 disabled:opacity-20 text-neutral-400 hover:text-white transition-colors"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                    </svg>
                  </button>
                  <button
                    onClick={() => moveCard(cardId, "down")}
                    disabled={idx === config.cardOrder.length - 1}
                    className="p-1 rounded hover:bg-white/10 disabled:opacity-20 text-neutral-400 hover:text-white transition-colors"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
