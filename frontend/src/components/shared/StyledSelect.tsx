"use client";

import { useState, useRef, useEffect } from "react";

interface Option {
  value: string | number;
  label: string;
}

interface StyledSelectProps {
  value: string | number;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Compact mode for inline/header usage */
  compact?: boolean;
}

export function StyledSelect({
  value,
  onChange,
  options,
  placeholder = "Seleccionar...",
  disabled,
  className = "",
  compact = false,
}: StyledSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selectedLabel = options.find((o) => String(o.value) === String(value))?.label;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={`w-full flex items-center justify-between bg-surface border border-border transition-colors
          ${compact ? "rounded px-1.5 py-0.5 text-[11px] gap-1" : "rounded-lg px-3 py-2 text-sm"}
          ${disabled ? "opacity-40 cursor-not-allowed" : "hover:border-neutral-600 cursor-pointer"}
          ${open ? "border-accent/50" : ""}
          ${selectedLabel ? "text-neutral-100" : "text-neutral-500"}`}
      >
        <span className="truncate">{selectedLabel || placeholder}</span>
        <svg
          className={`text-neutral-500 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""} ${compact ? "w-3 h-3" : "w-4 h-4 ml-2"}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className={`absolute z-50 mt-1 w-full bg-surface border border-border shadow-2xl shadow-black/50 py-0.5 max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-1 ${compact ? "rounded-lg min-w-[3.5rem]" : "rounded-xl"}`}>
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                onChange(String(opt.value));
                setOpen(false);
              }}
              className={`w-full text-left transition-colors
                ${compact ? "px-2 py-1 text-[11px]" : "px-3 py-2 text-sm"}
                ${String(opt.value) === String(value)
                  ? "bg-accent/10 text-accent font-medium"
                  : "text-neutral-300 hover:bg-white/5 hover:text-neutral-100"
                }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
