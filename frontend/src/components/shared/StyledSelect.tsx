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
}

export function StyledSelect({
  value,
  onChange,
  options,
  placeholder = "Seleccionar...",
  disabled,
  className = "",
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
        className={`w-full flex items-center justify-between bg-surface border border-border rounded-lg px-3 py-2 text-sm transition-colors
          ${disabled ? "opacity-40 cursor-not-allowed" : "hover:border-neutral-600 cursor-pointer"}
          ${open ? "border-accent/50" : ""}
          ${selectedLabel ? "text-neutral-100" : "text-neutral-500"}`}
      >
        <span className="truncate">{selectedLabel || placeholder}</span>
        <svg
          className={`w-4 h-4 text-neutral-500 flex-shrink-0 ml-2 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-surface border border-border rounded-xl shadow-2xl shadow-black/50 py-1 max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-1">
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                onChange(String(opt.value));
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-2 text-sm transition-colors
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
