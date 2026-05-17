"use client";

import { useState, useEffect, useMemo } from "react";
import { api } from "@/lib/api";
import { useT, useLangStore, type Language } from "@/lib/i18n";

interface Circuit {
  id: number;
  name: string;
  is_beta: boolean;
  for_sale?: boolean;
}

const LOCALE_TAG: Record<Language, string> = {
  es: "es-ES", en: "en-GB", it: "it-IT", de: "de-DE", fr: "fr-FR",
};

function planKey(plan: string): string {
  switch (plan) {
    case "basic_monthly": return "circuitSelector.planBasicMonthly";
    case "basic_annual": return "circuitSelector.planBasicAnnual";
    case "pro_monthly": return "circuitSelector.planProMonthly";
    case "pro_annual": return "circuitSelector.planProAnnual";
    case "event": return "circuitSelector.planEvent";
    default: return "";
  }
}

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
  const t = useT();
  const lang = useLangStore((s) => s.lang);
  const localeTag = LOCALE_TAG[lang];

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [viewYear, setViewYear] = useState(today.getFullYear());

  const dayNames = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(localeTag, { weekday: "short" });
    const monday = new Date(2024, 0, 1);
    return Array.from({ length: 7 }, (_, i) => fmt.format(addDays(monday, i)));
  }, [localeTag]);

  const monthLabel = useMemo(
    () => new Intl.DateTimeFormat(localeTag, { month: "long", year: "numeric" })
      .format(new Date(viewYear, viewMonth, 1)),
    [localeTag, viewMonth, viewYear],
  );

  const calendarDays = useMemo(() => {
    const firstOfMonth = new Date(viewYear, viewMonth, 1);
    let startDay = firstOfMonth.getDay() - 1;
    if (startDay < 0) startDay = 6;
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const days: (Date | null)[] = [];
    for (let i = 0; i < startDay; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) days.push(new Date(viewYear, viewMonth, d));
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
    if (day < today) return;
    if (selectedDates.length === 0) { onSelect([day]); return; }
    if (selectedDates.length === 1) {
      const first = selectedDates[0];
      if (isSameDay(day, first)) { onSelect([]); return; }
      const dayBefore = addDays(first, -1);
      const dayAfter = addDays(first, 1);
      if (isSameDay(day, dayBefore) && day >= today) {
        onSelect([day, first].sort((a, b) => a.getTime() - b.getTime())); return;
      }
      if (isSameDay(day, dayAfter)) { onSelect([first, day]); return; }
      onSelect([day]); return;
    }
    if (selectedDates.some((s) => isSameDay(s, day))) {
      onSelect(selectedDates.filter((s) => !isSameDay(s, day)));
    } else {
      onSelect([day]);
    }
  };

  const isSelected = (day: Date) => selectedDates.some((s) => isSameDay(s, day));
  const isPast = (day: Date) => day < today;
  const isEligibleSecond = (day: Date) => {
    if (selectedDates.length !== 1 || isPast(day)) return false;
    const first = selectedDates[0];
    return isSameDay(day, addDays(first, -1)) || isSameDay(day, addDays(first, 1));
  };

  return (
    <div>
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
        <span className="text-sm font-semibold text-white capitalize">{monthLabel}</span>
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

      <div className="grid grid-cols-7 gap-1 mb-1">
        {dayNames.map((d, i) => (
          <div key={i} className="text-center text-[10px] uppercase tracking-wider text-neutral-500 font-medium py-1">
            {d}
          </div>
        ))}
      </div>

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

      <p className="text-[11px] text-neutral-500 mt-3 text-center">
        {selectedDates.length === 0 && t("circuitSelector.hintPick")}
        {selectedDates.length === 1 && t("circuitSelector.hintOneMore")}
        {selectedDates.length === 2 && t("circuitSelector.hintTwoSelected")}
      </p>
    </div>
  );
}

