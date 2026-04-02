"use client";

import { useCallback } from "react";
import { useRaceStore } from "@/hooks/useRaceState";
import { useT } from "@/lib/i18n";
import { api } from "@/lib/api";
import clsx from "clsx";

export function RainToggle() {
  const t = useT();
  const rain = useRaceStore((s) => s.config.rain);

  const toggle = useCallback(() => {
    const newVal = !rain;
    // Optimistic update
    useRaceStore.setState((s) => ({ config: { ...s.config, rain: newVal } }));
    // Persist to backend (fire and forget)
    api.updateSession({ rain: newVal }).catch(() => {
      // Revert on error
      useRaceStore.setState((s) => ({ config: { ...s.config, rain: !newVal } }));
    });
  }, [rain]);

  return (
    <button
      onClick={toggle}
      className={clsx(
        "bg-surface rounded-xl border p-2 sm:p-3 flex flex-col items-center justify-center transition-all active:scale-95",
        rain ? "border-blue-400/60 bg-blue-500/15" : "border-border hover:border-neutral-600"
      )}
    >
      <span className="text-[8px] sm:text-[9px] text-neutral-300 uppercase tracking-widest font-bold mb-1">
        {t("config.rainMode")}
      </span>
      <span className={clsx(
        "text-lg sm:text-xl font-black leading-none",
        rain ? "text-blue-400" : "text-neutral-500"
      )}>
        {rain ? "ON" : "OFF"}
      </span>
    </button>
  );
}
