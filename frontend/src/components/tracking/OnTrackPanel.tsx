"use client";

/**
 * Side panel for the Tracking module — shows every kart sorted by
 * its current position along the polyline.
 *
 * Each row has:
 *  - Color circle with the kart number (tier color, halo if mine)
 *  - Driver name + team
 *  - Current sector + progress within it ("S2 · 47%")
 *  - Race position from the timing table (P1, P2, ...)
 *
 * Clicking a row selects the kart in the map (opens its popup).
 */
import { useMemo } from "react";
import { useT } from "@/lib/i18n";
import type { KartState, TrackConfig } from "@/types/race";
import { computeKartProgressM, isKartInPit } from "@/lib/kartPosition";
import { effectiveDistanceForward } from "@/lib/polyline";

function tierColor(score: number | undefined): string {
  const s = score ?? 0;
  if (s >= 100) return "#9fe556";
  if (s >= 75)  return "#c8e946";
  if (s >= 50)  return "#e5d43a";
  if (s >= 25)  return "#e59a2e";
  return "#e54444";
}

/** Resolve which sector a forward-distance is in, plus the % progress
 *  within that sector. Used for the right-aligned status text in each
 *  row. Returns ("--", 0) if track config is incomplete. */
function sectorProgress(
  distM: number,
  cfg: TrackConfig,
): { label: string; pct: number } {
  const total = cfg.trackLengthM ?? 0;
  const s1 = cfg.s1DistanceM;
  const s2 = cfg.s2DistanceM;
  const s3 = cfg.s3DistanceM;
  // Boundaries in forward direction (S1 < S2 < S3 < total)
  const bounds = [
    { name: "S1", start: 0, end: s1 ?? null },
    { name: "S2", start: s1 ?? 0, end: s2 ?? null },
    { name: "S3", start: s2 ?? 0, end: s3 ?? null },
    { name: "S3", start: s3 ?? 0, end: total },
  ];
  for (const b of bounds) {
    if (b.end == null) continue;
    if (distM >= b.start && distM < b.end) {
      const pct = b.end > b.start ? Math.min(100, Math.max(0, ((distM - b.start) / (b.end - b.start)) * 100)) : 0;
      return { label: b.name, pct };
    }
  }
  return { label: "—", pct: 0 };
}

interface Props {
  karts: KartState[];
  trackConfig: TrackConfig;
  countdownMs: number;
  myKartNumber: number;
  selectedKart: number | null;
  onSelectKart: (k: number | null) => void;
}

export function OnTrackPanel({
  karts,
  trackConfig,
  countdownMs,
  myKartNumber,
  selectedKart,
  onSelectKart,
}: Props) {
  const t = useT();

  // Compute progress + race-position for each kart once per render.
  const rows = useMemo(() => {
    const total = trackConfig.trackLengthM ?? 0;
    const dir = trackConfig.defaultDirection;
    return karts
      .map((k) => {
        const inPit = isKartInPit(k);
        const rawProgress = inPit ? null : computeKartProgressM(k, trackConfig, countdownMs);
        const fwdDist = rawProgress != null && total > 0
          ? effectiveDistanceForward(rawProgress, dir, total)
          : null;
        const sector = fwdDist != null ? sectorProgress(fwdDist, trackConfig) : null;
        return { kart: k, inPit, fwdDist, sector };
      })
      .sort((a, b) => {
        // Sort by race position from the timing table (existing field
        // — already takes laps + gap into account, more correct than
        // sorting purely by polyline distance).
        return (a.kart.position || 999) - (b.kart.position || 999);
      });
  }, [karts, trackConfig, countdownMs]);

  return (
    <aside className="bg-surface border border-border rounded-xl p-3">
      <h3 className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2 px-1">
        {t("tracking.panel.title")}
      </h3>
      <div className="space-y-0">
        {rows.map(({ kart, inPit, sector }) => {
          const isMine = kart.kartNumber === myKartNumber;
          const isSelected = kart.kartNumber === selectedKart;
          const fill = tierColor(kart.tierScore);
          const textColor = fill === "#e54444" ? "#fff" : "#000";
          return (
            <button
              key={kart.kartNumber}
              onClick={() => onSelectKart(isSelected ? null : kart.kartNumber)}
              className={`w-full text-left flex items-center gap-2 px-1.5 py-1.5 rounded-lg transition-colors border-b border-border/40 last:border-0 ${
                isSelected ? "bg-white/[0.05]" : "hover:bg-white/[0.02]"
              } ${isMine ? "bg-accent/[0.05]" : ""}`}
            >
              <span
                className="w-6 h-6 rounded-full flex items-center justify-center font-mono font-bold text-[10px] shrink-0"
                style={{
                  background: fill,
                  color: textColor,
                  boxShadow: isMine ? "0 0 0 2px #9fe556" : "none",
                }}
              >
                {kart.kartNumber}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-semibold text-neutral-200 truncate">
                  {kart.driverName || "—"}
                </div>
                <div className="text-[9px] font-mono text-neutral-500 truncate">
                  {inPit ? (
                    <span className="text-orange-400 font-bold">
                      {t("tracking.panel.inPit")}
                    </span>
                  ) : sector ? (
                    <>
                      v{kart.totalLaps} · <span className="text-accent font-bold">{sector.label}</span> · {sector.pct.toFixed(0)}%
                    </>
                  ) : (
                    "—"
                  )}
                </div>
              </div>
              <span className="text-[10px] font-mono font-bold text-neutral-400 shrink-0">
                P{kart.position || "?"}
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