export function CircuitSelector({
  plan,
  circuitsToSelect = 1,
  informational = false,
  onSelect,
  onCancel,
}: {
  plan: string;
  circuitsToSelect?: number;
  informational?: boolean;
  onSelect: (circuitIds: number[], eventDates?: string[]) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const requiredCount = Math.max(1, circuitsToSelect || 1);
  const isMulti = requiredCount > 1;
  const isEvent = plan === "event";
  const [step, setStep] = useState<"circuit" | "dates">("circuit");
  const [circuits, setCircuits] = useState<Circuit[]>([]);
  const [loading, setLoading] = useState(true);
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

  const available = useMemo(
    () => circuits.filter((c) => c.for_sale && !c.is_beta), [circuits]);
  const testing = useMemo(
    () => circuits.filter((c) => c.for_sale && c.is_beta), [circuits]);
  const study = useMemo(
    () => circuits.filter((c) => c.is_beta && !c.for_sale), [circuits]);
  const purchasable = useMemo(
    () => [...available, ...testing], [available, testing]);

  const pk = planKey(plan);
  const planText = pk ? t(pk) : plan;

  const toggleCircuit = (circuitId: number) => {
    setSelectedIds((prev) => {
      if (isMulti) {
        if (prev.includes(circuitId)) return prev.filter((id) => id !== circuitId);
        if (prev.length >= requiredCount) return prev;
        return [...prev, circuitId];
      }
      return [circuitId];
    });
  };

  const handleContinue = () => {
    if (informational) { setSubmitting(true); onSelect([]); return; }
    if (selectedIds.length === 0) return;
    if (isMulti && selectedIds.length !== requiredCount) return;
    if (isEvent && step === "circuit") { setStep("dates"); return; }
    setSubmitting(true);
    if (isEvent && eventDates.length > 0) {
      onSelect(selectedIds, eventDates.map(toDateStr));
    } else {
      onSelect(selectedIds);
    }
  };

  const canContinue = informational
    ? true
    : step === "circuit"
      ? (isMulti ? selectedIds.length === requiredCount : selectedIds.length >= 1)
      : eventDates.length >= 1;

  const selectedCircuitName =
    !isMulti && selectedIds.length === 1
      ? circuits.find((c) => c.id === selectedIds[0])?.name
      : null;

  const renderSelectable = (circuit: Circuit) => {
    const checked = selectedIds.includes(circuit.id);
    const atCap = isMulti && !checked && selectedIds.length >= requiredCount;
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
            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${checked ? "border-accent bg-accent" : "border-neutral-600"}`}>
              {checked && (
                <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
          ) : (
            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${checked ? "border-accent" : "border-neutral-600"}`}>
              {checked && <div className="w-2 h-2 rounded-full bg-accent" />}
            </div>
          )}
          <span className="font-medium">{circuit.name}</span>
          {circuit.is_beta && (
            <span className="text-[10px] uppercase rounded px-1.5 py-0.5 bg-amber-500/15 text-amber-300 border border-amber-500/30">
              {t("circuitSelector.badgeProvisional")}
            </span>
          )}
        </div>
      </button>
    );
  };

  const renderReadonly = (circuit: Circuit, dim: boolean) => (
    <div
      key={circuit.id}
      className={`w-full px-4 py-3 rounded-lg border border-border bg-black ${dim ? "text-neutral-500" : "text-neutral-300"}`}
    >
      <div className="flex items-center gap-3">
        <svg className={`w-4 h-4 flex-shrink-0 ${dim ? "text-neutral-700" : "text-neutral-500"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        <span className="font-medium">{circuit.name}</span>
        {circuit.is_beta && (
          <span className="text-[10px] uppercase rounded px-1.5 py-0.5 bg-amber-500/15 text-amber-300 border border-amber-500/30">
            {t("circuitSelector.badgeProvisional")}
          </span>
        )}
      </div>
    </div>
  );

  const sectionHeader = (label: string, subtitle?: string) => (
    <div className="mt-4 first:mt-0 mb-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">{label}</p>
      {subtitle && <p className="text-[11px] text-neutral-500 mt-0.5">{subtitle}</p>}
    </div>
  );

  const renderGroups = () => {
    const readonlyAll = informational;
    return (
      <div>
        {available.length > 0 && (
          <div>
            {sectionHeader(t("circuitSelector.sectionAvailable"))}
            <div className="space-y-2">
              {available.map((c) => readonlyAll ? renderReadonly(c, false) : renderSelectable(c))}
            </div>
          </div>
        )}
        {testing.length > 0 && (
          <div>
            {sectionHeader(t("circuitSelector.sectionTesting"))}
            <div className="space-y-2">
              {testing.map((c) => readonlyAll ? renderReadonly(c, false) : renderSelectable(c))}
            </div>
          </div>
        )}
        {study.length > 0 && (
          <div>
            {sectionHeader(t("circuitSelector.sectionStudy"), t("circuitSelector.studySubtitle"))}
            <div className="space-y-2">
              {study.map((c) => renderReadonly(c, true))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-0 mb-2">
            <span className="text-4xl font-bold text-white">BB</span>
            <span className="text-4xl font-bold text-accent">N</span>
          </div>
          <h1 className="text-xl font-bold text-white mt-2">
            {informational
              ? t("circuitSelector.titleIncluded")
              : step === "circuit"
                ? t("circuitSelector.titleCircuit")
                : t("circuitSelector.titleDates")}
          </h1>
          <p className="text-neutral-400 text-sm mt-2">
            {t("circuitSelector.planLabel")}{" "}
            <span className="text-accent font-medium">{planText}</span>
            {step === "dates" && selectedCircuitName && (
              <> · <span className="text-white">{selectedCircuitName}</span></>
            )}
            {step === "dates" && !selectedCircuitName && selectedIds.length > 1 && (
              <> · <span className="text-white">{t("circuitSelector.nCircuits", { n: selectedIds.length })}</span></>
            )}
          </p>
        </div>

        <div className="bg-surface rounded-2xl p-5 sm:p-8 border border-border">
          {step === "circuit" && (
            <>
              {!informational && isMulti && (
                <div className="mb-4 text-center">
                  <p className="text-sm text-neutral-300">{t("circuitSelector.multiPrompt", { n: requiredCount })}</p>
                  <p className="text-xs text-neutral-500 mt-1">{t("circuitSelector.multiCount", { sel: selectedIds.length, req: requiredCount })}</p>
                </div>
              )}
              {informational && (
                <p className="text-sm text-neutral-400 mb-4 text-center">{t("circuitSelector.includedSubtitle")}</p>
              )}
              {loading ? (
                <div className="flex justify-center py-8">
                  <span className="text-neutral-400 animate-pulse">{t("circuitSelector.loading")}</span>
                </div>
              ) : circuits.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-neutral-400">{t("circuitSelector.empty")}</p>
                </div>
              ) : !informational && isMulti && purchasable.length < requiredCount ? (
                <div className="text-center py-8">
                  <p className="text-neutral-400">{t("circuitSelector.insufficient", { n: purchasable.length, req: requiredCount })}</p>
                </div>
              ) : (
                renderGroups()
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
                ? t("circuitSelector.btnRedirecting")
                : step === "circuit" && isEvent
                  ? t("circuitSelector.btnSelectDays")
                  : t("circuitSelector.btnContinue")}
            </button>

            <button
              onClick={() => {
                if (step === "dates") { setStep("circuit"); setEventDates([]); }
                else { onCancel(); }
              }}
              className="w-full text-neutral-400 hover:text-white text-sm py-2 transition-colors"
            >
              {step === "dates" ? t("circuitSelector.btnBack") : t("circuitSelector.btnCancel")}
            </button>
          </div>

          <div className="mt-5 space-y-2 border-t border-border pt-4">
            <p className="text-[11px] text-neutral-500 leading-relaxed">
              {t("circuitSelector.legendProvisionalPre")}{" "}
              <a href="mailto:info@kartingnow.com" className="text-neutral-400 underline hover:text-neutral-300 transition-colors">
                info@kartingnow.com
              </a>
              {t("circuitSelector.legendProvisionalPost")}
            </p>
            <p className="text-[11px] text-neutral-500 leading-relaxed">
              {t("circuitSelector.legendMissingPre")}{" "}
              <a href="mailto:info@kartingnow.com" className="text-neutral-400 underline hover:text-neutral-300 transition-colors">
                info@kartingnow.com
              </a>
              {" "}{t("circuitSelector.legendMissingPost")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
