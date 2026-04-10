"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";

interface Circuit {
  id: number;
  name: string;
}

const PLAN_LABELS: Record<string, string> = {
  basic_monthly: "Basico Mensual",
  basic_annual: "Basico Anual",
  pro_monthly: "Pro Mensual",
  pro_annual: "Pro Anual",
  event: "Evento",
};

export function CircuitSelector({
  plan,
  onSelect,
  onCancel,
}: {
  plan: string;
  onSelect: (circuitId: number) => void;
  onCancel: () => void;
}) {
  const [circuits, setCircuits] = useState<Circuit[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api
      .getCheckoutCircuits()
      .then((data) => setCircuits(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleContinue = () => {
    if (selected === null) return;
    setSubmitting(true);
    onSelect(selected);
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-0 mb-2">
            <span className="text-4xl font-bold text-white">BB</span>
            <span className="text-4xl font-bold text-accent">N</span>
          </div>
          <h1 className="text-xl font-bold text-white mt-2">
            Selecciona tu circuito
          </h1>
          <p className="text-neutral-400 text-sm mt-2">
            Plan: <span className="text-accent font-medium">{PLAN_LABELS[plan] || plan}</span>
          </p>
        </div>

        <div className="bg-surface rounded-2xl p-5 sm:p-8 border border-border">
          {loading ? (
            <div className="flex justify-center py-8">
              <span className="text-neutral-400 animate-pulse">Cargando circuitos...</span>
            </div>
          ) : circuits.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-neutral-400">No hay circuitos disponibles</p>
            </div>
          ) : (
            <div className="space-y-2">
              {circuits.map((circuit) => (
                <button
                  key={circuit.id}
                  onClick={() => setSelected(circuit.id)}
                  className={`w-full text-left px-4 py-3 rounded-lg border transition-all ${
                    selected === circuit.id
                      ? "border-accent bg-accent/10 text-white"
                      : "border-border bg-black text-neutral-300 hover:border-neutral-600"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                        selected === circuit.id
                          ? "border-accent"
                          : "border-neutral-600"
                      }`}
                    >
                      {selected === circuit.id && (
                        <div className="w-2 h-2 rounded-full bg-accent" />
                      )}
                    </div>
                    <span className="font-medium">{circuit.name}</span>
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="mt-6 space-y-3">
            <button
              onClick={handleContinue}
              disabled={selected === null || submitting}
              className="w-full bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-black font-semibold py-3 rounded-lg transition-colors"
            >
              {submitting ? "Redirigiendo a pago..." : "Continuar al pago"}
            </button>

            <button
              onClick={onCancel}
              className="w-full text-neutral-400 hover:text-white text-sm py-2 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
