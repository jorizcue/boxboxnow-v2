"use client";

import { useState, useEffect, useRef } from "react";

// ─── Countdown helpers ────────────────────────────────────────────────────────

const LAUNCH = new Date("2026-05-18T09:00:00Z");

function useCountdown() {
  const [diff, setDiff] = useState(0);

  useEffect(() => {
    const tick = () => setDiff(Math.max(0, LAUNCH.getTime() - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const totalSec = Math.floor(diff / 1000);
  const days = Math.floor(totalSec / 86400);
  const hrs = Math.floor((totalSec % 86400) / 3600);
  const min = Math.floor((totalSec % 3600) / 60);
  const seg = totalSec % 60;
  return { days, hrs, min, seg };
}

// ─── Login Modal ─────────────────────────────────────────────────────────────

function LoginModal({ onClose }: { onClose: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
      const res = await fetch(`${apiUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const body = await res.text();
        try {
          const parsed = JSON.parse(body);
          setError(parsed.detail || "Credenciales incorrectas");
        } catch {
          setError("Credenciales incorrectas");
        }
        return;
      }
      const data = await res.json();
      // Store token in zustand-compatible format
      localStorage.setItem(
        "boxboxnow-auth",
        JSON.stringify({ state: { token: data.token, user: null }, version: 0 })
      );
      window.location.href = "/dashboard";
    } catch {
      setError("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  // Close on backdrop click
  const backdropRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={backdropRef}
      className="bbn-modal-backdrop"
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
    >
      <div className="bbn-modal">
        <button className="bbn-modal-close" onClick={onClose} aria-label="Cerrar">
          ✕
        </button>
        <div className="bbn-modal-logo">BOXBOXNOW</div>
        <p className="bbn-modal-subtitle">Acceso exclusivo</p>

        <form onSubmit={handleLogin} className="bbn-modal-form">
          <div className="bbn-field">
            <label>USUARIO</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="tu_usuario"
              autoComplete="username"
              required
            />
          </div>
          <div className="bbn-field">
            <label>CONTRASEÑA</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </div>
          {error && <p className="bbn-modal-error">{error}</p>}
          <button type="submit" className="bbn-btn-primary" disabled={loading}>
            {loading ? "VERIFICANDO..." : "ENTRAR →"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Waitlist Form ────────────────────────────────────────────────────────────

function WaitlistForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "already" | "error">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
      const res = await fetch(`${apiUrl}/api/auth/waitlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setStatus(data.already ? "already" : "done");
    } catch {
      setStatus("error");
    }
  };

  if (status === "done") {
    return (
      <div className="bbn-waitlist-success">
        <span className="bbn-pulse-dot" />
        <p>RECIBIDO. Te avisamos el <strong>18.05.26</strong>.</p>
      </div>
    );
  }

  if (status === "already") {
    return (
      <div className="bbn-waitlist-success">
        <span className="bbn-pulse-dot" />
        <p>Ya estás en la lista. ¡Hasta el <strong>18.05.26</strong>!</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bbn-waitlist-form">
      <div className="bbn-waitlist-fields">
        <input
          type="text"
          placeholder="Tu nombre (opcional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="bbn-input"
        />
        <input
          type="email"
          placeholder="tu@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="bbn-input"
        />
      </div>
      {status === "error" && (
        <p className="bbn-form-error">Error al enviar. Inténtalo de nuevo.</p>
      )}
      <button type="submit" className="bbn-btn-primary" disabled={status === "loading"}>
        {status === "loading" ? "ENVIANDO..." : "QUIERO ESTAR AHÍ →"}
      </button>
    </form>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ComingSoonPage() {
  const [showLogin, setShowLogin] = useState(false);
  const { days, hrs, min, seg } = useCountdown();

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <>
      {/* ── Global styles ── */}
      <style>{`
        :root {
          --green: #9FE556;
          --red: #E54444;
          --bg: #080808;
          --bg2: #0F0F0F;
          --border: rgba(159,229,86,0.15);
          --text: #F5F5F5;
          --muted: rgba(245,245,245,0.45);
          --font-display: var(--font-outfit, 'Outfit', sans-serif);
          --font-mono: var(--font-mono, 'JetBrains Mono', monospace);
        }
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: var(--bg); color: var(--text); font-family: var(--font-display); }

        /* Noise texture overlay */
        body::before {
          content: '';
          position: fixed; inset: 0; z-index: 0; pointer-events: none;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E");
          background-size: 256px 256px;
          opacity: 0.5;
        }

        /* Grid background */
        body::after {
          content: '';
          position: fixed; inset: 0; z-index: 0; pointer-events: none;
          background-image:
            linear-gradient(rgba(159,229,86,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(159,229,86,0.04) 1px, transparent 1px);
          background-size: 60px 60px;
        }

        /* Green radial glow */
        .bbn-glow {
          position: fixed; top: -20vh; left: 50%; transform: translateX(-50%);
          width: 80vw; height: 60vh; z-index: 0; pointer-events: none;
          background: radial-gradient(ellipse at center, rgba(159,229,86,0.12) 0%, transparent 70%);
        }

        /* Layout */
        .bbn-page { position: relative; z-index: 1; min-height: 100vh; display: flex; flex-direction: column; }

        /* Nav */
        .bbn-nav {
          display: flex; align-items: center; justify-content: space-between;
          padding: 20px 40px;
          border-bottom: 1px solid var(--border);
        }
        .bbn-nav-logo {
          font-family: var(--font-display); font-weight: 900; font-size: 18px;
          letter-spacing: 0.1em; color: var(--text);
        }
        .bbn-nav-status {
          font-family: var(--font-mono); font-size: 11px; color: var(--muted);
          letter-spacing: 0.15em; display: flex; align-items: center; gap: 8px;
        }
        .bbn-status-dot {
          width: 6px; height: 6px; border-radius: 50%; background: var(--green);
          box-shadow: 0 0 8px var(--green);
          animation: blink 2s ease-in-out infinite;
        }
        @keyframes blink {
          0%, 100% { opacity: 1; } 50% { opacity: 0.3; }
        }
        .bbn-nav-btn {
          font-family: var(--font-mono); font-size: 12px; font-weight: 700;
          letter-spacing: 0.1em; color: var(--green); background: transparent;
          border: 1px solid var(--green); padding: 8px 20px; cursor: pointer;
          transition: all 0.2s;
        }
        .bbn-nav-btn:hover { background: var(--green); color: #000; }

        /* Hero */
        .bbn-hero {
          flex: 1; display: flex; flex-direction: column; align-items: center;
          justify-content: center; padding: 80px 40px 60px; text-align: center;
        }
        .bbn-kicker {
          font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.25em;
          color: var(--muted); margin-bottom: 32px; text-transform: uppercase;
        }
        .bbn-headline {
          font-family: var(--font-display); font-weight: 900;
          font-size: clamp(52px, 10vw, 120px);
          line-height: 0.92; letter-spacing: -0.02em;
          color: var(--text); text-transform: uppercase;
          margin-bottom: 32px;
        }
        .bbn-headline em {
          font-style: normal; color: var(--green);
          text-shadow: 0 0 40px rgba(159,229,86,0.4);
        }
        .bbn-payoff {
          font-family: var(--font-mono); font-size: clamp(13px, 1.8vw, 18px);
          letter-spacing: 0.2em; color: var(--muted); margin-bottom: 60px;
        }

        /* Countdown */
        .bbn-countdown {
          display: flex; gap: 1px; margin-bottom: 64px;
          border: 1px solid var(--border);
        }
        .bbn-cell {
          display: flex; flex-direction: column; align-items: center;
          padding: 20px 32px; background: rgba(255,255,255,0.02);
          min-width: 100px;
        }
        .bbn-cell:not(:last-child) { border-right: 1px solid var(--border); }
        .bbn-cell-val {
          font-family: var(--font-mono); font-size: clamp(32px, 5vw, 52px);
          font-weight: 700; color: var(--green); line-height: 1;
          text-shadow: 0 0 20px rgba(159,229,86,0.3);
        }
        .bbn-cell-label {
          font-family: var(--font-mono); font-size: 9px; letter-spacing: 0.2em;
          color: var(--muted); margin-top: 6px; text-transform: uppercase;
        }

        /* Waitlist section */
        .bbn-waitlist {
          width: 100%; max-width: 640px; margin: 0 auto 80px;
          padding: 0 20px;
        }
        .bbn-waitlist-label {
          font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.2em;
          color: var(--muted); text-align: center; margin-bottom: 20px;
          text-transform: uppercase;
        }
        .bbn-waitlist-form { display: flex; flex-direction: column; gap: 12px; }
        .bbn-waitlist-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        @media (max-width: 600px) { .bbn-waitlist-fields { grid-template-columns: 1fr; } }

        .bbn-input {
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1);
          color: var(--text); font-family: var(--font-mono); font-size: 13px;
          padding: 14px 16px; outline: none; width: 100%;
          transition: border-color 0.2s;
        }
        .bbn-input::placeholder { color: rgba(245,245,245,0.25); }
        .bbn-input:focus { border-color: var(--green); }

        .bbn-btn-primary {
          font-family: var(--font-mono); font-size: 13px; font-weight: 700;
          letter-spacing: 0.12em; color: #000; background: var(--green);
          border: none; padding: 16px 32px; cursor: pointer;
          transition: all 0.2s; width: 100%;
        }
        .bbn-btn-primary:hover:not(:disabled) {
          background: #b6f06b; box-shadow: 0 0 30px rgba(159,229,86,0.3);
        }
        .bbn-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

        .bbn-form-error { font-family: var(--font-mono); font-size: 11px; color: var(--red); }

        .bbn-waitlist-success {
          display: flex; align-items: center; gap: 12px;
          border: 1px solid var(--border); padding: 20px 24px;
          font-family: var(--font-mono); font-size: 13px; color: var(--text);
        }
        .bbn-pulse-dot {
          width: 8px; height: 8px; border-radius: 50%; background: var(--green);
          box-shadow: 0 0 10px var(--green); flex-shrink: 0;
          animation: blink 1.5s ease-in-out infinite;
        }

        /* Feature cells */
        .bbn-features {
          display: grid; grid-template-columns: repeat(3, 1fr);
          border-top: 1px solid var(--border);
        }
        @media (max-width: 768px) { .bbn-features { grid-template-columns: 1fr; } }
        .bbn-feature {
          padding: 32px 40px; border-right: 1px solid var(--border);
        }
        .bbn-feature:last-child { border-right: none; }
        .bbn-feature-val {
          font-family: var(--font-mono); font-size: 28px; font-weight: 700;
          color: var(--green); margin-bottom: 8px;
          text-shadow: 0 0 15px rgba(159,229,86,0.25);
        }
        .bbn-feature-label {
          font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.15em;
          color: var(--muted); text-transform: uppercase;
        }
        .bbn-feature-desc {
          font-family: var(--font-display); font-size: 14px; color: rgba(245,245,245,0.6);
          margin-top: 10px; line-height: 1.5;
        }

        /* ── LOGIN MODAL ── */
        .bbn-modal-backdrop {
          position: fixed; inset: 0; z-index: 100;
          background: rgba(0,0,0,0.85);
          display: flex; align-items: center; justify-content: center;
          padding: 20px;
          backdrop-filter: blur(4px);
        }
        .bbn-modal {
          background: #0a0a0a; border: 1px solid var(--border);
          width: 100%; max-width: 400px; padding: 40px;
          position: relative;
        }
        .bbn-modal-close {
          position: absolute; top: 16px; right: 16px;
          background: transparent; border: none; color: var(--muted);
          font-size: 16px; cursor: pointer; padding: 4px 8px;
          transition: color 0.15s;
        }
        .bbn-modal-close:hover { color: var(--text); }
        .bbn-modal-logo {
          font-family: var(--font-display); font-weight: 900; font-size: 20px;
          letter-spacing: 0.1em; color: var(--text); margin-bottom: 4px;
        }
        .bbn-modal-subtitle {
          font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.2em;
          color: var(--muted); margin-bottom: 32px; text-transform: uppercase;
        }
        .bbn-modal-form { display: flex; flex-direction: column; gap: 16px; }
        .bbn-field { display: flex; flex-direction: column; gap: 6px; }
        .bbn-field label {
          font-family: var(--font-mono); font-size: 9px; letter-spacing: 0.2em;
          color: var(--muted); text-transform: uppercase;
        }
        .bbn-field input {
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1);
          color: var(--text); font-family: var(--font-mono); font-size: 14px;
          padding: 12px 14px; outline: none; width: 100%; transition: border-color 0.2s;
        }
        .bbn-field input::placeholder { color: rgba(245,245,245,0.2); }
        .bbn-field input:focus { border-color: var(--green); }
        .bbn-modal-error {
          font-family: var(--font-mono); font-size: 11px;
          color: var(--red); margin-top: -4px;
        }

        /* Footer */
        .bbn-footer {
          padding: 20px 40px;
          border-top: 1px solid var(--border);
          display: flex; align-items: center; justify-content: space-between;
        }
        .bbn-footer-copy {
          font-family: var(--font-mono); font-size: 10px;
          color: rgba(245,245,245,0.2); letter-spacing: 0.1em;
        }
      `}</style>

      {/* Glow */}
      <div className="bbn-glow" />

      <div className="bbn-page">
        {/* Nav */}
        <nav className="bbn-nav">
          <div className="bbn-nav-logo">BOXBOXNOW</div>
          <div className="bbn-nav-status">
            <span className="bbn-status-dot" />
            COMING SOON · 18.05.26
          </div>
          <button className="bbn-nav-btn" onClick={() => setShowLogin(true)}>
            ACCESO →
          </button>
        </nav>

        {/* Hero */}
        <section className="bbn-hero">
          <p className="bbn-kicker">Karting Endurance · Temporada 2026</p>

          <h1 className="bbn-headline">
            SE ACABARON<br />
            LAS <em>EXCUSAS.</em>
          </h1>

          <p className="bbn-payoff">Strategy · in · real · time.</p>

          {/* Countdown */}
          <div className="bbn-countdown" aria-label="Cuenta atrás hasta el lanzamiento">
            <div className="bbn-cell">
              <span className="bbn-cell-val">{pad(days)}</span>
              <span className="bbn-cell-label">DÍAS</span>
            </div>
            <div className="bbn-cell">
              <span className="bbn-cell-val">{pad(hrs)}</span>
              <span className="bbn-cell-label">HRS</span>
            </div>
            <div className="bbn-cell">
              <span className="bbn-cell-val">{pad(min)}</span>
              <span className="bbn-cell-label">MIN</span>
            </div>
            <div className="bbn-cell">
              <span className="bbn-cell-val">{pad(seg)}</span>
              <span className="bbn-cell-label">SEG</span>
            </div>
          </div>

          {/* Waitlist */}
          <div className="bbn-waitlist">
            <p className="bbn-waitlist-label">
              ¿Quieres ser el primero en saberlo? Déjanos tu email.
            </p>
            <WaitlistForm />
          </div>
        </section>

        {/* Features */}
        <div className="bbn-features">
          <div className="bbn-feature">
            <div className="bbn-feature-val">&lt;100ms</div>
            <div className="bbn-feature-label">LATENCIA</div>
            <div className="bbn-feature-desc">Datos de carrera en tiempo real. Sin retraso, sin excusas.</div>
          </div>
          <div className="bbn-feature">
            <div className="bbn-feature-val">ACTIVA</div>
            <div className="bbn-feature-label">ESTRATEGIA</div>
            <div className="bbn-feature-desc">Paradas, stint timing y clasificación real. Todo en pantalla.</div>
          </div>
          <div className="bbn-feature">
            <div className="bbn-feature-val">360°</div>
            <div className="bbn-feature-label">ANÁLISIS</div>
            <div className="bbn-feature-desc">Vueltas, ritmos, GPS y comparativas. Datos que ganan carreras.</div>
          </div>
        </div>

        {/* Footer */}
        <footer className="bbn-footer">
          <span className="bbn-footer-copy">© 2026 BOXBOXNOW</span>
          <span className="bbn-footer-copy">LANZAMIENTO 18.05.26</span>
        </footer>
      </div>

      {/* Login Modal */}
      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
    </>
  );
}
