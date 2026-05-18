"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";

/**
 * Landing CTA + modal listing platform-compatible circuits in three
 * columns, mirroring the checkout grouping:
 *   - Disponibles   = for_sale && !is_beta
 *   - En pruebas     = for_sale &&  is_beta
 *   - En estudio     = !for_sale && is_beta
 * Data comes from the public, unauthenticated /api/public/circuits.
 */

interface PublicCircuit {
  name: string;
  is_beta: boolean;
  for_sale: boolean;
}

// Per-status visual identity. Class strings are static (full literals)
// so Tailwind's content scanner keeps them in the build.
const STATUS = {
  available: {
    labelKey: "landing.circuits.colAvailable",
    descKey: "landing.circuits.descAvailable",
    dot: "bg-accent",
    text: "text-accent",
    badge: "bg-accent/15 text-accent",
    rule: "bg-accent/25",
    marker: "bg-accent",
    rowHover: "hover:bg-accent/[0.07]",
  },
  testing: {
    labelKey: "landing.circuits.colTesting",
    descKey: "landing.circuits.descTesting",
    dot: "bg-gold",
    text: "text-gold",
    badge: "bg-gold/15 text-gold",
    rule: "bg-gold/25",
    marker: "bg-gold",
    rowHover: "hover:bg-gold/[0.07]",
  },
  study: {
    labelKey: "landing.circuits.colStudy",
    descKey: "landing.circuits.descStudy",
    dot: "bg-sky-400",
    text: "text-sky-400",
    badge: "bg-sky-400/15 text-sky-400",
    rule: "bg-sky-400/25",
    marker: "bg-sky-400",
    rowHover: "hover:bg-sky-400/[0.07]",
  },
} as const;

type StatusKey = keyof typeof STATUS;

export function CompatibleCircuitsModal() {
  const t = useT();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [circuits, setCircuits] = useState<PublicCircuit[]>([]);

  useEffect(() => setMounted(true), []);

  const load = useCallback(() => {
    if (loaded || loading) return;
    setLoading(true);
    api
      .getPublicCircuits()
      .then((data) => {
        setCircuits(data);
        setLoaded(true);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [loaded, loading]);

  const openModal = () => {
    setOpen(true);
    load();
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const available = useMemo(
    () => circuits.filter((c) => c.for_sale && !c.is_beta), [circuits]);
  const testing = useMemo(
    () => circuits.filter((c) => c.for_sale && c.is_beta), [circuits]);
  const study = useMemo(
    () => circuits.filter((c) => !c.for_sale && c.is_beta), [circuits]);

  const column = (status: StatusKey, items: PublicCircuit[]) => {
    const s = STATUS[status];
    return (
      <div className="flex-1 min-w-0 rounded-xl border border-border bg-card/60 p-5">
        <div className="flex items-center gap-2.5">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${s.dot}`} />
          <p className={`text-xs font-bold uppercase tracking-wider ${s.text}`}>
            {t(s.labelKey)}
          </p>
          <span
            className={`ml-auto rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${s.badge}`}
          >
            {items.length}
          </span>
        </div>
        <p className="mt-1.5 text-xs text-neutral-500">{t(s.descKey)}</p>
        <div className={`mt-3 mb-1 h-px w-full ${s.rule}`} />
        {items.length === 0 ? (
          <p className="py-4 text-sm text-neutral-600">
            {t("landing.circuits.colEmpty")}
          </p>
        ) : (
          <ul className="space-y-0.5">
            {items.map((c) => (
              <li
                key={c.name}
                className={`flex items-start gap-2.5 rounded-md px-2 py-1.5 text-sm text-neutral-300 transition-colors ${s.rowHover}`}
              >
                <span
                  className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${s.marker}`}
                />
                <span className="leading-snug break-words">{c.name}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  const skeleton = (
    <div className="flex flex-col gap-5 sm:flex-row">
      {[0, 1, 2].map((col) => (
        <div
          key={col}
          className="flex-1 rounded-xl border border-border bg-card/60 p-5"
        >
          <div className="flex items-center gap-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-neutral-700" />
            <span className="h-3 w-24 rounded bg-neutral-800" />
            <span className="ml-auto h-4 w-6 rounded-full bg-neutral-800" />
          </div>
          <div className="mt-1.5 h-2.5 w-32 rounded bg-neutral-800/70" />
          <div className="mt-3 mb-3 h-px w-full bg-neutral-800" />
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((r) => (
              <div
                key={r}
                className="h-3.5 rounded bg-neutral-800/60"
                style={{ width: `${85 - r * 9}%` }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <>
      <div className="flex justify-center">
        <button
          type="button"
          onClick={openModal}
          className="inline-flex items-center gap-2 rounded-full border border-accent/40 px-5 py-2.5 text-sm font-semibold text-accent hover:bg-accent/10 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
          </svg>
          {t("landing.circuits.cta")}
        </button>
      </div>

      {mounted && open &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="circuits-modal-title"
          >
            <div
              className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-fadeIn"
              onClick={() => setOpen(false)}
            />
            <div className="relative flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl animate-modalIn">
              <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5 sm:px-8">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                    </svg>
                  </span>
                  <div>
                    <h2
                      id="circuits-modal-title"
                      className="text-xl font-bold text-white"
                    >
                      {t("landing.circuits.title")}
                    </h2>
                    <p className="mt-0.5 text-sm text-neutral-400">
                      {t("landing.circuits.subtitle")}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {circuits.length > 0 && (
                    <span className="hidden rounded-full bg-white/5 px-3 py-1 text-xs font-semibold text-neutral-300 sm:inline-block">
                      <span className="tabular-nums text-white">
                        {circuits.length}
                      </span>{" "}
                      {t("landing.circuits.total")}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label={t("landing.circuits.close")}
                    className="text-neutral-500 transition-colors hover:text-white"
                  >
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="overflow-auto px-6 py-6 sm:px-8">
                {loading && !loaded ? (
                  skeleton
                ) : circuits.length === 0 ? (
                  <p className="py-10 text-center text-neutral-400">
                    {t("landing.circuits.empty")}
                  </p>
                ) : (
                  <div className="flex flex-col items-stretch gap-5 sm:flex-row">
                    {column("available", available)}
                    {column("testing", testing)}
                    {column("study", study)}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end border-t border-border px-6 py-4 sm:px-8">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-black transition-colors hover:bg-accent-hover"
                >
                  {t("landing.circuits.close")}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
