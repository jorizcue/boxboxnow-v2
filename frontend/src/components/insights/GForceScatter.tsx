"use client";

// G-G diagram: lateral vs longitudinal G as a scatter plot. Points away
// from the centre are the high-load moments (hard braking on straights,
// max-grip cornering). Useful for seeing whether the driver fully exploits
// the tyre's friction circle.

import { useEffect, useRef } from "react";

interface Props {
  gforceLat: number[];
  gforceLon: number[];
  maxG?: number;
  height?: number;
}

export function GForceScatter({ gforceLat, gforceLon, maxG = 2, height = 240 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || gforceLat.length === 0) return;
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

    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(cx, cy) - 20;

    // Rings
    for (let g = 0.5; g <= maxG; g += 0.5) {
      const r = (g / maxG) * radius;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,0.10)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.font = "8px monospace";
      ctx.textAlign = "left";
      ctx.fillText(`${g.toFixed(1)}G`, cx + r + 2, cy - 2);
    }

    // Crosshairs
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.beginPath();
    ctx.moveTo(cx - radius, cy);
    ctx.lineTo(cx + radius, cy);
    ctx.moveTo(cx, cy - radius);
    ctx.lineTo(cx, cy + radius);
    ctx.stroke();

    // Quadrant labels
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.font = "9px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("ACEL", cx, cy - radius - 6);
    ctx.fillText("FREN", cx, cy + radius + 14);
    ctx.textAlign = "left";
    ctx.fillText("DER", cx + radius + 4, cy + 3);
    ctx.textAlign = "right";
    ctx.fillText("IZQ", cx - radius - 4, cy + 3);

    // Points
    const n = Math.min(gforceLat.length, gforceLon.length);
    for (let i = 0; i < n; i++) {
      const lat = gforceLat[i];
      const lon = gforceLon[i];
      const x = cx + (lat / maxG) * radius;
      const y = cy - (lon / maxG) * radius;
      const mag = Math.sqrt(lat * lat + lon * lon);
      const hue = mag > 1.4 ? 0 : mag > 0.9 ? 30 : mag > 0.5 ? 90 : 200;
      ctx.beginPath();
      ctx.arc(x, y, 1.6, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${hue}, 80%, 55%, 0.5)`;
      ctx.fill();
    }
  }, [gforceLat, gforceLon, maxG]);

  return <canvas ref={canvasRef} className="w-full" style={{ height }} />;
}
