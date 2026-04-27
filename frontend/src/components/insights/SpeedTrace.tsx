"use client";

// Speed-vs-distance trace with shaded brake zones and optional apex markers.
// Drag to zoom: click and drag over a distance range to zoom in.
// Double-click or the ↺ button to reset. When `onHoverDistance` is provided
// the component emits the hovered distance (metres from lap start) so a parent
// can sync a crosshair on the satellite map.

import { useEffect, useRef, useState } from "react";
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
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const crosshairRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<HTMLDivElement>(null);

  /** null = full view; [min, max] = zoomed range in metres from lap start */
  const [zoomRange, setZoomRange] = useState<[number, number] | null>(null);

  // Shared between draw effect and event handlers (avoids closure staleness).
  const chartDimsRef = useRef({ padLeft: 38, plotW: 0, maxDist: 1, zoomMin: 0, zoomMax: 1 });
  const onHoverRef   = useRef(onHoverDistance);
  onHoverRef.current = onHoverDistance;

  // Drag state (refs → event handlers need no re-registration).
  const isDraggingRef  = useRef(false);
  const dragStartXRef  = useRef(0);

  // Reset zoom whenever lap data changes.
  useEffect(() => { setZoomRange(null); }, [lap]);

  // ── Draw ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const speeds = lap.speeds ?? [];
    const dists  = lap.distances ?? [];
    const ts     = lap.timestamps ?? [];
    if (!canvas || speeds.length < 2 || dists.length < 2) return;
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

    const pad      = { top: 14, right: 12, bottom: 26, left: 38 };
    const plotW    = w - pad.left - pad.right;
    const plotH    = h - pad.top - pad.bottom;
    const maxDist  = dists[dists.length - 1] || 1;
    const maxSpeed = Math.ceil(Math.max(...speeds) / 10) * 10 || 100;

    const xMin   = zoomRange ? Math.max(0, zoomRange[0])    : 0;
    const xMax   = zoomRange ? Math.min(maxDist, zoomRange[1]) : maxDist;
    const xRange = Math.max(1, xMax - xMin);

    // Publish current axis info so event handlers always see the right scale.
    chartDimsRef.current = { padLeft: pad.left, plotW, maxDist, zoomMin: xMin, zoomMax: xMax };

    const xAt = (d: number) => pad.left + ((d - xMin) / xRange) * plotW;
    const yAt = (s: number) => pad.top + plotH - (s / maxSpeed) * plotH;

    // ── Brake bands (canvas-clipped to plot area) ─────────────────────
    const accel = smooth(speedToAccelMps2(speeds, ts), 5);
    ctx.save();
    ctx.beginPath();
    ctx.rect(pad.left, pad.top, plotW, plotH);
    ctx.clip();
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
    ctx.restore();

    // ── Grid + Y labels ────────────────────────────────────────────────
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.fillStyle   = "rgba(255,255,255,0.4)";
    ctx.font        = "9px monospace";
    ctx.textAlign   = "right";
    ctx.lineWidth   = 1;
    for (let s = 0; s <= maxSpeed; s += 20) {
      const y = yAt(s);
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + plotW, y); ctx.stroke();
      ctx.fillText(`${s}`, pad.left - 4, y + 3);
    }

    // X-axis label — show current visible range when zoomed.
    ctx.textAlign   = "center";
    ctx.fillStyle   = "rgba(255,255,255,0.3)";
    ctx.font        = "9px sans-serif";
    const xLabel = zoomRange
      ? (xRange >= 1000
          ? `${(xMin / 1000).toFixed(2)}–${(xMax / 1000).toFixed(2)} km`
          : `${Math.round(xMin)}–${Math.round(xMax)} m`)
      : (maxDist >= 1000 ? `${(maxDist / 1000).toFixed(2)} km` : `${Math.round(maxDist)} m`);
    ctx.fillText(xLabel, pad.left + plotW / 2, h - 4);

    ctx.save();
    ctx.translate(10, pad.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("km/h", 0, 0);
    ctx.restore();

    // ── Speed line + apex markers (canvas-clipped) ─────────────────────
    ctx.save();
    ctx.beginPath();
    ctx.rect(pad.left, pad.top, plotW, plotH);
    ctx.clip();

    ctx.beginPath();
    ctx.moveTo(xAt(dists[0]), yAt(speeds[0]));
    for (let i = 1; i < Math.min(dists.length, speeds.length); i++) ctx.lineTo(xAt(dists[i]), yAt(speeds[i]));
    const grad = ctx.createLinearGradient(pad.left, pad.top + plotH, pad.left, pad.top);
    grad.addColorStop(0.0, "#60a5fa");
    grad.addColorStop(0.5, "#34d399");
    grad.addColorStop(0.85, "#facc15");
    grad.addColorStop(1.0, "#f87171");
    ctx.strokeStyle = grad; ctx.lineWidth = 1.6; ctx.lineJoin = "round"; ctx.stroke();

    if (apexes?.length) {
      for (const idx of apexes) {
        if (idx < 0 || idx >= speeds.length) continue;
        ctx.beginPath(); ctx.arc(xAt(dists[idx]), yAt(speeds[idx]), 3, 0, Math.PI * 2);
        ctx.fillStyle = "#facc15"; ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.lineWidth = 1; ctx.stroke();
      }
    }
    ctx.restore();

    // ── Legend ─────────────────────────────────────────────────────────
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
  }, [lap, apexes, zoomRange]);

  // ── Event listeners (registered once; read state via refs) ───────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleMove = (e: MouseEvent) => {
      const { padLeft, plotW, zoomMin, zoomMax } = chartDimsRef.current;
      const rect = canvas.getBoundingClientRect();
      const x    = e.clientX - rect.left;
      const inPlot = x >= padLeft && x <= padLeft + plotW;

      // Crosshair
      if (crosshairRef.current) {
        crosshairRef.current.style.left    = `${x}px`;
        crosshairRef.current.style.opacity = inPlot ? "1" : "0";
      }

      // Selection overlay while dragging
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

      // Emit hover distance (clamped to visible range)
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
      isDraggingRef.current  = true;
      dragStartXRef.current  = x;
      e.preventDefault(); // prevent text selection cursor during drag
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      if (selectionRef.current) { selectionRef.current.style.opacity = "0"; selectionRef.current.style.width = "0"; }

      const { padLeft, plotW, zoomMin, zoomMax } = chartDimsRef.current;
      const rect   = canvas.getBoundingClientRect();
      const x      = e.clientX - rect.left;
      const startX = dragStartXRef.current;
      if (Math.abs(x - startX) < 5) return; // tap, not drag

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
  }, []); // registered exactly once; reads state via refs

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
      {/* Zoom reset — shown only when zoomed in */}
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
