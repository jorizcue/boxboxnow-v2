"use client";

import { useEffect, useState } from "react";

/**
 * Full-screen maintenance page.
 *
 * Shown when admin → Plataforma → "Mantenimiento" toggle is ON, to every
 * non-admin visitor. Admins keep their normal access so they can fix
 * whatever broke. Visual style mirrors the countdown page (dark theme,
 * Outfit + JetBrains Mono, accent green) so the brand feels coherent.
 *
 * The "BOX BOX BOX" call-and-response is a deliberate nod to the F1/karting
 * radio call that gives the product its name.
 */
export function MaintenancePage() {
  // Subtle pulse on "BOX" so the page doesn't feel static.
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    const id = setInterval(() => setPulse((p) => !p), 800);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <style>{`
        :root {
          --green: #9FE556;
          --red: #E54444;
          --bg: #080808;
          --text: #F5F5F5;
          --muted: rgba(245,245,245,0.45);
          --font-display: var(--font-outfit, 'Outfit', sans-serif);
          --font-mono: var(--font-mono, 'JetBrains Mono', monospace);
        }
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: var(--bg); color: var(--text); font-family: var(--font-display); }

        body::before {
          content: '';
          position: fixed; inset: 0; z-index: 0; pointer-events: none;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E");
          background-size: 256px 256px; opacity: 0.5;
        }
        body::after {
          content: '';
          position: fixed; inset: 0; z-index: 0; pointer-events: none;
          background-image:
            linear-gradient(rgba(159,229,86,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(159,229,86,0.04) 1px, transparent 1px);
          background-size: 60px 60px;
        }
        .bbn-mt-glow {
          position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
          width: 80vw; height: 60vh; z-index: 0; pointer-events: none;
          background: radial-gradient(ellipse at center, rgba(159,229,86,0.10) 0%, transparent 70%);
        }
        .bbn-mt-page {
          position: relative; z-index: 1;
          min-height: 100vh; display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          padding: 40px 20px;
          text-align: center;
        }
        .bbn-mt-logo {
          font-family: var(--font-display); font-weight: 900;
          font-size: 18px; letter-spacing: 0.1em;
          margin-bottom: 80px;
        }
        .bbn-mt-logo em { font-style: normal; color: var(--green); }
        .bbn-mt-call {
          font-family: var(--font-display); font-weight: 900;
          font-size: clamp(56px, 14vw, 160px);
          letter-spacing: 0.04em; line-height: 0.95;
          margin-bottom: 32px;
        }
        .bbn-mt-call .pulse {
          color: var(--green);
          transition: opacity 0.3s ease;
        }
        .bbn-mt-status {
          font-family: var(--font-mono); font-size: 12px;
          letter-spacing: 0.2em; color: var(--muted);
          text-transform: uppercase;
          display: flex; align-items: center; gap: 10px;
          margin-bottom: 40px;
        }
        .bbn-mt-status::before {
          content: ''; width: 8px; height: 8px; border-radius: 50%;
          background: var(--red);
          box-shadow: 0 0 12px var(--red);
          animation: bbn-mt-blink 1.4s ease-in-out infinite;
        }
        @keyframes bbn-mt-blink {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.3; }
        }
        .bbn-mt-headline {
          font-family: var(--font-display); font-weight: 700;
          font-size: clamp(20px, 3.5vw, 28px);
          line-height: 1.35; max-width: 600px;
          margin-bottom: 16px;
        }
        .bbn-mt-sub {
          font-family: var(--font-display); font-weight: 400;
          font-size: clamp(14px, 2vw, 17px);
          color: var(--muted); max-width: 540px;
          line-height: 1.6;
          margin-bottom: 64px;
        }
        .bbn-mt-footer {
          font-family: var(--font-mono); font-size: 11px;
          letter-spacing: 0.15em; color: var(--muted);
          text-transform: uppercase;
        }
        .bbn-mt-footer a {
          color: var(--green); text-decoration: none;
          margin-left: 6px;
        }
        .bbn-mt-footer a:hover { text-decoration: underline; }
      `}</style>

      <div className="bbn-mt-glow" />
      <div className="bbn-mt-page">
        <div className="bbn-mt-logo">BOXBOX<em>NOW</em></div>

        <div className="bbn-mt-call">
          <span className={pulse ? "pulse" : "pulse"} style={{ opacity: pulse ? 1 : 0.45 }}>
            BOX
          </span>{" "}
          <span className="pulse" style={{ opacity: pulse ? 0.45 : 1 }}>
            BOX
          </span>{" "}
          <span className="pulse" style={{ opacity: pulse ? 1 : 0.45 }}>
            BOX
          </span>
        </div>

        <div className="bbn-mt-status">Mantenimiento en curso</div>

        <h1 className="bbn-mt-headline">
          El equipo está reescribiendo la telemetría.
        </h1>
        <p className="bbn-mt-sub">
          Hemos entrado en pit lane para una parada técnica. Volvemos a pista
          en breve con gomas nuevas y la vuelta rápida garantizada.
        </p>

        <div className="bbn-mt-footer">
          Síguenos
          <a href="https://instagram.com/boxboxnow.app" target="_blank" rel="noopener noreferrer">
            @boxboxnow.app
          </a>
        </div>
      </div>
    </>
  );
}
