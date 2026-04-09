"use client";

import { useRef, useEffect } from "react";

interface Props {
  gX: number;  // lateral G
  gY: number;  // longitudinal G
  maxG?: number;
}

/**
 * G-Force radar visualization — looks like a targeting crosshair/bullseye.
 * Shows concentric circles at 0.5G intervals and a dot for current G-force.
 * Uses canvas for smooth high-frequency updates.
 */
export function GForceRadar({ gX, gY, maxG = 2.0 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const valRef = useRef({ x: gX, y: gY });
  valRef.current = { x: gX, y: gY };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf: number;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx.scale(dpr, dpr);
      }

      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const radius = Math.min(cx, cy) - 4;

      // Concentric rings
      const rings = Math.ceil(maxG / 0.5);
      for (let i = 1; i <= rings; i++) {
        const r = (i / rings) * radius;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = i === rings ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.07)";
        ctx.lineWidth = 1;
        ctx.stroke();

        // Label
        if (r > 16) {
          ctx.fillStyle = "rgba(255,255,255,0.2)";
          ctx.font = "9px monospace";
          ctx.textAlign = "left";
          ctx.fillText(`${(i * 0.5).toFixed(1)}`, cx + r + 2, cy - 2);
        }
      }

      // Crosshair lines
      ctx.strokeStyle = "rgba(255,255,255,0.1)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - radius, cy);
      ctx.lineTo(cx + radius, cy);
      ctx.moveTo(cx, cy - radius);
      ctx.lineTo(cx, cy + radius);
      ctx.stroke();

      // Labels
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.font = "8px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("ACEL", cx, cy - radius - 3);
      ctx.fillText("FREN", cx, cy + radius + 10);
      ctx.textAlign = "left";
      ctx.fillText("IZQ", cx - radius - 2, cy - 4);
      ctx.textAlign = "right";
      ctx.fillText("DER", cx + radius + 2, cy - 4);

      // G-force dot
      const { x, y } = valRef.current;
      const dotX = cx + (x / maxG) * radius;
      const dotY = cy - (y / maxG) * radius; // inverted Y: positive = forward = up

      // Trail (faded)
      const mag = Math.sqrt(x * x + y * y);
      const hue = mag > 1.2 ? 0 : mag > 0.7 ? 40 : 140; // red > yellow > green
      const color = `hsl(${hue}, 80%, 55%)`;

      // Glow
      ctx.beginPath();
      ctx.arc(dotX, dotY, 8, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${hue}, 80%, 55%, 0.2)`;
      ctx.fill();

      // Dot
      ctx.beginPath();
      ctx.arc(dotX, dotY, 4, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      // Center dot
      ctx.beginPath();
      ctx.arc(cx, cy, 2, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.fill();

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [maxG]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full"
      style={{ imageRendering: "auto" }}
    />
  );
}
