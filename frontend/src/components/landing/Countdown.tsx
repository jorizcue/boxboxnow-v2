"use client";

import { useState, useEffect, useRef } from "react";
import { useLangStore, LANGUAGES } from "@/lib/i18n";
import type { Language } from "@/lib/i18n";

// ─── Landing translations ─────────────────────────────────────────────────────

const lt: Record<string, Record<Language, string>> = {
  // Nav
  comingSoon:       { es: "COMING SOON · 18.05.26",        en: "COMING SOON · 18.05.26",          it: "COMING SOON · 18.05.26",          de: "COMING SOON · 18.05.26",            fr: "COMING SOON · 18.05.26"            },
  access:           { es: "ACCESO →",                       en: "ACCESS →",                         it: "ACCESSO →",                        de: "ZUGANG →",                          fr: "ACCÈS →"                           },
  // Hero
  kicker:           { es: "Karting Endurance · Temporada 2026", en: "Karting Endurance · Season 2026", it: "Karting Endurance · Stagione 2026", de: "Karting Endurance · Saison 2026", fr: "Karting Endurance · Saison 2026" },
  headline1:        { es: "SE ACABARON",                    en: "NO MORE",                          it: "BASTA CON",                        de: "KEINE",                             fr: "FINI"                              },
  headline2:        { es: "LAS EXCUSAS.",                   en: "EXCUSES.",                         it: "LE SCUSE.",                        de: "AUSREDEN.",                         fr: "LES EXCUSES."                      },
  payoff:           { es: "Estrategia · en · tiempo · real.", en: "Strategy · in · real · time.",   it: "Strategia · in · tempo · reale.",  de: "Strategie · in · Echtzeit.",        fr: "Stratégie · en · temps · réel."   },
  // Countdown
  days:             { es: "DÍAS",  en: "DAYS",  it: "GIORNI", de: "TAGE", fr: "JOURS" },
  hrs:              { es: "HRS",   en: "HRS",   it: "ORE",    de: "STD",  fr: "HRS"   },
  min:              { es: "MIN",   en: "MIN",   it: "MIN",    de: "MIN",  fr: "MIN"   },
  seg:              { es: "SEG",   en: "SEC",   it: "SEC",    de: "SEK",  fr: "SEC"   },
  // Waitlist
  waitlistLabel:    { es: "¿Quieres ser el primero en saberlo? Déjanos tu email.", en: "Want to be the first to know? Leave us your email.", it: "Vuoi essere il primo a saperlo? Lasciaci la tua email.", de: "Als Erster informiert sein? Hinterlasse deine E-Mail.", fr: "Vous voulez être le premier informé ? Laissez-nous votre email." },
  namePlaceholder:  { es: "Tu nombre (opcional)",           en: "Your name (optional)",             it: "Il tuo nome (opzionale)",          de: "Dein Name (optional)",              fr: "Votre nom (facultatif)"            },
  emailPlaceholder: { es: "tu@email.com",                   en: "you@email.com",                    it: "tu@email.com",                     de: "du@email.com",                      fr: "vous@email.com"                    },
  waitlistBtn:      { es: "QUIERO ESTAR AHÍ →",             en: "KEEP ME POSTED →",                 it: "VOGLIO ESSERCI →",                 de: "AUF DEM LAUFENDEN →",               fr: "JE VEUX EN ÊTRE →"                 },
  sending:          { es: "ENVIANDO...",                    en: "SENDING...",                       it: "INVIO...",                         de: "SENDEN...",                         fr: "ENVOI..."                          },
  successMsg:       { es: "RECIBIDO. Te avisamos el 18.05.26.",          en: "RECEIVED. We'll notify you on 18.05.26.",    it: "RICEVUTO. Ti avvisiamo il 18.05.26.",         de: "ERHALTEN. Wir benachrichtigen dich am 18.05.26.",   fr: "REÇU. Nous vous prévenons le 18.05.26." },
  alreadyMsg:       { es: "Ya estás en la lista. ¡Hasta el 18.05.26!",  en: "You're already on the list. See you on 18.05.26!", it: "Sei già nella lista. A presto il 18.05.26!", de: "Du bist bereits auf der Liste. Bis zum 18.05.26!",  fr: "Vous êtes déjà sur la liste. À bientôt le 18.05.26 !" },
  formError:        { es: "Error al enviar. Inténtalo de nuevo.",        en: "Error sending. Please try again.",          it: "Errore nell'invio. Riprova.",                 de: "Sendefehler. Bitte versuche es erneut.",            fr: "Erreur lors de l'envoi. Réessayez." },
  // Features
  latencyLabel:     { es: "LATENCIA",   en: "LATENCY",   it: "LATENZA",   de: "LATENZ",    fr: "LATENCE"   },
  latencyDesc:      { es: "Datos de carrera en tiempo real. Sin retraso, sin excusas.",   en: "Race data in real time. No delay, no excuses.",      it: "Dati di gara in tempo reale. Nessun ritardo, nessuna scusa.", de: "Renndaten in Echtzeit. Keine Verzögerung, keine Ausreden.", fr: "Données de course en temps réel. Sans retard, sans excuses." },
  strategyVal:      { es: "ACTIVA",     en: "ACTIVE",    it: "ATTIVA",    de: "AKTIV",     fr: "ACTIVE"    },
  strategyLabel:    { es: "ESTRATEGIA", en: "STRATEGY",  it: "STRATEGIA", de: "STRATEGIE", fr: "STRATÉGIE" },
  strategyDesc:     { es: "Paradas, stint timing y clasificación real. Todo en pantalla.", en: "Pit stops, stint timing and real classification. All on screen.", it: "Soste, stint timing e classifica reale. Tutto sullo schermo.", de: "Stopps, Stint-Timing und echte Klassifizierung. Alles auf dem Bildschirm.", fr: "Arrêts, timing des relais et classement réel. Tout à l'écran." },
  analysisLabel:    { es: "ANÁLISIS",   en: "ANALYSIS",  it: "ANALISI",   de: "ANALYSE",   fr: "ANALYSE"   },
  analysisDesc:     { es: "Vueltas, ritmos, GPS y comparativas. Datos que ganan carreras.", en: "Laps, pace, GPS and comparisons. Data that wins races.", it: "Giri, ritmo, GPS e confronti. Dati che vincono le gare.", de: "Runden, Tempo, GPS und Vergleiche. Daten, die Rennen gewinnen.", fr: "Tours, rythmes, GPS et comparatifs. Les données qui font gagner." },
  // Login modal
  exclusiveAccess:  { es: "Acceso exclusivo",    en: "Exclusive access",    it: "Accesso esclusivo",    de: "Exklusiver Zugang",     fr: "Accès exclusif"        },
  userLabel:        { es: "USUARIO",             en: "USERNAME",            it: "UTENTE",               de: "BENUTZER",              fr: "IDENTIFIANT"           },
  passLabel:        { es: "CONTRASEÑA",          en: "PASSWORD",            it: "PASSWORD",             de: "PASSWORT",              fr: "MOT DE PASSE"          },
  userPlaceholder:  { es: "tu_usuario",          en: "your_username",       it: "il_tuo_utente",        de: "dein_benutzer",         fr: "votre_identifiant"     },
  loginBtn:         { es: "ENTRAR →",            en: "LOGIN →",             it: "ACCEDI →",             de: "ANMELDEN →",            fr: "CONNEXION →"           },
  verifying:        { es: "VERIFICANDO...",      en: "VERIFYING...",        it: "VERIFICA...",          de: "PRÜFEN...",             fr: "VÉRIFICATION..."       },
  loginError:       { es: "Credenciales incorrectas",    en: "Invalid credentials",     it: "Credenziali errate",      de: "Ungültige Anmeldedaten",  fr: "Identifiants incorrects" },
  connectionError:  { es: "Error de conexión. Inténtalo de nuevo.", en: "Connection error. Please try again.", it: "Errore di connessione. Riprova.", de: "Verbindungsfehler. Versuche es erneut.", fr: "Erreur de connexion. Réessayez." },
  // Footer
  launch:           { es: "LANZAMIENTO 18.05.26", en: "LAUNCH 18.05.26",  it: "LANCIO 18.05.26",    de: "LAUNCH 18.05.26",       fr: "LANCEMENT 18.05.26"    },
  privacy:          { es: "POLÍTICA DE PRIVACIDAD", en: "PRIVACY POLICY", it: "INFORMATIVA PRIVACY", de: "DATENSCHUTZ",           fr: "POLITIQUE DE CONFIDENTIALITÉ" },
  cookies:          { es: "POLÍTICA DE COOKIES",  en: "COOKIE POLICY",    it: "COOKIE POLICY",      de: "COOKIE-RICHTLINIE",     fr: "POLITIQUE DE COOKIES"  },
};

