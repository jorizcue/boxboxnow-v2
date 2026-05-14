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
import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import type { KartState, TrackConfig } from "@/types/race";
import { computeKartProgressM, isKartInPit } from "@/lib/kartPosition";
import { msToLapTime } from "@/lib/formatters";

function tierColor(score: number | undefined): string {
  const s = score ?? 0;
  if (s >= 100) return "#9fe556";
  if (s >= 75)  return "#c8e946";
  if (s >= 50)  return "#e5d43a";
  if (s >= 25)  return "#e59a2e";
  return "#e54444";
}

/** Convert a polyline-walk distance into "distance from META in race
 *  direction" — i.e. how far the kart has travelled since its last META
 *  crossing. Monotonically grows from 0 to `total` during a lap. */
function raceProgressFromMeta(
  polylineDistM: number,
  cfg: TrackConfig,
  direction: "forward" | "reversed",
): number {
  const total = cfg.trackLengthM ?? 0;
  if (total <= 0) return 0;
  const meta = cfg.metaDistanceM ?? 0;
  const raw = direction === "forward" ? polylineDistM - meta : meta - polylineDistM;
  return ((raw % total) + total) % total;
}

/** Resolve which sector the kart is in (using its race-progress from
 *  META) plus the % progress within that sector. Sensors are ordered
 *  by the race direction so the indicator flips together with the
 *  toggle in the top bar.
 *
 *  Falls back to the pseudo-sector "S—" with the kart's overall lap
 *  progress when the operator hasn't placed any S1/S2/S3 sensors yet. */
function sectorProgress(
  polylineDistM: number,
  cfg: TrackConfig,
  direction: "forward" | "reversed",
): { label: string; pct: number } {
  const total = cfg.trackLengthM ?? 0;
  if (total <= 0) return { label: "—", pct: 0 };
  const kartRace = raceProgressFromMeta(polylineDistM, cfg, direction);

  // Sensors in race-order. In reversed direction the kart crosses
  // them in the reverse SENSOR-NAME order (S3 first, then S2, then S1)
  // — we still label them by their sensor name so the operator can
  // mentally map "S3" back to the same physical point on the track.
  const sensors = [
    { name: "S1", polyline: cfg.s1DistanceM },
    { name: "S2", polyline: cfg.s2DistanceM },
    { name: "S3", polyline: cfg.s3DistanceM },
  ]
    .filter((s): s is { name: string; polyline: number } => s.polyline != null)
    .map((s) => ({ name: s.name, race: raceProgressFromMeta(s.polyline, cfg, direction) }))
    .sort((a, b) => a.race - b.race);

  if (sensors.length === 0) {
    // No sensors placed yet — show overall lap progress under a
    // neutral label so the row isn't always blank.
    return { label: "—", pct: (kartRace / total) * 100 };
  }

  let prevRace = 0;
  for (const s of sensors) {
    if (kartRace >= prevRace && kartRace < s.race) {
      const span = s.race - prevRace;
      const pct = span > 0 ? Math.min(100, ((kartRace - prevRace) / span) * 100) : 0;
      return { label: s.name, pct };
    }
    prevRace = s.race;
  }
  // Final stretch back to META — still labelled with the LAST sensor
  // crossed so the operator can read "S1 · 90 %" as "almost back at META".
  const lastSensor = sensors[sensors.length - 1];
  const span = total - lastSensor.race;
  const pct = span > 0 ? Math.min(100, ((kartRace - lastSensor.race) / span) * 100) : 0;
  return { label: lastSensor.name, pct };
}

interface Props {
  karts: KartState[];
  trackConfig: TrackConfig;
  countdownMs: number;
  myKartNumber: number;
  selectedKart: number | null;
  onSelectKart: (k: number | null) => void;
  // Effective race direction (TrackingTab override + stored default).
  // Drives the forward-distance projection so the per-row sector
  // indicator flips together with the map.
  direction: "forward" | "reversed";
}

