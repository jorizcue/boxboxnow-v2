"use client";

// Speed-vs-distance trace with shaded brake zones and optional apex markers.
// When `onHoverDistance` is provided the component emits the hovered distance
// (metres from lap start) so a parent can sync a crosshair on the satellite
// map. A thin vertical line follows the cursor inside the plot area.

import { useEffect, useRef } from "react";
import type { GpsLapDetail } from "./types";
import { speedToAccelMps2, smooth } from "./helpers";

interface Props {
  lap: GpsLapDetail;
  apexes?: number[];
  height?: number;
  /** Called with the distance (m) under the cursor, or null on leave. */
  onHoverDistance?: (dist: number | null) => void;
}

export function SpeedTrace({ lap, apexes, height = 200, onHoverDistance }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const crosshairRef = useRef<HTMLDivElement>(null);
  // Shared state between the draw effect and the mousemove handler.
  const chartDimsRef = useRef({ padLeft: 38, plotW: 0, maxDist: 1 });
  // Stable ref so the event listener closure never goes stale.
  const onHoverRef = useRef(onHoverDistance);
  onHoverRef.current = onHoverDistance;

  // ── Draw ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const speeds = lap.speeds ?? [];
    const dists = lap.distances ?? [];
    const ts = lap.timestamps ?? [];
    if (!canvas || speeds.length < 2 || dists.length < 2) return;
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

    const pad = { top: 14, right: 12, bottom: 26, left: 38 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;
    const maxDist = dists[dists.length - 1] || 1;
    const maxSpeed = Math.ceil(Math.max(...speeds) / 10) * 10 || 100;

    // Share computed dims with the hover handler.
    chartDimsRef.current = { padLeft: pad.left, plotW, maxDist };

    const xAt = (d: number) => pad.left + (d / maxDist) * plotW;
    const yAt = (s: number) => pad.top + plotH - (s / maxSpeed) * plotH;

    // Brake bands: shade where accel < -3 m/s²
    const accel = smooth(speedToAccelMps2(speeds, ts), 5);
    let bandStart = -1;
    for (let i = 0; i < accel.length; i++) {
      const isBrake = accel[i] < -3;
      if (isBrake && bandStart === -1) bandStart = i;
      if ((!isBrake || i === accel.length - 1) && bandStart !== -1) {
        ctx.fillStyle = "rgba(248, 113, 113, 0.10)";
        ctx.fillRect(xAt(dists[bandStart]), pad.top, xAt(dists[i]) - xAt(dists[bandStart]), plotH);
        bandStart = -1;
      }
    }

    // Grid + Y labels
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = "9px monospace";
    ctx.textAlign = "right";
    ctx.lineWidth = 1;
    for (let s = 0; s <= maxSpeed; s += 20) {
      const y = yAt(s);
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + plotW, y); ctx.stroke();
      ctx.fillText(`${s}`, pad.left - 4, y + 3);
    }
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.font = "9px sans-serif";
    ctx.fillText(maxDist >= 1000 ? `${(maxDist / 1000).toFixed(2)} km` : `${Math.round(maxDist)} m`, pad.left + plotW / 2, h - 4);
    ctx.save();
    ctx.translate(10, pad.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("km/h", 0, 0);
    ctx.restore();

    // Speed line (gradient: blue slow → cyan → green → yellow → red fast)
    ctx.beginPath();
    ctx.moveTo(xAt(dists[0]), yAt(speeds[0]));
    for (let i = 1; i < Math.min(dists.length, speeds.length); i++) ctx.lineTo(xAt(dists[i]), yAt(speeds[i]));
    const grad = ctx.createLinearGradient(pad.left, pad.top + plotH, pad.left, pad.top);
    grad.addColorStop(0.0, "#60a5fa");
    grad.addColorStop(0.5, "#34d399");
    grad.addColorStop(0.85, "#facc15");
    grad.addColorStop(1.0, "#f87171");
    ctx.strokeStyle = grad; ctx.lineWidth = 1.6; ctx.lineJoin = "round"; ctx.stroke();

    // Apex markers
    if (apexes?.length) {
      for (const idx of apexes) {
        if (idx < 0 || idx >= speeds.length) continue;
        ctx.beginPath(); ctx.arc(xAt(dists[idx]), yAt(speeds[idx]), 3, 0, Math.PI * 2);
        ctx.fillStyle = "#facc15"; ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.lineWidth = 1; ctx.stroke();
      }
    }

    // Legend
    ctx.fillStyle = "rgba(248, 113, 113, 0.6)";
    ctx.fillRect(pad.left + 8, pad.top + 4, 10, 6);
    ctx.fillStyle = "rgba(255,255,255,0.45)"; ctx.textAlign = "left"; ctx.font = "9px sans-serif";
    ctx.fillText("Frenada", pad.left + 22, pad.top + 10);
    if (apexes?.length) {
      ctx.beginPath(); ctx.arc(pad.left + 78, pad.top + 7, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#facc15"; ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.fillText("Apex", pad.left + 86, pad.top + 10);
    }
  }, [lap, apexes]);

  // ── Hover listeners (added once, use stable refs) ──────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleMove = (e: MouseEvent) => {
      const { padLeft, plotW, maxDist } = chartDimsRef.current;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const inPlot = x >= padLeft && x <= padLeft + plotW;
      if (crosshairRef.current) {
        crosshairRef.current.style.left = `${x}px`;
        crosshairRef.current.style.opacity = inPlot ? "1" : "0";
      }
      const d = Math.max(0, Math.min(maxDist, ((x - padLeft) / plotW) * maxDist));
      onHoverRef.current?.(inPlot ? d : null);
    };

    const handleLeave = () => {
      if (crosshairRef.current) crosshairRef.current.style.opacity = "0";
      onHoverRef.current?.(null);
    };

    canvas.addEventListener("mousemove", handleMove);
    canvas.addEventListener("mouseleave", handleLeave);
    return () => {
      canvas.removeEventListener("mousemove", handleMove);
      canvas.removeEventListener("mouseleave", handleLeave);
    };
  }, []); // added exactly once

  return (
    <div className="relative w-full" style={{ height }}>
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        style={{ cursor: onHoverDistance ? "crosshair" : "default" }}
      />
      {onHoverDistance && (
        <div
          ref={crosshairRef}
          className="absolute top-0 bottom-0 w-px pointer-events-none"
          style={{ background: "rgba(255,255,255,0.28)", opacity: 0 }}
        />
      )}
    </div>
  );
}
