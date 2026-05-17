"use client";

import { useState, useEffect, useRef, useCallback, useMemo, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/lib/i18n";
import { useTour } from "@/hooks/useTour";
import type { Tab } from "@/components/layout/Sidebar";

/**
 * First-run guided tour of the main menus (web, desktop-first).
 *
 * Lightweight, dependency-free: a click-blocking backdrop, a spotlight
 * ring drawn over a `[data-tour="…"]` anchor (always the Sidebar nav
 * item, so the target reliably exists regardless of which panel is
 * mounted), and a positioned tooltip card. Each step can switch the
 * active tab so the relevant screen shows (dimmed) behind the spotlight.
 *
 * Auto-runs once per user (localStorage `boxboxnow-tour-seen-<id>`,
 * desktop width only). Relaunchable any time from the Sidebar.
 */

interface TourStep {
  /** i18n key suffix → tour.<key>.title / tour.<key>.body */
  key: string;
  /** data-tour anchor value to spotlight; null → centered modal. */
  target: string | null;
  /** Tab to switch to when this step activates. */
  tab?: Tab;
  /** Only include this step if the user has this tab (undefined = always). */
  requiresTab?: string;
}

const ALL_STEPS: TourStep[] = [
  { key: "intro", target: null },
  { key: "configParams", target: "nav-config", tab: "config", requiresTab: "config" },
  { key: "configTeams", target: "nav-config", tab: "config", requiresTab: "config" },
  { key: "configAuto", target: "nav-config", tab: "config", requiresTab: "config" },
  { key: "race", target: "nav-race", tab: "race", requiresTab: "race" },
  { key: "box", target: "nav-pit", tab: "pit", requiresTab: "pit" },
  { key: "live", target: "nav-live", tab: "live", requiresTab: "live" },
  { key: "account", target: "nav-account", tab: "account" },
  { key: "outro", target: null },
];

const TOOLTIP_W = 340;

function seenKey(userId: number | undefined): string | null {
  return userId ? `boxboxnow-tour-seen-${userId}` : null;
}

export function OnboardingTour({
  setActiveTab,
  userTabs,
  userId,
}: {
  setActiveTab: (tab: Tab) => void;
  userTabs: string[];
  userId: number | undefined;
}) {
  const t = useT();
  const running = useTour((s) => s.running);
  const start = useTour((s) => s.start);
  const stop = useTour((s) => s.stop);

  const [mounted, setMounted] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [rect, setRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const autoChecked = useRef(false);

  // Steps the user can actually see (skip tabs they lack).
  const steps = useMemo(
    () => ALL_STEPS.filter((s) => !s.requiresTab || userTabs.includes(s.requiresTab)),
    [userTabs],
  );

  useEffect(() => setMounted(true), []);

  // Auto-start once per user on desktop, unless already seen.
  useEffect(() => {
    if (autoChecked.current || !userId) return;
    autoChecked.current = true;
    const k = seenKey(userId);
    let seen = false;
    try {
      seen = !!(k && window.localStorage.getItem(k));
    } catch {
      seen = false;
    }
    const isDesktop =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(min-width: 1024px)").matches;
    if (!seen && isDesktop) start();
  }, [userId, start]);

  // Reset to first step whenever the tour (re)starts.
  useEffect(() => {
    if (running) setStepIdx(0);
  }, [running]);

  const markSeen = useCallback(() => {
    const k = seenKey(userId);
    try {
      if (k) window.localStorage.setItem(k, new Date().toISOString());
    } catch {
      /* private mode / quota — non-fatal, tour just may reappear */
    }
  }, [userId]);

  const finish = useCallback(() => {
    markSeen();
    stop();
    setRect(null);
  }, [markSeen, stop]);

  const step = running && stepIdx < steps.length ? steps[stepIdx] : null;

  // Position the spotlight on the current step's anchor. The anchor is a
  // Sidebar nav item (always in the DOM), but we still retry briefly in
  // case the tab switch / layout shift hasn't settled.
  useEffect(() => {
    if (!step) return;
    if (step.tab) setActiveTab(step.tab);

    if (!step.target) {
      setRect(null);
      return;
    }

    let raf = 0;
    let tries = 0;
    const locate = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
          return;
        }
      }
      if (tries++ < 30) raf = requestAnimationFrame(locate);
    };
    locate();
    return () => cancelAnimationFrame(raf);
  }, [step, setActiveTab]);

  // Keep the spotlight aligned on resize/scroll.
  useEffect(() => {
    if (!step || !step.target) return;
    const reposition = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      if (el) {
        const r = el.getBoundingClientRect();
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      }
    };
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [step]);

  // Esc skips the tour.
  useEffect(() => {
    if (!running) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [running, finish]);

  if (!mounted || !running || !step) return null;

  const isFirst = stepIdx === 0;
  const isLast = stepIdx === steps.length - 1;
  const PAD = 6;

  // Tooltip placement: right of the anchor (sidebar is on the left);
  // fall back to centered when there's no anchor or it would overflow.
  let tipStyle: CSSProperties;
  if (rect) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const wantLeft = rect.left + rect.width + 16;
    const fitsRight = wantLeft + TOOLTIP_W + 12 <= vw;
    const left = fitsRight ? wantLeft : Math.max(12, (vw - TOOLTIP_W) / 2);
    const top = Math.min(Math.max(12, rect.top), vh - 240);
    tipStyle = { position: "fixed", top, left, width: TOOLTIP_W };
  } else {
    tipStyle = {
      position: "fixed",
      top: "50%",
      left: "50%",
      width: TOOLTIP_W,
      transform: "translate(-50%, -50%)",
    };
  }

  return createPortal(
    <div className="fixed inset-0 z-[9998]" aria-live="polite" role="dialog">
      {/* Click/interaction blocker so the user follows the tour. */}
      <div className="absolute inset-0" />

      {/* Spotlight ring (only when anchored). The huge box-shadow dims
          everything except the highlighted element. Visual only. */}
      {rect && (
        <div
          className="fixed rounded-lg pointer-events-none transition-all duration-200"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.66)",
            border: "2px solid var(--accent, #f5c518)",
          }}
        />
      )}
      {/* Dim backdrop for centered (no-anchor) steps. */}
      {!rect && <div className="absolute inset-0 bg-black/70" />}

      {/* Tooltip card */}
      <div
        style={tipStyle}
        className="z-[10000] bg-surface border border-border rounded-2xl shadow-2xl p-5 text-left"
      >
        <div className="flex items-start justify-between gap-3 mb-2">
          <h3 className="text-base font-bold text-white">
            {t(`tour.${step.key}.title`)}
          </h3>
          <button
            onClick={finish}
            className="text-neutral-500 hover:text-neutral-300 text-xs shrink-0 mt-0.5"
            aria-label={t("tour.skip")}
          >
            {t("tour.skip")}
          </button>
        </div>
        <p className="text-sm text-neutral-300 leading-relaxed whitespace-pre-line">
          {t(`tour.${step.key}.body`)}
        </p>

        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-[11px] text-neutral-500 tabular-nums">
            {t("tour.progress", { i: stepIdx + 1, n: steps.length })}
          </span>
          <div className="flex items-center gap-2">
            {!isFirst && (
              <button
                onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
                className="px-3 py-1.5 rounded-lg text-sm text-neutral-300 hover:text-white hover:bg-white/[0.06] transition-colors"
              >
                {t("tour.back")}
              </button>
            )}
            <button
              onClick={() => (isLast ? finish() : setStepIdx((i) => i + 1))}
              className="px-4 py-1.5 rounded-lg text-sm font-semibold bg-accent hover:bg-accent-hover text-black transition-colors"
            >
              {isLast ? t("tour.finish") : t("tour.next")}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
