"use client";

/**
 * Minimal first-party analytics consent banner.
 *
 * Why so light? Two reasons:
 *
 *   1. The platform doesn't use any third-party tracker. No Google
 *      Analytics, no Mixpanel, no Facebook pixel. The only thing the
 *      banner discloses is a first-party UUID in localStorage that
 *      lets us measure aggregated product usage and the acquisition
 *      funnel. Under Spanish LSSI + GDPR the "legitimate interest"
 *      basis is defensible for this kind of strictly-internal
 *      analytics provided there's transparency + an opt-out — exactly
 *      what this banner provides.
 *
 *   2. Heavy cookie-walls degrade UX and are widely ignored. The
 *      banner is a single line at the bottom of the viewport, can be
 *      dismissed, and surfaces a "Desactivar" link that flips the
 *      `ANALYTICS_OPT_OUT` flag immediately (the tracker stops
 *      emitting on the very next call).
 *
 * Persistence: a separate `bbn_consent_seen` localStorage key
 * remembers that the banner has been dismissed at least once, so
 * returning visitors don't see it again. Keeping this independent
 * from `bbn_ao` (opt-out) so the user can dismiss without making
 * any choice — the default remains analytics-on.
 */

import { useEffect, useState } from "react";

import { isAnalyticsOptedOut, setAnalyticsOptOut } from "@/lib/visitor";

const CONSENT_SEEN_KEY = "bbn_consent_seen";

export function AnalyticsConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const seen = window.localStorage.getItem(CONSENT_SEEN_KEY);
      // Don't show the banner to users who've explicitly opted out —
      // they don't need to be re-poked. We also skip it once they've
      // dismissed it at least once.
      if (!seen && !isAnalyticsOptedOut()) {
        // Delay 600 ms so the banner doesn't fight the hero animation
        // for attention on first paint.
        const t = setTimeout(() => setVisible(true), 600);
        return () => clearTimeout(t);
      }
    } catch {
      /* private mode / quota — just don't show */
    }
  }, []);

  const dismiss = () => {
    try {
      window.localStorage.setItem(CONSENT_SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
    setVisible(false);
  };

  const optOut = () => {
    setAnalyticsOptOut(true);
    dismiss();
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Aviso de analítica interna"
      className="fixed bottom-0 inset-x-0 z-[60] px-4 pb-4 sm:px-6 sm:pb-6 pointer-events-none"
    >
      <div className="mx-auto max-w-3xl pointer-events-auto rounded-2xl border border-neutral-800 bg-neutral-950/95 backdrop-blur px-5 py-4 shadow-2xl">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5">
          <p className="text-sm text-neutral-300 flex-1 leading-relaxed">
            Usamos analítica <strong className="text-white">propia</strong> y
            agregada para entender cómo se usa la plataforma. Sin terceros, sin
            cookies de publicidad.{" "}
            <a
              href="/cookies"
              className="text-accent hover:underline whitespace-nowrap"
            >
              Más información
            </a>
            .
          </p>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={optOut}
              className="text-xs text-neutral-400 hover:text-white px-3 py-2 rounded-lg transition-colors"
            >
              Desactivar
            </button>
            <button
              onClick={dismiss}
              className="text-xs font-semibold bg-accent hover:bg-accent-hover text-black px-4 py-2 rounded-lg transition-colors"
            >
              Aceptar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
