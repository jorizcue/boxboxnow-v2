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
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const available = useMemo(
    () => circuits.filter((c) => c.for_sale && !c.is_beta), [circuits]);
  const testing = useMemo(
    () => circuits.filter((c) => c.for_sale && c.is_beta), [circuits]);
  const study = useMemo(
    () => circuits.filter((c) => !c.for_sale && c.is_beta), [circuits]);

  const column = (titleKey: string, items: PublicCircuit[]) => (
    <div className="flex-1 min-w-0">
      <p className="text-xs font-semibold uppercase tracking-wider text-accent mb-3">
        {t(titleKey)}
      </p>
      {items.length === 0 ? (
        <p className="text-sm text-neutral-600">{t("landing.circuits.colEmpty")}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((c) => (
            <li
              key={c.name}
              className="flex items-center gap-2 text-sm text-neutral-300"
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent/50" />
              <span className="truncate">{c.name}</span>
            </li>
          ))}
        </ul>
      )}
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
          >
            <div
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            />
            <div className="relative w-full max-w-3xl max-h-[85vh] overflow-auto bg-surface border border-border rounded-2xl shadow-2xl p-6 sm:p-8">
              <div className="flex items-start justify-between gap-4 mb-1">
                <div>
                  <h2 className="text-xl font-bold text-white">
                    {t("landing.circuits.title")}
                  </h2>
                  <p className="text-sm text-neutral-400 mt-0.5">
                    {t("landing.circuits.subtitle")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label={t("landing.circuits.close")}
                  className="shrink-0 text-neutral-400 hover:text-white transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="mt-6">
                {loading && !loaded ? (
                  <p className="text-center text-neutral-400 animate-pulse py-10">
                    {t("landing.circuits.loading")}
                  </p>
                ) : circuits.length === 0 ? (
                  <p className="text-center text-neutral-400 py-10">
                    {t("landing.circuits.empty")}
                  </p>
                ) : (
                  <div className="flex flex-col sm:flex-row gap-6 sm:gap-8">
                    {column("landing.circuits.colAvailable", available)}
                    {column("landing.circuits.colTesting", testing)}
                    {column("landing.circuits.colStudy", study)}
                  </div>
                )}
              </div>

              <div className="mt-8 text-right">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-5 py-2 rounded-lg text-sm font-semibold bg-accent hover:bg-accent-hover text-black transition-colors"
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
