"use client";

import { useState, useEffect, useMemo } from "react";
import { api } from "@/lib/api";

interface Circuit {
  id: number;
  name: string;
  is_beta: boolean;
}

const PLAN_LABELS: Record<string, string> = {
  basic_monthly: "Basico Mensual",
  basic_annual: "Basico Anual",
  pro_monthly: "Pro Mensual",
  pro_annual: "Pro Anual",
  event: "Evento",
};

const DAY_NAMES = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sa", "Do"];
const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Mini calendar for picking 1-2 consecutive days */
function EventDatePicker({
  selectedDates,
  onSelect,
}: {
  selectedDates: Date[];
  onSelect: (dates: Date[]) => void;
}) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [viewYear, setViewYear] = useState(today.getFullYear());

  // Build calendar grid
  const calendarDays = useMemo(() => {
    const firstOfMonth = new Date(viewYear, viewMonth, 1);
    // Monday=0 based start
    let startDay = firstOfMonth.getDay() - 1;
    if (startDay < 0) startDay = 6;

    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const days: (Date | null)[] = [];

    // Leading blanks
    for (let i = 0; i < startDay; i++) days.push(null);
    // Days of month
    for (let d = 1; d <= daysInMonth; d++) days.push(new Date(viewYear, viewMonth, d));
    // Trailing blanks to fill last row
    while (days.length % 7 !== 0) days.push(null);

    return days;
  }, [viewMonth, viewYear]);

  const canPrev = viewYear > today.getFullYear() || (viewYear === today.getFullYear() && viewMonth > today.getMonth());

  const handlePrev = () => {
    if (!canPrev) return;
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  };

  const handleNext = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  };

  const handleDayClick = (day: Date) => {
    if (day < today) return; // Past day

    if (selectedDates.length === 0) {
      // First selection
      onSelect([day]);
      return;
    }

    if (selectedDates.length === 1) {
      const first = selectedDates[0];
      if (isSameDay(day, first)) {
        // Deselect
        onSelect([]);
        return;
      }
      // Check if consecutive
      const dayBefore = addDays(first, -1);
      const dayAfter = addDays(first, 1);
      if (isSameDay(day, dayBefore) && day >= today) {
        onSelect([day, first].sort((a, b) => a.getTime() - b.getTime()));
        return;
      }
      if (isSameDay(day, dayAfter)) {
        onSelect([first, day]);
        return;
      }
      // Not consecutive → replace
      onSelect([day]);
      return;
    }

    // Already 2 selected → click on selected deselects to 1, click elsewhere → start over
    if (selectedDates.some((s) => isSameDay(s, day))) {
      onSelect(selectedDates.filter((s) => !isSameDay(s, day)));
    } else {
      onSelect([day]);
    }
  };

  const isSelected = (day: Date) => selectedDates.some((s) => isSameDay(s, day));
  const isPast = (day: Date) => day < today;

  // Check if a day is eligible for second selection (adjacent to current selection)
  const isEligibleSecond = (day: Date) => {
    if (selectedDates.length !== 1 || isPast(day)) return false;
    const first = selectedDates[0];
    return isSameDay(day, addDays(first, -1)) || isSameDay(day, addDays(first, 1));
  };

  return (
    <div>
      {/* Month nav */}
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={handlePrev}
          disabled={!canPrev}
          className="p-1 rounded text-neutral-400 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <span className="text-sm font-semibold text-white">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </span>
        <button
          type="button"
          onClick={handleNext}
          className="p-1 rounded text-neutral-400 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {DAY_NAMES.map((d) => (
          <div key={d} className="text-center text-[10px] uppercase tracking-wider text-neutral-500 font-medium py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Days */}
      <div className="grid grid-cols-7 gap-1">
        {calendarDays.map((day, i) => {
          if (!day) return <div key={`blank-${i}`} />;
          const past = isPast(day);
          const sel = isSelected(day);
          const eligible = isEligibleSecond(day);

          return (
            <button
              key={toDateStr(day)}
              type="button"
              onClick={() => handleDayClick(day)}
              disabled={past}
              className={`
                aspect-square flex items-center justify-center rounded-lg text-sm font-medium transition-all
                ${past ? "text-neutral-700 cursor-not-allowed" : ""}
                ${sel ? "bg-accent text-black font-bold" : ""}
                ${!sel && !past && eligible ? "ring-1 ring-accent/40 text-accent hover:bg-accent/20" : ""}
                ${!sel && !past && !eligible ? "text-neutral-300 hover:bg-white/[0.06]" : ""}
              `}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>

      {/* Hint */}
      <p className="text-[11px] text-neutral-500 mt-3 text-center">
        {selectedDates.length === 0 && "Selecciona 1 o 2 días consecutivos"}
        {selectedDates.length === 1 && "Puedes seleccionar un día más (consecutivo) o continuar con 1"}
        {selectedDates.length === 2 && "2 días seleccionados"}
      </p>
    </div>
  );
}

export function CircuitSelector({
  plan,
  circuitsToSelect = 1,
  onSelect,
  onCancel,
}: {
  plan: string;
  /** Number of circuits the buyer must pick. 1 = single-pick radio list
   *  (legacy default). >1 = checkbox grid; the "Continuar" button stays
   *  disabled until exactly `circuitsToSelect` items are ticked. */
  circuitsToSelect?: number;
  onSelect: (circuitIds: number[], eventDates?: string[]) => void;
  onCancel: () => void;
}) {
  const requiredCount = Math.max(1, circuitsToSelect || 1);
  const isMulti = requiredCount > 1;
  const isEvent = plan === "event";
  const [step, setStep] = useState<"circuit" | "dates">("circuit");
  const [circuits, setCircuits] = useState<Circuit[]>([]);
  const [loading, setLoading] = useState(true);
  // `selectedIds` holds the picked circuit ids. In single-pick mode it
  // contains at most one entry; in multi-pick mode it must reach exactly
  // `requiredCount` entries before the user can continue.
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [eventDates, setEventDates] = useState<Date[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api
      .getCheckoutCircuits()
      .then((data) => setCircuits(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const toggleCircuit = (circuitId: number) => {
    setSelectedIds((prev) => {
      if (isMulti) {
        if (prev.includes(circuitId)) {
          return prev.filter((id) => id !== circuitId);
        }
        // Hard cap: don't let the user tick more than required.
        if (prev.length >= requiredCount) return prev;
        return [...prev, circuitId];
      }
      // Single-pick: clicking the already-selected row keeps it; clicking
      // another row replaces.
      return [circuitId];
    });
  };

  const handleContinue = () => {
    if (selectedIds.length === 0) return;
    if (isMulti && selectedIds.length !== requiredCount) return;

    if (isEvent && step === "circuit") {
      setStep("dates");
      return;
    }

    setSubmitting(true);
    if (isEvent && eventDates.length > 0) {
      onSelect(selectedIds, eventDates.map(toDateStr));
    } else {
      onSelect(selectedIds);
    }
  };

  const canContinue = step === "circuit"
    ? (isMulti ? selectedIds.length === requiredCount : selectedIds.length >= 1)
    : eventDates.length >= 1;

  // In multi-pick mode the "selected circuit name" line in the dates step
  // doesn't make sense — fall back to "N circuitos seleccionados".
  const selectedCircuitName =
    !isMulti && selectedIds.length === 1
      ? circuits.find((c) => c.id === selectedIds[0])?.name
      : null;

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
            {step === "circuit" ? "Selecciona tu circuito" : "Selecciona los días del evento"}
          </h1>
          <p className="text-neutral-400 text-sm mt-2">
            Plan: <span className="text-accent font-medium">{PLAN_LABELS[plan] || plan}</span>
            {step === "dates" && selectedCircuitName && (
              <> · <span className="text-white">{selectedCircuitName}</span></>
            )}
            {step === "dates" && !selectedCircuitName && selectedIds.length > 1 && (
              <> · <span className="text-white">{selectedIds.length} circuitos</span></>
            )}
          </p>
        </div>

        <div className="bg-surface rounded-2xl p-5 sm:p-8 border border-border">
          {step === "circuit" && (
            <>
              {isMulti && (
                <div className="mb-4 text-center">
                  <p className="text-sm text-neutral-300">
                    Selecciona{" "}
                    <span className="text-accent font-semibold">{requiredCount}</span>{" "}
                    circuitos
                  </p>
                  <p className="text-xs text-neutral-500 mt-1">
                    {selectedIds.length} de {requiredCount} seleccionado
                    {selectedIds.length !== 1 ? "s" : ""}
                  </p>
                </div>
              )}
              {loading ? (
                <div className="flex justify-center py-8">
                  <span className="text-neutral-400 animate-pulse">Cargando circuitos...</span>
                </div>
              ) : circuits.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-neutral-400">No hay circuitos disponibles</p>
                </div>
              ) : isMulti && circuits.length < requiredCount ? (
                <div className="text-center py-8">
                  <p className="text-neutral-400">
                    Solo hay {circuits.length} circuito{circuits.length !== 1 ? "s" : ""}{" "}
                    disponibles, este plan requiere {requiredCount}.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {circuits.map((circuit) => {
                    const checked = selectedIds.includes(circuit.id);
                    const atCap =
                      isMulti && !checked && selectedIds.length >= requiredCount;
                    return (
                      <button
                        key={circuit.id}
                        onClick={() => toggleCircuit(circuit.id)}
                        disabled={atCap}
                        className={`w-full text-left px-4 py-3 rounded-lg border transition-all ${
                          checked
                            ? "border-accent bg-accent/10 text-white"
                            : atCap
                              ? "border-border bg-black text-neutral-500 opacity-50 cursor-not-allowed"
                              : "border-border bg-black text-neutral-300 hover:border-neutral-600"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {isMulti ? (
                            // Square checkbox indicator for multi-select
                            <div
                              className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                                checked ? "border-accent bg-accent" : "border-neutral-600"
                              }`}
                            >
                              {checked && (
                                <svg
                                  className="w-3 h-3 text-black"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  strokeWidth={3}
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M5 13l4 4L19 7"
                                  />
                                </svg>
                              )}
                            </div>
                          ) : (
                            // Round radio indicator for single-select
                            <div
                              className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                                checked ? "border-accent" : "border-neutral-600"
                              }`}
                            >
                              {checked && (
                                <div className="w-2 h-2 rounded-full bg-accent" />
                              )}
                            </div>
                          )}
                          <span className="font-medium">{circuit.name}</span>
                          {circuit.is_beta && (
                            <span className="text-[10px] uppercase rounded px-1.5 py-0.5 bg-amber-500/15 text-amber-300 border border-amber-500/30">
                              Sin verificar
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {step === "dates" && (
            <EventDatePicker selectedDates={eventDates} onSelect={setEventDates} />
          )}

          <div className="mt-6 space-y-3">
            <button
              onClick={handleContinue}
              disabled={!canContinue || submitting}
              className="w-full bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-black font-semibold py-3 rounded-lg transition-colors"
            >
              {submitting
                ? "Redirigiendo a pago..."
                : step === "circuit" && isEvent
                  ? "Seleccionar días"
                  : "Continuar al pago"}
            </button>

            <button
              onClick={() => {
                if (step === "dates") {
                  setStep("circuit");
                  setEventDates([]);
                } else {
                  onCancel();
                }
              }}
              className="w-full text-neutral-400 hover:text-white text-sm py-2 transition-colors"
            >
              {step === "dates" ? "Volver" : "Cancelar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
