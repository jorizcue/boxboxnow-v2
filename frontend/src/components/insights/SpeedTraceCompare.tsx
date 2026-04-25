"use client";

// Two speed traces overlaid on the same axes — used in the comparison view.

import { useEffect, useRef } from "react";
import type { GpsLapDetail } from "./types";

interface Props {
  lapA: GpsLapDetail;
  lapB: GpsLapDetail;
  height?: number;
}

export function SpeedTraceCompare({ lapA, lapB, height = 200 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const sA = lapA.speeds ?? [];
    const dA = lapA.distances ?? [];
    const sB = lapB.speeds ?? [];
    const dB = lapB.distances ?? [];
    if (!canvas || sA.length < 2 || sB.length < 2) return;
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

    const pad = { top: 16, right: 12, bottom: 26, left: 38 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    const maxDist = Math.max(dA[dA.length - 1] || 0, dB[dB.length - 1] || 0) || 1;
    const maxSpeed = Math.ceil(Math.max(...sA, ...sB) / 10) * 10 || 100;

    const xAt = (d: number) => pad.left + (d / maxDist) * plotW;
    const yAt = (s: number) => pad.top + plotH - (s / maxSpeed) * plotH;

    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = "9px monospace";
    ctx.textAlign = "right";
    for (let s = 0; s <= maxSpeed; s += 20) {
      const y = yAt(s);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + plotW, y);
      ctx.stroke();
      ctx.fillText(`${s}`, pad.left - 4, y + 3);
    }

    // Trace A (blue)
    ctx.beginPath();
    ctx.moveTo(xAt(dA[0]), yAt(sA[0]));
    for (let i = 1; i < Math.min(dA.length, sA.length); i++) {
      ctx.lineTo(xAt(dA[i]), yAt(sA[i]));
    }
    ctx.strokeStyle = "rgba(96, 165, 250, 0.95)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Trace B (orange)
    ctx.beginPath();
    ctx.moveTo(xAt(dB[0]), yAt(sB[0]));
    for (let i = 1; i < Math.min(dB.length, sB.length); i++) {
      ctx.lineTo(xAt(dB[i]), yAt(sB[i]));
    }
    ctx.strokeStyle = "rgba(251, 146, 60, 0.95)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Legend
    ctx.fillStyle = "rgba(96, 165, 250, 0.95)";
    ctx.fillRect(pad.left + 8, pad.top + 4, 12, 3);
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`V${lapA.lap_number}`, pad.left + 24, pad.top + 9);
    ctx.fillStyle = "rgba(251, 146, 60, 0.95)";
    ctx.fillRect(pad.left + 64, pad.top + 4, 12, 3);
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillText(`V${lapB.lap_number}`, pad.left + 80, pad.top + 9);
  }, [lapA, lapB]);

  return <canvas ref={canvasRef} className="w-full" style={{ height }} />;
}
