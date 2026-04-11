"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";

interface TrialConfig {
  trial_enabled: boolean;
  trial_days: number;
}

/**
 * Dynamic CTA button that adapts based on trial configuration.
 * - trial_days > 0 → "Empieza gratis — X días" → /register
 * - trial_days = 0 → "Pruébalo" → scrolls to #pricing
 */
export function TrialCTA({ className = "", variant = "hero" }: { className?: string; variant?: "hero" | "bottom" }) {
  const [config, setConfig] = useState<TrialConfig | null>(null);

  useEffect(() => {
    api.getTrialConfig()
      .then(setConfig)
      .catch(() => setConfig({ trial_enabled: false, trial_days: 0 }));
  }, []);

  // Show a placeholder with same dimensions while loading
  if (!config) {
    return (
      <span className={`inline-block rounded-xl bg-accent/50 px-10 py-4 text-base font-bold text-transparent ${className}`}>
        Cargando...
      </span>
    );
  }

  const text = config.trial_enabled
    ? variant === "bottom"
      ? "Crear cuenta gratis"
      : `Empieza gratis — ${config.trial_days} dias`
    : "Pruebalo";

  const href = config.trial_enabled ? "/register" : "#precios";

  const subtitle = config.trial_enabled
    ? `Sin tarjeta de credito \u00B7 Cancela cuando quieras`
    : null;

  return (
    <>
      <a href={href} className={className}>
        {text}
      </a>
      {variant === "bottom" && subtitle && (
        <p className="mt-4 text-xs text-neutral-600">{subtitle}</p>
      )}
    </>
  );
}

/**
 * Subtitle text under hero CTA — only shown when trial is enabled.
 */
export function TrialSubtitle() {
  const [config, setConfig] = useState<TrialConfig | null>(null);

  useEffect(() => {
    api.getTrialConfig()
      .then(setConfig)
      .catch(() => setConfig({ trial_enabled: false, trial_days: 0 }));
  }, []);

  if (!config || !config.trial_enabled) return null;

  return (
    <p className="mt-4 text-xs text-neutral-600">
      Sin tarjeta de credito &middot; Cancela cuando quieras
    </p>
  );
}
