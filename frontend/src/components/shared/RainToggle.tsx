"use client";

import { useCallback } from "react";
import { useRaceStore } from "@/hooks/useRaceState";
import { useT } from "@/lib/i18n";
import { api } from "@/lib/api";
import clsx from "clsx";

/**
 * Rain-mode toggle, rendered as an icon button for the StatusBar.
 *
 * Replaces the legacy "card-style" rain toggle that lived in the top
 * grid of Carrera and Box. The new icon sits in the global StatusBar
 * (left of the language flag) so the strategist can flip rain mode
 * from any tab without scrolling back to the metric grid.
 *
 * Visual states:
 *   - rain OFF: neutral cloud outline (gray)
 *   - rain ON : filled cloud + blue accent + raindrops below
 *
 * Persists optimistically through `api.updateSession`; reverts on error.
 */
export function RainToggle() {
  const t = useT();
  const rain = useRaceStore((s) => s.config.rain);

  const toggle = useCallback(() => {
    const newVal = !rain;
    // Optimistic update so the icon flips immediately.
    useRaceStore.setState((s) => ({ config: { ...s.config, rain: newVal } }));
    // Persist to backend; revert on error so the icon doesn't lie about
    // the actual session state.
    api.updateSession({ rain: newVal }).catch(() => {
      useRaceStore.setState((s) => ({ config: { ...s.config, rain: !newVal } }));
    });
  }, [rain]);

  return (
    <button
      onClick={toggle}
      title={`${t("config.rainMode")}: ${rain ? "ON" : "OFF"}`}
      aria-pressed={rain}
      className={clsx(
        "flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-md border transition-colors",
        rain
          ? "bg-blue-500/20 border-blue-400/50 text-blue-300"
          : "bg-transparent border-transparent text-neutral-500 hover:text-neutral-200 hover:bg-white/[0.05]",
      )}
    >
      {/* Cloud + raindrops icon. The drops fade in/out via opacity so
          the SVG is the same in both states and only color shifts. */}
      <svg
        className="w-4 h-4 sm:w-[18px] sm:h-[18px]"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {/* Cloud */}
        <path d="M17 14h0a4 4 0 000-8 6 6 0 00-11.7 1.7A4 4 0 006 14h11z" />
        {/* Raindrops (only visible when active) */}
        <g className={rain ? "opacity-100" : "opacity-0"}>
          <path d="M8 17v3" />
          <path d="M12 17v4" />
          <path d="M16 17v3" />
        </g>
      </svg>
    </button>
  );
}
