"use client";

// Per-lap speed histogram. Tells the driver how much of the lap they spent
// in each speed band — a cluster around mid-range usually means the kart
// didn't reach top speed on the straights.

import { useEffect, useRef } from "react";
import { speedHistogram } from "./helpers";

interface Props {
  speeds: number[];
  bucket?: number;
  height?: number;
}

export function SpeedHistogram({ speeds, bucket = 10, height = 160 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || speeds.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const counts = speedHistogram(speeds, bucket);
    if (counts.length === 0) return;
    const maxCount = Math.max(...counts);
    const total = counts.reduce((a, b) => a + b, 0) || 1;

    const pad = { top: 12, right: 10, bottom: 24, left: 32 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    const barW = plotW / counts.length;
    // Colour scale: red (slow) → orange → yellow → green (fast).
    // Racing intuition: red = stuck in low speed = problem to fix,
    // green = spending time at high speed = good.
    const palette = (i: number) => {
      const t = i / Math.max(1, counts.length - 1);
      if (t < 0.25) return "rgba(239,68,68,0.85)";
      if (t < 0.5)  return "rgba(251,146,60,0.85)";
      if (t < 0.75) return "rgba(250,204,21,0.85)";
      return "rgba(74,222,128,0.85)";
    };

    counts.forEach((c, i) => {
      const x = pad.left + i * barW;
      const barH = (c / maxCount) * plotH;
      const y = pad.top + plotH - barH;
      ctx.fillStyle = palette(i);
      ctx.fillRect(x + 1, y, barW - 2, barH);
      // Label below
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.font = "9px monospace";
      ctx.textAlign = "center";
      ctx.fillText(`${i * bucket}`, x + barW / 2, h - 12);
      // % at top
      const pct = (c / total) * 100;
      if (pct > 2) {
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.fillText(`${pct.toFixed(0)}%`, x + barW / 2, y - 4);
      }
    });

    // Axis label
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.font = "9px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("km/h", pad.left + plotW / 2, h - 2);
  }, [speeds, bucket]);

  return <canvas ref={canvasRef} className="w-full" style={{ height }} />;
}