export function OnTrackPanel({
  karts,
  trackConfig,
  countdownMs,
  myKartNumber,
  selectedKart,
  onSelectKart,
  direction,
}: Props) {
  const t = useT();

  // META-crossing highlight: each time a kart's
  // `lastLapCompleteCountdownMs` changes (new lap closed) we flash the
  // corresponding row for ~1.5 s. The previous value is kept in a ref
  // so we don't re-flash on every re-render — only on real transitions.
  // First-observation values (no `prev` yet) are seeded into the ref
  // silently so the panel doesn't flash every kart when the user first
  // opens the tab.
  const lastLapRef = useRef<Map<number, number>>(new Map());
  const [flashKarts, setFlashKarts] = useState<Set<number>>(new Set());
  useEffect(() => {
    const justCrossed: number[] = [];
    for (const k of karts) {
      const curr = k.lastLapCompleteCountdownMs ?? 0;
      const prev = lastLapRef.current.get(k.kartNumber);
      if (prev != null && curr > 0 && prev !== curr) {
        justCrossed.push(k.kartNumber);
      }
      lastLapRef.current.set(k.kartNumber, curr);
    }
    if (justCrossed.length === 0) return;
    setFlashKarts((s) => {
      const next = new Set(s);
      justCrossed.forEach((n) => next.add(n));
      return next;
    });
    const tid = setTimeout(() => {
      setFlashKarts((s) => {
        const next = new Set(s);
        justCrossed.forEach((n) => next.delete(n));
        return next;
      });
    }, 1500);
    return () => clearTimeout(tid);
  }, [karts]);

  // Compute progress + race-position for each kart once per render.
  const rows = useMemo(() => {
    return karts
      .map((k) => {
        const inPit = isKartInPit(k);
        const progressM = inPit ? null : computeKartProgressM(k, trackConfig, countdownMs, direction);
        const sector = progressM != null ? sectorProgress(progressM, trackConfig, direction) : null;
        return { kart: k, inPit, progressM, sector };
      })
      .sort((a, b) => {
        // Sort by race position from the timing table (existing field
        // — already takes laps + gap into account, more correct than
        // sorting purely by polyline distance).
        return (a.kart.position || 999) - (b.kart.position || 999);
      });
  }, [karts, trackConfig, countdownMs, direction]);

  return (
    <aside className="bg-surface border border-border rounded-xl p-3">
      <h3 className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2 px-1">
        {t("tracking.panel.title")}
      </h3>
      <div className="space-y-0">
        {rows.map(({ kart, inPit, sector }) => {
          const isMine = kart.kartNumber === myKartNumber;
          const isSelected = kart.kartNumber === selectedKart;
          const isCrossingMeta = flashKarts.has(kart.kartNumber);
          const fill = tierColor(kart.tierScore);
          const textColor = fill === "#e54444" ? "#fff" : "#000";
          return (
            <button
              key={kart.kartNumber}
              onClick={() => onSelectKart(isSelected ? null : kart.kartNumber)}
              className={`w-full text-left flex items-center gap-2 px-1.5 py-1.5 rounded-lg transition-colors border-b border-border/40 last:border-0 ${
                isSelected ? "bg-white/[0.05]" : "hover:bg-white/[0.02]"
              } ${isMine ? "bg-accent/[0.05]" : ""} ${isCrossingMeta ? "tracking-meta-flash" : ""}`}
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
              {/* Right column: race position + last lap time, stacked.
                  The lap time is monospace tabular-nums so the dot lines
                  up across rows even with varying digit widths. */}
              <div className="flex flex-col items-end shrink-0 leading-tight">
                <span className="text-[10px] font-mono font-bold text-neutral-400">
                  P{kart.position || "?"}
                </span>
                <span className="text-[9px] font-mono text-neutral-500 tabular-nums">
                  {kart.lastLapMs > 0 ? msToLapTime(kart.lastLapMs) : "—"}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
