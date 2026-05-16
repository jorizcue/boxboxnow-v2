"use client";

/**
 * Landing "Míralo en acción" demo.
 *
 * A faithful, self-animating recreation of the real BoxBoxNow
 * "Carrera" tab (top bar + the 9 header indicator cards + the
 * sortable timing table with tier badges and the own-kart green
 * highlight). Data is fake but shaped exactly like a live session so
 * the visitor sees the actual product surface, not a generic table.
 *
 * Two timers: 1s ticks the race clock (visual life), ~2.6s mutates a
 * few lap times + flashes the changed rows like a WebSocket delta.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { useT } from "@/lib/i18n";

interface Row {
  pos: number;
  kart: number;
  team: string;
  driver: string;
  med20: string;
  mej3: string;
  ult: string;
  mejor: string;
  vlt: number;
  pitDone: number;
  pitMin: number;
  tier: number;
  stint: string;
  stintLaps: number;
  mine?: boolean;
}

const INITIAL: Row[] = [
  { pos: 1, kart: 53, team: "ESCUDERÍA RELÁMPAGO", driver: "LUCAS MARTÍN", med20: "56.298", mej3: "55.751", ult: "55.606", mejor: "55.734", vlt: 20, pitDone: 0, pitMin: 3, tier: 100, stint: "19:02.02", stintLaps: 19 },
  { pos: 2, kart: 47, team: "TEAM NEBULOSA", driver: "DANIEL SERRANO", med20: "56.508", mej3: "55.850", ult: "55.160", mejor: "55.554", vlt: 20, pitDone: 0, pitMin: 3, tier: 75, stint: "19:02.02", stintLaps: 19 },
  { pos: 3, kart: 54, team: "VÉRTICE RACING", driver: "PABLO REYES", med20: "56.965", mej3: "55.960", ult: "55.489", mejor: "55.746", vlt: 20, pitDone: 0, pitMin: 3, tier: 75, stint: "19:02.02", stintLaps: 19 },
  { pos: 4, kart: 31, team: "KART GALAXIA", driver: "IVÁN CASTRO", med20: "57.283", mej3: "56.439", ult: "58.996", mejor: "—", vlt: 17, pitDone: 1, pitMin: 3, tier: 50, stint: "2:30.37", stintLaps: 2 },
  { pos: 5, kart: 45, team: "TRAZADA PERFECTA", driver: "SERGIO LARA", med20: "58.071", mej3: "56.363", ult: "56.442", mejor: "56.325", vlt: 19, pitDone: 0, pitMin: 3, tier: 50, stint: "19:02.02", stintLaps: 19 },
  { pos: 6, kart: 26, team: "NITRO LEGENDS", driver: "ADRIÁN NIETO", med20: "58.312", mej3: "57.700", ult: "57.203", mejor: "57.633", vlt: 18, pitDone: 0, pitMin: 3, tier: 25, stint: "19:02.02", stintLaps: 17 },
  { pos: 7, kart: 46, team: "CURVA CERO", driver: "RUBÉN SOLÍS", med20: "58.798", mej3: "58.576", ult: "59.062", mejor: "58.136", vlt: 17, pitDone: 1, pitMin: 3, tier: 1, stint: "6:00.74", stintLaps: 6 },
  { pos: 8, kart: 28, team: "PISTA FANTASMA", driver: "ÓSCAR PEÑA", med20: "58.827", mej3: "57.846", ult: "59.004", mejor: "57.312", vlt: 19, pitDone: 0, pitMin: 3, tier: 25, stint: "19:02.02", stintLaps: 18 },
  { pos: 9, kart: 51, team: "HORIZONTE KART", driver: "MARCO LEÓN", med20: "59.952", mej3: "59.952", ult: "1:02.867", mejor: "59.606", vlt: 16, pitDone: 1, pitMin: 3, tier: 1, stint: "6:00.74", stintLaps: 6, mine: true },
];

/** Tier badge palette — mirrors the real box-score gradient. */
function tierClass(t: number): string {
  if (t >= 100) return "bg-[#7CFC00] text-black";
  if (t >= 75) return "bg-[#bef264] text-black";
  if (t >= 50) return "bg-[#fde047] text-black";
  if (t >= 25) return "bg-[#fb923c] text-black";
  return "bg-[#ef4444] text-white";
}

