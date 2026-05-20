"use client";

/**
 * Modal that expands a row of the landing pricing-comparison table
 * into the full indicator list of a module (Carrera / Box / App móvil).
 *
 * Each indicator gets a small Tailwind-styled preview (a mock of the
 * real dashboard card / button / badge) plus its localised name plus
 * the per-plan inclusion badges. For mobile indicators the preview is
 * just text (per product decision — no visuals for the native app).
 */

import { useEffect } from "react";
import { useT } from "@/lib/i18n";
import {
  INDICATOR_MODULES,
  PLAN_COLUMNS,
  type IndicatorEntry,
  type IndicatorModule,
  type IndicatorPreview,
  type PlanInclusion,
} from "./indicatorsData";

interface Props {
  moduleKey: "race" | "box" | "mobile" | null;
  onClose: () => void;
}

export function IndicatorsModal({ moduleKey, onClose }: Props) {
  const t = useT();

  // Close on Escape, lock body scroll while open.
  useEffect(() => {
    if (!moduleKey) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [moduleKey, onClose]);

  if (!moduleKey) return null;
  const mod: IndicatorModule = INDICATOR_MODULES[moduleKey];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/70 backdrop-blur-sm px-3 py-6 sm:py-10 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl bg-[#0e0f15] border border-border rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 sm:px-6 py-4 border-b border-border">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-widest text-neutral-500 mb-1">
              {t("landing.indicators.eyebrow")}
            </div>
            <h3 className="text-lg sm:text-xl font-bold text-white">{t(mod.titleKey)}</h3>
            {mod.descriptionKey && (
              <p className="text-sm text-neutral-400 mt-1">{t(mod.descriptionKey)}</p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 text-neutral-400 hover:text-white text-2xl leading-none transition-colors"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="px-5 sm:px-6 py-5 space-y-6">
          {mod.sections.map((section, sIdx) => (
            <section key={sIdx}>
              {section.titleKey && (
                <div className="flex items-center gap-2 mb-3">
                  <h4 className="text-[11px] font-bold uppercase tracking-widest text-neutral-200">
                    {t(section.titleKey)}
                  </h4>
                  {section.comingSoon && (
                    <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-tier-2/15 text-tier-2 border border-tier-2/30">
                      {t("landing.indicators.comingSoon")}
                    </span>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {section.indicators.map((ind) => (
                  <IndicatorCard key={ind.id} indicator={ind} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// IndicatorCard — one entry in the grid: preview + name + plan badges
// ─────────────────────────────────────────────────────────────────────
function IndicatorCard({ indicator }: { indicator: IndicatorEntry }) {
  const t = useT();
  const hasVisual = indicator.preview.kind !== "text";
  return (
    <div className="bg-white/[0.02] border border-border rounded-xl p-3 flex flex-col gap-2.5">
      {hasVisual && (
        <div className="bg-black/30 rounded-lg border border-border/60 p-3 flex items-center justify-center min-h-[72px]">
          <IndicatorPreviewView preview={indicator.preview} />
        </div>
      )}
      <div className="space-y-1.5">
        <div className="text-[12px] font-semibold text-white leading-tight">
          {t(indicator.nameKey)}
        </div>
        <PlanBadges plans={indicator.plans} t={t} />
      </div>
    </div>
  );
}

function PlanBadges({
  plans,
  t,
}: {
  plans: Record<string, PlanInclusion>;
  t: ReturnType<typeof useT>;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {PLAN_COLUMNS.map((col) => {
        const v = plans[col.key];
        const base = "text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border";
        const cls =
          v === "yes"
            ? `${base} bg-accent/15 text-accent border-accent/30`
            : v === "soon"
            ? `${base} bg-tier-2/15 text-tier-2 border-tier-2/30`
            : `${base} bg-neutral-700/15 text-neutral-500 border-neutral-700/30 line-through`;
        return (
          <span key={col.key} className={cls} title={t(col.labelKey)}>
            {t(col.labelKey)}
          </span>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// IndicatorPreviewView — switch by preview.kind. Mirrors the visual
// primitives of the real dashboard cards / buttons / badges.
// ─────────────────────────────────────────────────────────────────────
function IndicatorPreviewView({ preview }: { preview: IndicatorPreview }) {
  if (preview.kind === "metric") {
    const tone: Record<string, string> = {
      neutral: "text-white",
      accent: "text-accent",
      green: "text-green-400",
      orange: "text-orange-400",
      red: "text-red-400",
      purple: "text-purple-400",
      yellow: "text-yellow-400",
    };
    return (
      <div className="flex flex-col items-center justify-center">
        <span className={`text-xl font-mono font-black leading-none ${tone[preview.tone ?? "neutral"]}`}>
          {preview.value}
        </span>
        {preview.unit && (
          <span className="text-[9px] text-neutral-500 mt-1">{preview.unit}</span>
        )}
      </div>
    );
  }

  if (preview.kind === "button") {
    if (preview.variant === "box-call") {
      return (
        <div className="rounded-xl border-2 border-red-500/40 bg-red-500/10 px-3 py-1.5 flex flex-col items-center">
          <span className="text-[8px] text-red-300 uppercase tracking-widest font-bold">
            CALL
          </span>
          <span className="text-base font-black text-red-500 leading-none mt-0.5">BOX</span>
        </div>
      );
    }
    // driver-message
    return (
      <div className="flex items-center gap-1.5 text-accent">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
        </svg>
        <span className="text-[10px] font-semibold uppercase tracking-wider">Msg</span>
      </div>
    );
  }

  if (preview.kind === "badge") {
    const map: Record<string, { text: string; cls: string }> = {
      "pit-open":   { text: "PIT OPEN",   cls: "bg-green-500/20 text-green-400 border-green-500/30" },
      "pit-closed": { text: "PIT CLOSED", cls: "bg-red-500/20 text-red-400 border-red-500/30" },
      "tier-fast":  { text: "TIER 100",   cls: "bg-accent/20 text-accent border-accent/30" },
      "on-track":   { text: "EN PISTA",   cls: "bg-accent/20 text-accent border-accent/30" },
      "in-pit":     { text: "EN BOX",     cls: "bg-orange-400/20 text-orange-400 border-orange-400/30" },
    };
    const { text, cls } = map[preview.variant];
    return (
      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded border ${cls}`}>
        {text}
      </span>
    );
  }

  if (preview.kind === "iconCount") {
    return (
      <div className="flex items-center gap-2">
        <svg className="w-6 h-6 text-orange-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          {preview.icon === "karts" ? (
            <>
              <circle cx="6"  cy="14" r="2.5" />
              <circle cx="12" cy="14" r="2.5" />
              <circle cx="18" cy="14" r="2.5" />
            </>
          ) : (
            <>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h18M3 18h18M9 6h12" />
            </>
          )}
        </svg>
        <span className="text-xl font-mono font-black text-orange-400 leading-none">{preview.value}</span>
      </div>
    );
  }

  if (preview.kind === "list") {
    const tone: Record<string, string> = {
      neutral: "text-neutral-200",
      accent: "text-accent",
      red: "text-red-400",
    };
    return (
      <div className="w-full text-[10px] font-mono">
        {preview.rows.map((row, i) => (
          <div key={i} className="flex items-center justify-between gap-2 py-0.5">
            <span className="text-neutral-400 truncate">{row.label}</span>
            <span className={tone[row.tone ?? "neutral"]}>{row.value}</span>
          </div>
        ))}
      </div>
    );
  }

  return null; // text — no visual
}
