"use client";

// Speed-vs-distance trace with shaded brake zones (where the centred
// derivative of speed is < -threshold m/s²) and optional apex markers.

import { useEffect, useRef } from "react";
import type { GpsLapDetail } from "./types";
import { speedToAccelMps2, smooth } from "./helpers";

interface Props {
  lap: GpsLapDetail;
  apexes?: number[];
  height?: number;
}

export function SpeedTrace({ lap, apexes, height = 200 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

    const xAt = (d: number) => pad.left + (d / maxDist) * plotW;
    const yAt = (s: number) => pad.top + plotH - (s / maxSpeed) * plotH;

    // Brake bands: shade red where accel < -3 m/s²
    const accel = smooth(speedToAccelMps2(speeds, ts), 5);
    let bandStart = -1;
    for (let i = 0; i < accel.length; i++) {
      const isBrake = accel[i] < -3;
      if (isBrake && bandStart === -1) bandStart = i;
      if ((!isBrake || i === accel.length - 1) && bandStart !== -1) {
        const x1 = xAt(dists[bandStart]);
        const x2 = xAt(dists[i]);
        ctx.fillStyle = "rgba(248, 113, 113, 0.10)";
        ctx.fillRect(x1, pad.top, x2 - x1, plotH);
        bandStart = -1;
      }
    }

    // Grid lines + Y labels
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = "9px monospace";
    ctx.textAlign = "right";
    ctx.lineWidth = 1;
    for (let s = 0; s <= maxSpeed; s += 20) {
      const y = yAt(s);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + plotW, y);
      ctx.stroke();
      ctx.fillText(`${s}`, pad.left - 4, y + 3);
    }

    // X axis label
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.font = "9px sans-serif";
    ctx.fillText(
      maxDist >= 1000 ? `${(maxDist / 1000).toFixed(2)} km` : `${Math.round(maxDist)} m`,
      pad.left + plotW / 2,
      h - 4,
    );

    // Y axis label
    ctx.save();
    ctx.translate(10, pad.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("km/h", 0, 0);
    ctx.restore();

    // Speed line (gradient: blue→cyan→green→yellow→red)
    ctx.beginPath();
    ctx.moveTo(xAt(dists[0]), yAt(speeds[0]));
    for (let i = 1; i < Math.min(dists.length, speeds.length); i++) {
      ctx.lineTo(xAt(dists[i]), yAt(speeds[i]));
    }
    const grad = ctx.createLinearGradient(pad.left, pad.top + plotH, pad.left, pad.top);
    grad.addColorStop(0.0, "#60a5fa");
    grad.addColorStop(0.5, "#34d399");
    grad.addColorStop(0.85, "#facc15");
    grad.addColorStop(1.0, "#f87171");
    ctx.strokeStyle = grad;
    ctx.lineWidth = 1.6;
    ctx.lineJoin = "round";
    ctx.stroke();

    // Apex markers
    if (apexes && apexes.length) {
      for (const idx of apexes) {
        if (idx < 0 || idx >= speeds.length) continue;
        const x = xAt(dists[idx]);
        const y = yAt(speeds[idx]);
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = "#facc15";
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.6)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // Brake-zone legend
    ctx.fillStyle = "rgba(248, 113, 113, 0.6)";
    ctx.fillRect(pad.left + 8, pad.top + 4, 10, 6);
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.textAlign = "left";
    ctx.font = "9px sans-serif";
    ctx.fillText("Frenada", pad.left + 22, pad.top + 10);
    if (apexes && apexes.length) {
      ctx.beginPath();
      ctx.arc(pad.left + 78, pad.top + 7, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#facc15";
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.fillText("Apex", pad.left + 86, pad.top + 10);
    }
  }, [lap, apexes]);

  return <canvas ref={canvasRef} className="w-full" style={{ height }} />;
}
