"use client";

/**
 * Floating popup shown when the user clicks a kart on the tracking map.
 *
 * Top strip uses the kart's tier color so the popup is visually anchored
 * to the marker it came from. Lists: team name, current driver, simple
 * stats row (lap · tier · stint), avg-20-lap with delta vs the kart's
 * best, and the last 5 valid laps with the fastest of those highlighted
 * in accent.
 *
 * Data: everything lives on the WS-driven `KartState`. The 20-lap avg
 * is already computed server-side (`avgLapMs`); we display it with a
 * `vs MEJOR` indicator using `bestLapMs`. The last-5 laps come from
 * `kart.recentLaps` (truncated to 5 in `state.py::to_dict`).
 */
import { useT } from "@/lib/i18n";
import type { KartState } from "@/types/race";
import { msToLapTime } from "@/lib/formatters";

function tierColor(score: number | undefined): string {
  const s = score ?? 0;
  if (s >= 100) return "#9fe556";
  if (s >= 75)  return "#c8e946";
  if (s >= 50)  return "#e5d43a";
  if (s >= 25)  return "#e59a2e";
  return "#e54444";
}

function tierLabel(score: number | undefined): string {
  const s = score ?? 0;
  if (s >= 100) return "100";
  if (s >= 75)  return "75";
  if (s >= 50)  return "50";
  if (s >= 25)  return "25";
  return "1";
}

function secondsToHMS(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(ss)}` : `${pad(m)}:${pad(ss)}`;
}

interface Props {
  kart: KartState;
  isMine: boolean;
  onClose: () => void;
}

export function KartPopup({ kart, isMine, onClose }: Props) {
  const t = useT();
  const fill = tierColor(kart.tierScore);
  const tier = tierLabel(kart.tierScore);
  const last5 = (kart.recentLaps ?? []).slice(-5).reverse();
  const bestOfLast5 = last5.reduce<number>((acc, l) => {
    if (!l.lapTime || l.lapTime <= 0) return acc;
    return acc === 0 || l.lapTime < acc ? l.lapTime : acc;
  }, 0);

  return (
    <div
      className={`absolute top-3 right-3 w-[260px] bg-black/95 border ${isMine ? "border-accent" : "border-border"} rounded-xl shadow-2xl overflow-hidden z-[400]`}
      // Stop click propagation so the popup doesn't close itself when
      // the user clicks inside it.
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header strip — tier color */}
      <div
        className="relative px-3 py-2"
        style={{ background: fill, color: fill === "#e54444" ? "#fff" : "#000" }}
      >
        <div className="font-mono font-bold text-base">#{kart.kartNumber}</div>
        <div className="text-[10px] font-bold uppercase tracking-wider truncate">
          {kart.teamName || "—"}
        </div>
        <button
          onClick={onClose}
          className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-black/30 text-white text-xs leading-none flex items-center justify-center hover:bg-black/50"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div className="px-3 py-2.5 space-y-2.5">
        {/* Driver */}
        <div>
          <div className="text-[9px] font-bold uppercase tracking-wider text-accent">
            {t("tracking.popup.driver")}
          </div>
          <div className="text-sm font-bold text-white mt-0.5">
            {kart.driverName || "—"}
          </div>
        </div>

        {/* Lap · tier · stint */}
        <div>
          <div className="text-[9px] font-bold uppercase tracking-wider text-neutral-500">
            {t("tracking.popup.stats")}
          </div>
          <div className="text-[11px] font-mono font-semibold text-neutral-200 mt-0.5">
            v{kart.totalLaps} · {tier} · {secondsToHMS(kart.stintDurationS || 0)}
          </div>
        </div>

        {/* Avg 20 laps */}
        {kart.avgLapMs ? (
          <div>
            <div className="text-[9px] font-bold uppercase tracking-wider text-neutral-500">
              {t("tracking.popup.avg20")}
            </div>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-sm font-mono font-bold text-accent">
                {msToLapTime(kart.avgLapMs)}
              </span>
              {kart.bestLapMs ? (
                <span className="text-[9px] text-neutral-500 font-mono">
                  {t("tracking.popup.vsBest")} · {msToLapTime(kart.bestLapMs)}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Last 5 laps */}
        {last5.length > 0 && (
          <div>
            <div className="text-[9px] font-bold uppercase tracking-wider text-neutral-500 mb-1">
              {t("tracking.popup.last5")}
            </div>
            <div className="space-y-0.5">
              {last5.map((lap) => (
                <div
                  key={lap.totalLap}
                  className={`flex justify-between text-[11px] font-mono px-1.5 py-0.5 rounded ${
                    lap.lapTime === bestOfLast5 && bestOfLast5 > 0
                      ? "bg-accent/10 text-accent font-bold"
                      : "text-neutral-200"
                  }`}
                >
                  <span className="text-neutral-500">v{lap.totalLap}</span>
                  <span>{msToLapTime(lap.lapTime)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