/** Vary a lap time string. Handles "55.606" and "1:02.867". */
function varyTime(base: string, range: number): string {
  if (base === "—") return base;
  const hasMin = base.includes(":");
  const body = hasMin ? base.split(":")[1] : base;
  const min = hasMin ? base.split(":")[0] : null;
  const [sec, ms] = body.split(".");
  let total = parseInt(sec) * 1000 + parseInt(ms);
  total += Math.floor(Math.random() * range - range / 2);
  total = Math.max(54000, total);
  const s = Math.floor(total / 1000);
  const m = String(total % 1000).padStart(3, "0");
  return min ? `${min}:${String(s).padStart(2, "0")}.${m}` : `${s}.${m}`;
}

function hhmmss(total: number): string {
  const s = Math.max(0, total);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

interface HeaderCard {
  label: string;
  value: string;
  tone?: "accent" | "warn" | "danger" | "plain";
  arrow?: "up" | "down";
}

export function MiniRaceTable() {
  const t = useT();
  const [data, setData] = useState<Row[]>(INITIAL);
  const [flash, setFlash] = useState<Set<number>>(new Set());
  const [raceLeft, setRaceLeft] = useState(6057); // 1:40:57
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const t = setInterval(() => setRaceLeft((v) => (v <= 0 ? 6057 : v - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  const tick = useCallback(() => {
    setData((prev) => {
      const idxs = new Set<number>();
      const n = Math.random() > 0.5 ? 3 : 2;
      while (idxs.size < n) idxs.add(Math.floor(Math.random() * prev.length));
      const next = prev.map((row, i) =>
        idxs.has(i)
          ? { ...row, ult: varyTime(row.ult, 700), vlt: row.vlt + (Math.random() > 0.75 ? 1 : 0) }
          : row,
      );
      setFlash(idxs);
      return next;
    });
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(new Set()), 600);
  }, []);

  useEffect(() => {
    const t = setInterval(tick, 2600);
    return () => clearInterval(t);
  }, [tick]);

  const headerCards: HeaderCard[] = [
    { label: t("landing.race.card.pilotoUltVuelta"), value: "MARCO L.", tone: "plain" },
    { label: t("landing.race.card.media20v"), value: "59.952", tone: "plain" },
    { label: t("landing.race.card.posicionPorMedia"), value: "9/9", tone: "accent" },
    { label: t("landing.race.card.stintEnCurso"), value: "00:06:00", tone: "plain" },
    { label: t("landing.race.card.tiempoHastaStintMax"), value: "00:33:59", tone: "danger" },
    { label: t("landing.race.card.vueltasHastaStintMax"), value: "34.0", tone: "warn" },
    { label: t("landing.race.card.mediaStintFuturo"), value: "00:47:59", tone: "warn" },
    { label: t("landing.race.card.kartsCercaPit"), value: "0", tone: "plain" },
  ];

  const toneText: Record<NonNullable<HeaderCard["tone"]>, string> = {
    accent: "text-[#9fe556]",
    warn: "text-amber-400",
    danger: "text-red-400",
    plain: "text-white",
  };

  return (
    <div className="flex bg-black text-white font-mono text-[12px] leading-none select-none">
      {/* Thin app sidebar */}
      <div className="hidden sm:flex w-9 shrink-0 flex-col items-center gap-4 border-r border-border/40 py-4 bg-black">
        {["→", "▦", "◉", "≡", "⚙", "↧"].map((g, i) => (
          <span key={i} className={`text-sm ${i === 1 ? "text-[#9fe556]" : "text-neutral-600"}`}>{g}</span>
        ))}
      </div>

      <div className="min-w-0 flex-1">
        {/* ===== TOP BAR ===== */}
        <div className="flex items-center justify-between gap-3 border-b border-border/40 px-3 py-2 overflow-hidden">
          <div className="flex items-center gap-2 shrink-0">
            <span className="font-bold tracking-tight">
              BB<span className="text-[#9fe556]">N</span>
            </span>
            <span className="hidden md:inline text-neutral-500">08:08:03 PM</span>
            <span className="flex items-center gap-1 text-[#9fe556]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#9fe556] animate-pulse" />
              LIVE
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="hidden sm:inline text-neutral-500">{t("landing.race.bar.carrera")}</span>
            <span className="text-base font-bold tracking-wider text-white">{hhmmss(raceLeft)}</span>
          </div>
          <div className="hidden lg:flex items-center gap-1 rounded bg-red-500/15 border border-red-500/30 px-2 py-1 text-[10px] text-red-300 shrink-0">
            <span className="font-bold">{t("landing.race.bar.pitCerrado")}</span>
            <span className="text-red-400/70">· MARCO LEÓN necesita 29 min más</span>
          </div>
        </div>

        {/* ===== HEADER CARDS ===== */}
        <div className="flex gap-2 overflow-x-auto px-3 py-3 border-b border-border/40">
          {headerCards.map((c) => (
            <div
              key={c.label}
              className="min-w-[104px] shrink-0 rounded-lg border border-border/40 bg-surface/40 px-3 py-2"
            >
              <div className="text-[8px] uppercase tracking-wider text-neutral-500 leading-tight h-5">
                {c.label}
              </div>
              <div className={`mt-1.5 text-base font-bold ${toneText[c.tone ?? "plain"]}`}>
                {c.value}
              </div>
            </div>
          ))}
          {/* LLAMAR A BOX */}
          <div className="min-w-[104px] shrink-0 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 flex flex-col items-center justify-center">
            <div className="text-[8px] uppercase tracking-wider text-red-400/70">{t("landing.race.bar.llamarBox")}</div>
            <div className="mt-1 text-lg font-extrabold text-red-400 tracking-widest">{t("landing.race.bar.box")}</div>
          </div>
        </div>

        {/* ===== TIMING TABLE ===== */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead>
              <tr className="border-b border-border/40 text-[9px] uppercase tracking-wider text-neutral-500">
                <th className="py-2 pl-3 pr-2 w-8">#</th>
                <th className="py-2 px-2 w-10">Kart</th>
                <th className="py-2 px-2">{t("landing.race.col.equipo")}</th>
                <th className="py-2 px-2 hidden md:table-cell">{t("landing.race.col.piloto")}</th>
                <th className="py-2 px-2 text-right text-[#9fe556]">Med.20 ▲</th>
                <th className="py-2 px-2 text-right hidden sm:table-cell">Mej.3</th>
                <th className="py-2 px-2 text-right">Últ.</th>
                <th className="py-2 px-2 text-right hidden sm:table-cell">Mejor</th>
                <th className="py-2 px-2 text-right w-8">Vlt</th>
                <th className="py-2 px-2 text-center hidden md:table-cell">Pit</th>
                <th className="py-2 px-2 text-center w-12">Tier</th>
                <th className="py-2 px-2 text-right pr-3 hidden sm:table-cell">Stint</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r, i) => (
                <tr
                  key={r.kart}
                  className={`border-b border-border/15 transition-colors duration-300 ${
                    r.mine
                      ? "bg-[#9fe556]/[0.08] border-l-2 border-l-[#9fe556]"
                      : flash.has(i)
                        ? "bg-[#9fe556]/[0.06]"
                        : ""
                  }`}
                >
                  <td className={`py-2 pl-3 pr-2 font-bold ${r.pos === 1 ? "text-[#9fe556]" : "text-neutral-500"}`}>
                    {r.pos}
                  </td>
                  <td className="py-2 px-2 font-bold text-white/90">{r.kart}</td>
                  <td className={`py-2 px-2 font-semibold ${r.mine ? "text-[#9fe556]" : "text-white/85"} truncate max-w-[150px]`}>
                    {r.team}
                  </td>
                  <td className={`py-2 px-2 hidden md:table-cell ${r.mine ? "text-[#9fe556]" : "text-neutral-400"} truncate max-w-[140px]`}>
                    {r.driver}
                  </td>
                  <td className="py-2 px-2 text-right text-[#9fe556]">{r.med20}</td>
                  <td className="py-2 px-2 text-right text-neutral-400 hidden sm:table-cell">{r.mej3}</td>
                  <td className={`py-2 px-2 text-right transition-colors ${flash.has(i) ? "text-[#9fe556]" : "text-white/80"}`}>
                    {r.ult}
                  </td>
                  <td className="py-2 px-2 text-right text-[#9fe556]/70 hidden sm:table-cell">{r.mejor}</td>
                  <td className="py-2 px-2 text-right text-neutral-300">{r.vlt}</td>
                  <td className="py-2 px-2 text-center text-neutral-500 hidden md:table-cell">
                    <span className={r.pitDone > 0 ? "text-amber-400" : ""}>{r.pitDone}</span>
                    <span className="text-neutral-600">/{r.pitMin}</span>
                  </td>
                  <td className="py-2 px-2 text-center">
                    <span className={`inline-block min-w-[28px] rounded px-1.5 py-0.5 text-[10px] font-bold ${tierClass(r.tier)}`}>
                      {r.tier}
                    </span>
                  </td>
                  <td className="py-2 px-2 pr-3 text-right text-neutral-400 hidden sm:table-cell">
                    {r.stint}{" "}
                    <span className="text-neutral-600">({r.stintLaps}v)</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