function T(lang: Language, key: string): string {
  return lt[key]?.[lang] ?? lt[key]?.["es"] ?? key;
}

// ─── Countdown helpers ────────────────────────────────────────────────────────

// Default fallback if the server doesn't provide a launch date — keeps the
// component renderable in dev / when the public site-status endpoint fails.
const DEFAULT_LAUNCH = new Date("2026-05-18T09:00:00Z");

function useCountdown(target: Date) {
  const [diff, setDiff] = useState(0);
  useEffect(() => {
    const tick = () => setDiff(Math.max(0, target.getTime() - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);
  const totalSec = Math.floor(diff / 1000);
  const days = Math.floor(totalSec / 86400);
  const hrs  = Math.floor((totalSec % 86400) / 3600);
  const min  = Math.floor((totalSec % 3600) / 60);
  const seg  = totalSec % 60;
  return { days, hrs, min, seg };
}

// ─── Login Modal ─────────────────────────────────────────────────────────────

function LoginModal({ onClose, lang }: { onClose: () => void; lang: Language }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

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
        try { setError(JSON.parse(body).detail || T(lang, "loginError")); }
        catch { setError(T(lang, "loginError")); }
        return;
      }
      const data = await res.json();
      localStorage.setItem(
        "boxboxnow-auth",
        JSON.stringify({ state: { token: data.token, user: null }, version: 0 })
      );
      // After login, land on `/`. The homepage switch (app/page.tsx) sees
      // the new auth token and renders MarketingHome instead of the
      // countdown — admins can then click through to /dashboard.
      window.location.href = "/";
    } catch {
      setError(T(lang, "connectionError"));
    } finally {
      setLoading(false);
    }
  };

  const backdropRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={backdropRef}
      className="bbn-modal-backdrop"
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
    >
      <div className="bbn-modal">
        <button className="bbn-modal-close" onClick={onClose} aria-label="Cerrar">✕</button>
        <div className="bbn-modal-logo">BOXBOX<em>NOW</em></div>
        <p className="bbn-modal-subtitle">{T(lang, "exclusiveAccess")}</p>
        <form onSubmit={handleLogin} className="bbn-modal-form">
          <div className="bbn-field">
            <label>{T(lang, "userLabel")}</label>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder={T(lang, "userPlaceholder")} autoComplete="username" required />
          </div>
          <div className="bbn-field">
            <label>{T(lang, "passLabel")}</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" required />
          </div>
          {error && <p className="bbn-modal-error">{error}</p>}
          <button type="submit" className="bbn-btn-primary" disabled={loading}>
            {loading ? T(lang, "verifying") : T(lang, "loginBtn")}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Waitlist Form ────────────────────────────────────────────────────────────

function WaitlistForm({ lang }: { lang: Language }) {
  const [name, setName]   = useState("");
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

  if (status === "done" || status === "already") {
    return (
      <div className="bbn-waitlist-success">
        <span className="bbn-pulse-dot" />
        <p>{T(lang, status === "done" ? "successMsg" : "alreadyMsg")}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bbn-waitlist-form">
      <div className="bbn-waitlist-fields">
        <input type="text"  placeholder={T(lang, "namePlaceholder")}  value={name}  onChange={(e) => setName(e.target.value)}  className="bbn-input" />
        <input type="email" placeholder={T(lang, "emailPlaceholder")} value={email} onChange={(e) => setEmail(e.target.value)} required className="bbn-input" />
      </div>
      {status === "error" && <p className="bbn-form-error">{T(lang, "formError")}</p>}
      <button type="submit" className="bbn-btn-primary" disabled={status === "loading"}>
        {status === "loading" ? T(lang, "sending") : T(lang, "waitlistBtn")}
      </button>
    </form>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

interface CountdownProps {
  /** When to count down to. If undefined, falls back to DEFAULT_LAUNCH. */
  launchDate?: Date | null;
}

export function Countdown({ launchDate }: CountdownProps = {}) {
  const target = launchDate ?? DEFAULT_LAUNCH;
  const [showLogin, setShowLogin] = useState(false);
  const { days, hrs, min, seg }   = useCountdown(target);
  const { lang, setLang }         = useLangStore();

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <>
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

        .bbn-glow {
          position: fixed; top: -20vh; left: 50%; transform: translateX(-50%);
          width: 80vw; height: 60vh; z-index: 0; pointer-events: none;
          background: radial-gradient(ellipse at center, rgba(159,229,86,0.12) 0%, transparent 70%);
        }

        .bbn-page { position: relative; z-index: 1; min-height: 100vh; display: flex; flex-direction: column; }

        /* Nav */
        .bbn-nav {
          display: flex; align-items: center; justify-content: space-between;
          padding: 20px 40px; border-bottom: 1px solid var(--border);
          gap: 16px; flex-wrap: wrap;
        }
        @media (max-width: 600px) { .bbn-nav { padding: 16px 20px; } }
        .bbn-nav-logo {
          font-family: var(--font-display); font-weight: 900; font-size: 18px;
          letter-spacing: 0.1em; color: var(--text);
        }
        .bbn-nav-logo em { font-style: normal; color: var(--green); }
        .bbn-nav-center {
          display: flex; align-items: center; gap: 16px; flex: 1; justify-content: center;
          flex-wrap: wrap;
        }
        .bbn-nav-status {
          font-family: var(--font-mono); font-size: 11px; color: var(--muted);
          letter-spacing: 0.15em; display: flex; align-items: center; gap: 8px;
        }
        .bbn-status-dot {
          width: 6px; height: 6px; border-radius: 50%; background: var(--green);
          box-shadow: 0 0 8px var(--green); animation: blink 2s ease-in-out infinite;
        }
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

        /* Language switcher */
        .bbn-lang-switcher { display: flex; align-items: center; gap: 4px; }
        .bbn-lang-btn {
          background: transparent; border: 1px solid transparent; border-radius: 4px;
          padding: 3px 6px; font-size: 14px; cursor: pointer; line-height: 1;
          transition: all 0.15s; opacity: 0.45;
        }
        .bbn-lang-btn:hover { opacity: 0.85; border-color: rgba(159,229,86,0.3); }
        .bbn-lang-btn.active { opacity: 1; border-color: var(--green); background: rgba(159,229,86,0.08); }

        .bbn-nav-right { display: flex; align-items: center; gap: 12px; }
        .bbn-nav-btn {
          font-family: var(--font-mono); font-size: 12px; font-weight: 700;
          letter-spacing: 0.1em; color: var(--green); background: transparent;
          border: 1px solid var(--green); padding: 8px 20px; cursor: pointer;
          transition: all 0.2s; white-space: nowrap;
        }
        .bbn-nav-btn:hover { background: var(--green); color: #000; }

        /* Hero */
        .bbn-hero {
          flex: 1; display: flex; flex-direction: column; align-items: center;
          justify-content: center; padding: 80px 40px 60px; text-align: center;
        }
        @media (max-width: 600px) { .bbn-hero { padding: 60px 20px 40px; } }
        .bbn-kicker {
          font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.25em;
          color: var(--muted); margin-bottom: 32px; text-transform: uppercase;
        }
        .bbn-headline {
          font-family: var(--font-display); font-weight: 900;
          font-size: clamp(52px, 10vw, 120px);
          line-height: 0.92; letter-spacing: -0.02em;
          color: var(--text); text-transform: uppercase; margin-bottom: 32px;
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
          display: flex; gap: 1px; margin-bottom: 64px; border: 1px solid var(--border);
        }
        .bbn-cell {
          display: flex; flex-direction: column; align-items: center;
          padding: 20px 32px; background: rgba(255,255,255,0.02); min-width: 100px;
        }
        @media (max-width: 480px) { .bbn-cell { padding: 14px 18px; min-width: 68px; } }
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

        /* Waitlist */
        .bbn-waitlist { width: 100%; max-width: 640px; margin: 0 auto 80px; padding: 0 20px; }
        .bbn-waitlist-label {
          font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.2em;
          color: var(--muted); text-align: center; margin-bottom: 20px; text-transform: uppercase;
        }
        .bbn-waitlist-form { display: flex; flex-direction: column; gap: 12px; }
        .bbn-waitlist-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        @media (max-width: 600px) { .bbn-waitlist-fields { grid-template-columns: 1fr; } }

        .bbn-input {
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1);
          color: var(--text); font-family: var(--font-mono); font-size: 13px;
          padding: 14px 16px; outline: none; width: 100%; transition: border-color 0.2s;
        }
        .bbn-input::placeholder { color: rgba(245,245,245,0.25); }
        .bbn-input:focus { border-color: var(--green); }

        .bbn-btn-primary {
          font-family: var(--font-mono); font-size: 13px; font-weight: 700;
          letter-spacing: 0.12em; color: #000; background: var(--green);
          border: none; padding: 16px 32px; cursor: pointer;
          transition: all 0.2s; width: 100%;
        }
        .bbn-btn-primary:hover:not(:disabled) { background: #b6f06b; box-shadow: 0 0 30px rgba(159,229,86,0.3); }
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

        /* Features */
        .bbn-features { display: grid; grid-template-columns: repeat(3, 1fr); border-top: 1px solid var(--border); }
        @media (max-width: 768px) { .bbn-features { grid-template-columns: 1fr; } }
        .bbn-feature { padding: 32px 40px; border-right: 1px solid var(--border); }
        .bbn-feature:last-child { border-right: none; }
        @media (max-width: 768px) { .bbn-feature { border-right: none; border-bottom: 1px solid var(--border); } }
        .bbn-feature-val {
          font-family: var(--font-mono); font-size: 28px; font-weight: 700;
          color: var(--green); margin-bottom: 8px; text-shadow: 0 0 15px rgba(159,229,86,0.25);
        }
        .bbn-feature-label {
          font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.15em;
          color: var(--muted); text-transform: uppercase;
        }
        .bbn-feature-desc {
          font-family: var(--font-display); font-size: 14px; color: rgba(245,245,245,0.6);
          margin-top: 10px; line-height: 1.5;
        }

        /* Login modal */
        .bbn-modal-backdrop {
          position: fixed; inset: 0; z-index: 100; background: rgba(0,0,0,0.85);
          display: flex; align-items: center; justify-content: center; padding: 20px;
          backdrop-filter: blur(4px);
        }
        .bbn-modal {
          background: #0a0a0a; border: 1px solid var(--border);
          width: 100%; max-width: 400px; padding: 40px; position: relative;
        }
        .bbn-modal-close {
          position: absolute; top: 16px; right: 16px; background: transparent;
          border: none; color: var(--muted); font-size: 16px; cursor: pointer;
          padding: 4px 8px; transition: color 0.15s;
        }
        .bbn-modal-close:hover { color: var(--text); }
        .bbn-modal-logo {
          font-family: var(--font-display); font-weight: 900; font-size: 20px;
          letter-spacing: 0.1em; color: var(--text); margin-bottom: 4px;
        }
        .bbn-modal-logo em { font-style: normal; color: var(--green); }
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
          font-family: var(--font-mono); font-size: 11px; color: var(--red); margin-top: -4px;
        }

        /* Footer */
        .bbn-footer {
          padding: 20px 40px; border-top: 1px solid var(--border);
          display: flex; align-items: center; justify-content: space-between;
          flex-wrap: wrap; gap: 12px;
        }
        @media (max-width: 600px) { .bbn-footer { padding: 16px 20px; } }
        .bbn-footer-copy {
          font-family: var(--font-mono); font-size: 10px;
          color: rgba(245,245,245,0.2); letter-spacing: 0.1em;
        }
        .bbn-footer-links { display: flex; align-items: center; gap: 20px; }
        .bbn-footer-link {
          font-family: var(--font-mono); font-size: 10px;
          color: rgba(245,245,245,0.2); letter-spacing: 0.1em;
          text-decoration: none; transition: color 0.15s;
        }
        .bbn-footer-link:hover { color: rgba(245,245,245,0.55); }

        /* Instagram social link */
        .bbn-instagram {
          display: flex; align-items: center; justify-content: center; gap: 8px;
          font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.18em;
          color: rgba(245,245,245,0.28); text-decoration: none; margin-bottom: 52px;
          transition: color 0.2s;
        }
        .bbn-instagram:hover { color: var(--green); }
      `}</style>

      <div className="bbn-glow" />

      <div className="bbn-page">
        {/* Nav */}
        <nav className="bbn-nav">
          <div className="bbn-nav-logo">BOXBOX<em>NOW</em></div>

          <div className="bbn-nav-center">
            <div className="bbn-nav-status">
              <span className="bbn-status-dot" />
              {T(lang, "comingSoon")}
            </div>
            <div className="bbn-lang-switcher">
              {LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  className={`bbn-lang-btn${lang === l.code ? " active" : ""}`}
                  onClick={() => setLang(l.code)}
                  title={l.label}
                >
                  {l.flag}
                </button>
              ))}
            </div>
          </div>

          <div className="bbn-nav-right">
            <button className="bbn-nav-btn" onClick={() => setShowLogin(true)}>
              {T(lang, "access")}
            </button>
          </div>
        </nav>

        {/* Hero */}
        <section className="bbn-hero">
          <p className="bbn-kicker">{T(lang, "kicker")}</p>

          <h1 className="bbn-headline">
            {T(lang, "headline1")}<br />
            <em>{T(lang, "headline2")}</em>
          </h1>

          <p className="bbn-payoff">{T(lang, "payoff")}</p>

          {/* Countdown */}
          <div className="bbn-countdown" aria-label="Cuenta atrás hasta el lanzamiento">
            <div className="bbn-cell">
              <span className="bbn-cell-val">{pad(days)}</span>
              <span className="bbn-cell-label">{T(lang, "days")}</span>
            </div>
            <div className="bbn-cell">
              <span className="bbn-cell-val">{pad(hrs)}</span>
              <span className="bbn-cell-label">{T(lang, "hrs")}</span>
            </div>
            <div className="bbn-cell">
              <span className="bbn-cell-val">{pad(min)}</span>
              <span className="bbn-cell-label">{T(lang, "min")}</span>
            </div>
            <div className="bbn-cell">
              <span className="bbn-cell-val">{pad(seg)}</span>
              <span className="bbn-cell-label">{T(lang, "seg")}</span>
            </div>
          </div>

          {/* Instagram */}
          <a
            href="https://www.instagram.com/boxboxnow.app"
            target="_blank"
            rel="noopener noreferrer"
            className="bbn-instagram"
            aria-label="Síguenos en Instagram @boxboxnow.app"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
              <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
              <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
            </svg>
            @boxboxnow.app
          </a>

          {/* Waitlist */}
          <div className="bbn-waitlist">
            <p className="bbn-waitlist-label">{T(lang, "waitlistLabel")}</p>
            <WaitlistForm lang={lang} />
          </div>
        </section>

        {/* Features */}
        <div className="bbn-features">
          <div className="bbn-feature">
            <div className="bbn-feature-val">&lt;100ms</div>
            <div className="bbn-feature-label">{T(lang, "latencyLabel")}</div>
            <div className="bbn-feature-desc">{T(lang, "latencyDesc")}</div>
          </div>
          <div className="bbn-feature">
            <div className="bbn-feature-val">{T(lang, "strategyVal")}</div>
            <div className="bbn-feature-label">{T(lang, "strategyLabel")}</div>
            <div className="bbn-feature-desc">{T(lang, "strategyDesc")}</div>
          </div>
          <div className="bbn-feature">
            <div className="bbn-feature-val">360°</div>
            <div className="bbn-feature-label">{T(lang, "analysisLabel")}</div>
            <div className="bbn-feature-desc">{T(lang, "analysisDesc")}</div>
          </div>
        </div>

        {/* Footer */}
        <footer className="bbn-footer">
          <span className="bbn-footer-copy">© 2026 BOXBOXNOW</span>
          <div className="bbn-footer-links">
            <a href="/privacidad" className="bbn-footer-link">{T(lang, "privacy")}</a>
            <a href="/cookies"    className="bbn-footer-link">{T(lang, "cookies")}</a>
            <a
              href="https://www.instagram.com/boxboxnow.app"
              target="_blank"
              rel="noopener noreferrer"
              className="bbn-footer-link"
              style={{ display: "flex", alignItems: "center", gap: "5px" }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
              </svg>
              @boxboxnow.app
            </a>
          </div>
          <span className="bbn-footer-copy">{T(lang, "launch")}</span>
        </footer>
      </div>

      {showLogin && <LoginModal onClose={() => setShowLogin(false)} lang={lang} />}
    </>
  );
}
