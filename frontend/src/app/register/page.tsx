"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useSiteStatus } from "@/hooks/useSiteStatus";
import { MaintenancePage } from "@/components/landing/MaintenancePage";
import Link from "next/link";
import { useTracker, useTrackerInit } from "@/hooks/useTracker";
import { ensureVisitorId, getFirstTouch } from "@/lib/visitor";
import { api } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function getPlanFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("plan");
}

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const { token, user, _hydrated } = useAuth();
  const { maintenance, loading: siteLoading } = useSiteStatus();
  const router = useRouter();
  const [pendingPlan] = useState(getPlanFromUrl);
  // Post-register: the new account is UNVERIFIED and has NO trial yet.
  // Instead of auto-logging-in + routing into the (paid) app, we show a
  // "verify your email" screen with a resend. We deliberately do NOT call
  // setAuth here — a token would trip the redirect-to-dashboard effect.
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  // Tracker init for users that landed directly on /register (e.g. from
  // a paid ad with utm_*=...) without ever hitting the homepage. Without
  // this they'd have no visitor_id and the funnel would lose them.
  useTrackerInit();
  const { trackFunnel } = useTracker();

  // Funnel: register.view fires once on mount. register.start fires on
  // the first keystroke in any field — guarded by registerStartFiredRef
  // so the user doesn't trigger it repeatedly while typing.
  const registerStartFiredRef = useRef(false);
  useEffect(() => {
    trackFunnel("register.view", pendingPlan ? { plan: pendingPlan } : undefined);
  }, [trackFunnel, pendingPlan]);

  const markStarted = () => {
    if (registerStartFiredRef.current) return;
    registerStartFiredRef.current = true;
    trackFunnel("register.start", pendingPlan ? { plan: pendingPlan } : undefined);
  };

  // Google social login hidden site-wide on web. Set to true to restore.
  const GOOGLE_AUTH_ENABLED = false;

  // Detect WebView/embedded browsers where Google OAuth is blocked
  const isWebView = typeof navigator !== "undefined" && (
    /Bluefy|WebBLE/i.test(navigator.userAgent) ||
    (/(iPhone|iPod|iPad)/.test(navigator.userAgent) && !/Safari/i.test(navigator.userAgent)) ||
    /wv|WebView/i.test(navigator.userAgent)
  );

  // Store pending plan from query params
  useEffect(() => {
    if (pendingPlan) {
      localStorage.setItem("bbn_pending_plan", pendingPlan);
    }
  }, [pendingPlan]);

  useEffect(() => {
    if (_hydrated && token) {
      router.push("/dashboard");
    }
  }, [_hydrated, token, router]);

  // Maintenance gate — block new registrations during maintenance.
  // Admins (already logged in) bypass; everyone else gets the maintenance
  // page instead of the registration form.
  if (!siteLoading && maintenance && !user?.is_admin) {
    return <MaintenancePage />;
  }

  // Client-side validation
  const validationErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    if (username && username.length < 3) {
      errors.username = "El usuario debe tener al menos 3 caracteres";
    }
    if (password) {
      if (password.length < 8) {
        errors.password = "La contrasena debe tener al menos 8 caracteres";
      } else if (!/[A-Z]/.test(password)) {
        errors.password = "La contrasena debe contener al menos una mayuscula";
      } else if (!/[0-9]/.test(password)) {
        errors.password = "La contrasena debe contener al menos un numero";
      }
    }
    if (confirmPassword && password !== confirmPassword) {
      errors.confirmPassword = "Las contrasenas no coinciden";
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = "Introduce un email valido";
    }
    return errors;
  }, [email, username, password, confirmPassword]);

  const isFormValid =
    email &&
    username &&
    password &&
    confirmPassword &&
    acceptTerms &&
    Object.keys(validationErrors).length === 0 &&
    password === confirmPassword;

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return;

    setError("");
    setFieldErrors({});
    setLoading(true);

    // Pull visitor identity + first-touch attribution so the backend
    // can close the funnel loop (link visitor_id → user_id and stamp
    // the first_utm_* columns on VisitorIdentity).
    const visitorId = ensureVisitorId();
    const ft = getFirstTouch();

    try {
      const res = await fetch(`${API_URL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          username,
          password,
          visitor_id: visitorId,
          utm_source: ft?.utm_source ?? null,
          utm_medium: ft?.utm_medium ?? null,
          utm_campaign: ft?.utm_campaign ?? null,
          referrer: ft?.referrer ?? null,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const detail = body?.detail;

        if (typeof detail === "string") {
          if (detail.toLowerCase().includes("username")) {
            setFieldErrors({ username: "Este nombre de usuario ya esta en uso" });
          } else if (detail.toLowerCase().includes("email")) {
            setFieldErrors({ email: "Este email ya esta registrado" });
          } else {
            setError(detail);
          }
        } else if (Array.isArray(detail)) {
          // FastAPI validation errors
          const mapped: Record<string, string> = {};
          for (const err of detail) {
            const field = err.loc?.[err.loc.length - 1];
            if (field) mapped[field] = err.msg;
          }
          if (Object.keys(mapped).length > 0) {
            setFieldErrors(mapped);
          } else {
            setError("Error al crear la cuenta");
          }
        } else {
          setError("Error al crear la cuenta");
        }
        setLoading(false);
        return;
      }

      // Account created but UNVERIFIED + no trial. Do NOT setAuth /
      // route into the app — show the verify-your-email screen so the
      // user verifies before the trial starts.
      await res.json().catch(() => null);
      setRegisteredEmail(email);
    } catch {
      setError("Error de conexion. Intentalo de nuevo.");
    }
    setLoading(false);
  };

  const handleResend = async () => {
    if (!registeredEmail) return;
    setResending(true);
    try {
      await api.resendVerification(registeredEmail);
    } catch {
      // resend-verification is generic-success by contract.
    }
    setResent(true);
    setResending(false);
  };

  if (!_hydrated) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <span className="text-lg font-bold animate-pulse">
          <span className="text-white">BOXBOX</span>
          <span className="text-accent">NOW</span>
        </span>
      </div>
    );
  }

  if (token) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <span className="text-lg font-bold animate-pulse">
          <span className="text-white">BOXBOX</span>
          <span className="text-accent">NOW</span>
        </span>
      </div>
    );
  }

  // Post-register confirmation: account created but UNVERIFIED with no
  // trial. Show "verify your email" + resend instead of dropping the
  // user into the paid app.
  if (registeredEmail) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm">
          {/* Brand header */}
          <div className="text-center mb-8 sm:mb-10">
            <div className="inline-flex items-center gap-0 mb-2">
              <span className="text-4xl font-bold text-white">BB</span>
              <span className="text-4xl font-bold text-accent">N</span>
            </div>
            <h1 className="text-2xl font-bold tracking-wider text-white">
              BOXBOX<span className="text-accent">NOW</span>
            </h1>
          </div>

          <div className="bg-surface rounded-2xl p-5 sm:p-8 border border-border text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-accent/10 flex items-center justify-center">
              <svg className="w-8 h-8 text-accent" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Verifica tu correo</h2>
            <p className="text-neutral-400 text-sm mb-6">
              Te hemos enviado un correo a{" "}
              <span className="text-white font-medium">{registeredEmail}</span>.
              Verifícalo para empezar tu prueba gratuita.
            </p>

            {resent ? (
              <p className="text-accent text-sm mb-2">
                Si el correo existe, te hemos enviado un nuevo enlace.
              </p>
            ) : (
              <button
                type="button"
                onClick={handleResend}
                disabled={resending}
                className="w-full bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-black font-semibold py-3 rounded-lg transition-colors tracking-wide"
              >
                {resending ? "Enviando..." : "Reenviar correo"}
              </button>
            )}
          </div>

          <div className="mt-6 text-center">
            <Link href="/login" className="inline-block text-sm text-neutral-500 hover:text-neutral-300 transition-colors">
              Ir al login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        {/* Brand header */}
        <div className="text-center mb-8 sm:mb-10">
          <div className="inline-flex items-center gap-0 mb-2">
            <span className="text-4xl font-bold text-white">BB</span>
            <span className="text-4xl font-bold text-accent">N</span>
          </div>
          <h1 className="text-2xl font-bold tracking-wider text-white">
            BOXBOX<span className="text-accent">NOW</span>
          </h1>
          <p className="text-neutral-400 text-xs tracking-widest mt-1 uppercase">
            Crea tu cuenta
          </p>
        </div>

        <div className="bg-surface rounded-2xl p-5 sm:p-8 border border-border">
          {/* Google signup — hidden site-wide (GOOGLE_AUTH_ENABLED) + in WebView */}
          {GOOGLE_AUTH_ENABLED && !isWebView && (
            <>
              <a
                href={`/api/auth/google?mode=register${pendingPlan ? `&plan=${pendingPlan}` : ""}`}
                className="w-full flex items-center justify-center gap-3 bg-white hover:bg-neutral-100 text-neutral-800 font-medium py-3 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Registrarse con Google
              </a>

              {/* Divider */}
              <div className="flex items-center gap-3 my-5">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-neutral-500">o registrate con email</span>
                <div className="flex-1 h-px bg-border" />
              </div>
            </>
          )}
          {GOOGLE_AUTH_ENABLED && isWebView && (
            <p className="mb-4 text-xs text-center text-amber-400/80 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
              Google login no disponible en este navegador. Registrate con email y contrasena.
            </p>
          )}

          <form onSubmit={handleRegister} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-[11px] text-neutral-200 mb-1.5 uppercase tracking-wider">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => { markStarted(); setEmail(e.target.value); }}
                className="w-full bg-black border border-border rounded-lg px-4 py-3 text-sm text-white placeholder-neutral-700 focus:outline-none focus:border-accent/50 transition-colors"
                placeholder="tu@email.com"
                required
                autoFocus
                autoComplete="email"
              />
              {(validationErrors.email || fieldErrors.email) && (
                <p className="text-red-400 text-xs mt-1">{validationErrors.email || fieldErrors.email}</p>
              )}
            </div>

            {/* Username */}
            <div>
              <label className="block text-[11px] text-neutral-200 mb-1.5 uppercase tracking-wider">
                Usuario
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => { markStarted(); setUsername(e.target.value); }}
                className="w-full bg-black border border-border rounded-lg px-4 py-3 text-sm text-white placeholder-neutral-700 focus:outline-none focus:border-accent/50 transition-colors"
                placeholder="tu_usuario"
                required
                minLength={3}
                autoComplete="username"
              />
              {(validationErrors.username || fieldErrors.username) && (
                <p className="text-red-400 text-xs mt-1">{validationErrors.username || fieldErrors.username}</p>
              )}
            </div>

            {/* Password */}
            <div>
              <label className="block text-[11px] text-neutral-200 mb-1.5 uppercase tracking-wider">
                Contrasena
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-black border border-border rounded-lg px-4 py-3 text-sm text-white placeholder-neutral-700 focus:outline-none focus:border-accent/50 transition-colors"
                placeholder="Min. 8 caracteres, 1 mayuscula, 1 numero"
                required
                minLength={8}
                autoComplete="new-password"
              />
              {(validationErrors.password || fieldErrors.password) && (
                <p className="text-red-400 text-xs mt-1">{validationErrors.password || fieldErrors.password}</p>
              )}
            </div>

            {/* Confirm password */}
            <div>
              <label className="block text-[11px] text-neutral-200 mb-1.5 uppercase tracking-wider">
                Confirmar contrasena
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-black border border-border rounded-lg px-4 py-3 text-sm text-white placeholder-neutral-700 focus:outline-none focus:border-accent/50 transition-colors"
                placeholder="Repite la contrasena"
                required
                autoComplete="new-password"
              />
              {validationErrors.confirmPassword && (
                <p className="text-red-400 text-xs mt-1">{validationErrors.confirmPassword}</p>
              )}
            </div>

            {/* Terms checkbox */}
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={acceptTerms}
                onChange={(e) => setAcceptTerms(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-border bg-black text-accent focus:ring-accent/50 focus:ring-offset-0"
              />
              <span className="text-xs text-neutral-400 group-hover:text-neutral-300 transition-colors leading-relaxed">
                Acepto los{" "}
                <a href="https://boxboxnow.com/cookies" target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover underline">
                  términos de servicio
                </a>{" "}
                y la{" "}
                <a href="https://boxboxnow.com/privacidad" target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover underline">
                  política de privacidad
                </a>
              </span>
            </label>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <button
              type="submit"
              disabled={loading || !isFormValid}
              className="w-full bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-black font-semibold py-3 rounded-lg transition-colors tracking-wide"
            >
              {loading ? "Creando cuenta..." : "Crear cuenta"}
            </button>
          </form>
        </div>

        {/* Links */}
        <div className="mt-6 text-center space-y-3">
          <p className="text-sm text-neutral-400">
            Ya tienes cuenta?{" "}
            <Link href="/login" className="text-accent hover:text-accent-hover transition-colors font-medium">
              Inicia sesion
            </Link>
          </p>
          <Link href="/" className="inline-block text-sm text-neutral-500 hover:text-neutral-300 transition-colors">
            &larr; Volver
          </Link>
        </div>
      </div>
    </div>
  );
}
