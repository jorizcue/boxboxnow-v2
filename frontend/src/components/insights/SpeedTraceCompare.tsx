"use client";

// Two speed traces overlaid on the same axes — used in the comparison view.
// Drag to zoom: click and drag over a distance range to zoom in.
// Double-click or the ↺ button to reset. When `onHoverDistance` is provided
// the component emits the hovered distance so a parent can sync crosshairs
// on both satellite maps simultaneously.

import { useEffect, useRef, useState } from "react";
import type { GpsLapDetail } from "./types";

interface Props {
  lapA: GpsLapDetail;
  lapB: GpsLapDetail;
  height?: number;
  /** Called with the distance (m) under the cursor, or null on leave. */
  onHoverDistance?: (dist: number | null) => void;
}

export function SpeedTraceCompare({ lapA, lapB, height = 200, onHoverDistance }: Props) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const crosshairRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<HTMLDivElement>(null);

  /** null = full view; [min, max] = zoomed range in metres */
  const [zoomRange, setZoomRange] = useState<[number, number] | null>(null);

  const chartDimsRef = useRef({ padLeft: 38, plotW: 0, maxDist: 1, zoomMin: 0, zoomMax: 1 });
  const onHoverRef   = useRef(onHoverDistance);
  onHoverRef.current = onHoverDistance;

  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);

  // Reset zoom when either lap changes.
  useEffect(() => { setZoomRange(null); }, [lapA, lapB]);

  // ── Draw ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const sA = lapA.speeds ?? [];
    const dA = lapA.distances ?? [];
    const sB = lapB.speeds ?? [];
    const dB = lapB.distances ?? [];
    if (!canvas || sA.length < 2 || sB.length < 2) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr  = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    canvas.width  = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const pad      = { top: 16, right: 12, bottom: 26, left: 38 };
    const plotW    = w - pad.left - pad.right;
    const plotH    = h - pad.top - pad.bottom;
    const maxDist  = Math.max(dA[dA.length - 1] || 0, dB[dB.length - 1] || 0) || 1;
    const maxSpeed = Math.ceil(Math.max(...sA, ...sB) / 10) * 10 || 100;

    const xMin   = zoomRange ? Math.max(0, zoomRange[0])       : 0;
    const xMax   = zoomRange ? Math.min(maxDist, zoomRange[1]) : maxDist;
    const xRange = Math.max(1, xMax - xMin);

    chartDimsRef.current = { padLeft: pad.left, plotW, maxDist, zoomMin: xMin, zoomMax: xMax };

    const xAt = (d: number) => pad.left + ((d - xMin) / xRange) * plotW;
    const yAt = (s: number) => pad.top + plotH - (s / maxSpeed) * plotH;

    // ── Grid + Y labels ────────────────────────────────────────────────
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth   = 1;
    ctx.fillStyle   = "rgba(255,255,255,0.4)";
    ctx.font        = "9px monospace";
    ctx.textAlign   = "right";
    for (let s = 0; s <= maxSpeed; s += 20) {
      const y = yAt(s);
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + plotW, y); ctx.stroke();
      ctx.fillText(`${s}`, pad.left - 4, y + 3);
    }

    // X-axis label (range when zoomed)
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.font      = "9px sans-serif";
    ctx.textAlign = "center";
    const xLabel = zoomRange
      ? (xRange >= 1000
          ? `${(xMin / 1000).toFixed(2)}–${(xMax / 1000).toFixed(2)} km`
          : `${Math.round(xMin)}–${Math.round(xMax)} m`)
      : (maxDist >= 1000 ? `${(maxDist / 1000).toFixed(2)} km` : `${Math.round(maxDist)} m`);
    ctx.fillText(xLabel, pad.left + plotW / 2, h - 4);

    // ── Traces (canvas-clipped) ────────────────────────────────────────
    ctx.save();
    ctx.beginPath();
    ctx.rect(pad.left, pad.top, plotW, plotH);
    ctx.clip();

    // Trace A (blue)
    ctx.beginPath();
    ctx.moveTo(xAt(dA[0]), yAt(sA[0]));
    for (let i = 1; i < Math.min(dA.length, sA.length); i++) ctx.lineTo(xAt(dA[i]), yAt(sA[i]));
    ctx.strokeStyle = "rgba(96, 165, 250, 0.95)";
    ctx.lineWidth   = 1.5;
    ctx.lineJoin    = "round";
    ctx.stroke();

    // Trace B (orange)
    ctx.beginPath();
    ctx.moveTo(xAt(dB[0]), yAt(sB[0]));
    for (let i = 1; i < Math.min(dB.length, sB.length); i++) ctx.lineTo(xAt(dB[i]), yAt(sB[i]));
    ctx.strokeStyle = "rgba(251, 146, 60, 0.95)";
    ctx.lineWidth   = 1.5;
    ctx.lineJoin    = "round";
    ctx.stroke();

    ctx.restore();

    // ── Legend ─────────────────────────────────────────────────────────
    ctx.fillStyle = "rgba(96, 165, 250, 0.95)";
    ctx.fillRect(pad.left + 8, pad.top + 4, 12, 3);
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font      = "10px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`V${lapA.lap_number}`, pad.left + 24, pad.top + 9);
    ctx.fillStyle = "rgba(251, 146, 60, 0.95)";
    ctx.fillRect(pad.left + 64, pad.top + 4, 12, 3);
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillText(`V${lapB.lap_number}`, pad.left + 80, pad.top + 9);
  }, [lapA, lapB, zoomRange]);

  // ── Event listeners (registered once; read state via refs) ───────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleMove = (e: MouseEvent) => {
      const { padLeft, plotW, zoomMin, zoomMax } = chartDimsRef.current;
      const rect   = canvas.getBoundingClientRect();
      const x      = e.clientX - rect.left;
      const inPlot = x >= padLeft && x <= padLeft + plotW;

      if (crosshairRef.current) {
        crosshairRef.current.style.left    = `${x}px`;
        crosshairRef.current.style.opacity = inPlot ? "1" : "0";
      }

      if (isDraggingRef.current) {
        const sel = selectionRef.current;
        if (sel) {
          const sx    = dragStartXRef.current;
          const left  = Math.min(sx, x);
          const width = Math.abs(x - sx);
          sel.style.left    = `${left}px`;
          sel.style.width   = `${width}px`;
          sel.style.opacity = width > 5 ? "1" : "0";
        }
      }

      if (plotW > 0) {
        const d = zoomMin + Math.max(0, Math.min(zoomMax - zoomMin, ((x - padLeft) / plotW) * (zoomMax - zoomMin)));
        onHoverRef.current?.(inPlot ? d : null);
      }
    };

    const handleLeave = () => {
      if (crosshairRef.current)  crosshairRef.current.style.opacity  = "0";
      if (selectionRef.current) { selectionRef.current.style.opacity = "0"; selectionRef.current.style.width = "0"; }
      isDraggingRef.current = false;
      onHoverRef.current?.(null);
    };

    const handleMouseDown = (e: MouseEvent) => {
      const { padLeft, plotW } = chartDimsRef.current;
      const rect = canvas.getBoundingClientRect();
      const x    = e.clientX - rect.left;
      if (x < padLeft || x > padLeft + plotW) return;
      isDraggingRef.current = true;
      dragStartXRef.current = x;
      e.preventDefault();
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      if (selectionRef.current) { selectionRef.current.style.opacity = "0"; selectionRef.current.style.width = "0"; }

      const { padLeft, plotW, zoomMin, zoomMax } = chartDimsRef.current;
      const rect   = canvas.getBoundingClientRect();
      const x      = e.clientX - rect.left;
      const startX = dragStartXRef.current;
      if (Math.abs(x - startX) < 5) return;

      const pixToD = (px: number) =>
        zoomMin + ((Math.max(padLeft, Math.min(padLeft + plotW, px)) - padLeft) / plotW) * (zoomMax - zoomMin);

      const d1 = pixToD(Math.min(startX, x));
      const d2 = pixToD(Math.max(startX, x));
      if (d2 - d1 > 0) setZoomRange([d1, d2]);
    };

    const handleDblClick = () => setZoomRange(null);

    canvas.addEventListener("mousemove",  handleMove);
    canvas.addEventListener("mouseleave", handleLeave);
    canvas.addEventListener("mousedown",  handleMouseDown);
    canvas.addEventListener("mouseup",    handleMouseUp);
    canvas.addEventListener("dblclick",   handleDblClick);
    return () => {
      canvas.removeEventListener("mousemove",  handleMove);
      canvas.removeEventListener("mouseleave", handleLeave);
      canvas.removeEventListener("mousedown",  handleMouseDown);
      canvas.removeEventListener("mouseup",    handleMouseUp);
      canvas.removeEventListener("dblclick",   handleDblClick);
    };
  }, []);

  return (
    <div className="relative w-full select-none" style={{ height }}>
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        style={{ cursor: "crosshair" }}
      />
      {/* Drag-to-zoom selection rectangle */}
      <div
        ref={selectionRef}
        className="absolute top-0 bottom-0 pointer-events-none"
        style={{
          background:  "rgba(255,255,255,0.07)",
          borderLeft:  "1px solid rgba(255,255,255,0.35)",
          borderRight: "1px solid rgba(255,255,255,0.35)",
          opacity: 0,
          width: 0,
        }}
      />
      {/* Hover crosshair */}
      <div
        ref={crosshairRef}
        className="absolute top-0 bottom-0 w-px pointer-events-none"
        style={{ background: "rgba(255,255,255,0.28)", opacity: 0 }}
      />
      {/* Zoom reset */}
      {zoomRange && (
        <button
          onClick={() => setZoomRange(null)}
          className="absolute top-1 right-1 z-10 text-[9px] px-1.5 py-0.5 rounded bg-black/60 border border-white/20 text-white/60 hover:text-white hover:border-white/40 transition-colors leading-none"
        >
          ↺ reset
        </button>
      )}
    </div>
  );
}
