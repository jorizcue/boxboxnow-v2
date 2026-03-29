"use client";

import { useState, useRef, useEffect } from "react";

interface CalendarPickerProps {
  value: string; // YYYY-MM-DD
  onChange: (date: string) => void;
  availableDates?: string[]; // Only these dates are selectable
  disabled?: boolean;
  placeholder?: string;
}

const WEEKDAYS = ["L", "M", "X", "J", "V", "S", "D"];

export function CalendarPicker({
  value,
  onChange,
  availableDates,
  disabled,
  placeholder = "Seleccionar...",
}: CalendarPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Determine initial month to show: value, first available date, or today
  const initial = value || availableDates?.[availableDates.length - 1] || new Date().toISOString().slice(0, 10);
  const [viewYear, setViewYear] = useState(parseInt(initial.slice(0, 4)));
  const [viewMonth, setViewMonth] = useState(parseInt(initial.slice(5, 7)) - 1);

  // Sync view when value changes externally
  useEffect(() => {
    if (value) {
      setViewYear(parseInt(value.slice(0, 4)));
      setViewMonth(parseInt(value.slice(5, 7)) - 1);
    }
  }, [value]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const availableSet = availableDates ? new Set(availableDates) : null;

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  // Monday = 0
  const firstDayOfWeek = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  };

  const monthName = new Date(viewYear, viewMonth).toLocaleString("default", { month: "long" });

  const formatDisplay = (d: string) => {
    if (!d) return "";
    const parts = d.split("-");
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={`w-full flex items-center justify-between bg-surface border border-border rounded-lg px-3 py-2 text-sm transition-colors
          ${disabled ? "opacity-40 cursor-not-allowed" : "hover:border-neutral-600 cursor-pointer"}
          ${open ? "border-accent/50" : ""}
          ${value ? "text-neutral-100" : "text-neutral-500"}`}
      >
        <span>{value ? formatDisplay(value) : placeholder}</span>
        <svg className="w-4 h-4 text-neutral-500 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-64 bg-surface border border-border rounded-xl shadow-2xl shadow-black/50 p-3 animate-in fade-in slide-in-from-top-1">
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={prevMonth}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-neutral-400 hover:text-neutral-200 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            <span className="text-sm font-medium text-neutral-200 capitalize">
              {monthName} {viewYear}
            </span>
            <button
              onClick={nextMonth}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-neutral-400 hover:text-neutral-200 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
            </button>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 mb-1">
            {WEEKDAYS.map((d) => (
              <div key={d} className="text-center text-[10px] text-neutral-500 font-medium py-1">{d}</div>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7">
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const isSelected = dateStr === value;
              const isAvailable = !availableSet || availableSet.has(dateStr);
              const hasRecording = availableSet?.has(dateStr);

              return (
                <button
                  key={day}
                  onClick={() => {
                    if (isAvailable) {
                      onChange(dateStr);
                      setOpen(false);
                    }
                  }}
                  disabled={!isAvailable}
                  className={`relative w-full aspect-square flex items-center justify-center text-xs rounded-lg transition-all
                    ${isSelected
                      ? "bg-accent text-black font-bold"
                      : isAvailable
                        ? "text-neutral-200 hover:bg-white/10 cursor-pointer"
                        : "text-neutral-700 cursor-default"
                    }`}
                >
                  {day}
                  {hasRecording && !isSelected && (
                    <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-accent/60" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
