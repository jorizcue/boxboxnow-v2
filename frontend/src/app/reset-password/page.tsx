"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      setError("Enlace invalido. Solicita un nuevo enlace de recuperacion.");
    }
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Las contrasenas no coinciden");
      return;
    }
    if (password.length < 8) {
      setError("La contrasena debe tener al menos 8 caracteres");
      return;
    }
    if (!/[A-Z]/.test(password)) {
      setError("La contrasena debe contener al menos una mayuscula");
      return;
    }
    if (!/[0-9]/.test(password)) {
      setError("La contrasena debe contener al menos un numero");
      return;
    }

    setLoading(true);

    try {
      await api.resetPassword(token, password);
      setSuccess(true);
    } catch (err: any) {
      const msg = err.message || "";
      if (msg.includes("expirado") || msg.includes("invalido")) {
        setError("El enlace ha expirado o es invalido. Solicita uno nuevo.");
      } else {
        setError("Error al restablecer la contrasena. Intentalo de nuevo.");
      }
    }
    setLoading(false);
  };

  return (
    <div className="bg-surface rounded-2xl p-5 sm:p-8 border border-border">
      {success ? (
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-accent/10 flex items-center justify-center">
            <svg className="w-8 h-8 text-accent" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Contrasena actualizada</h2>
          <p className="text-neutral-400 text-sm mb-6">
            Tu contrasena ha sido restablecida correctamente. Ya puedes iniciar sesion.
          </p>
          <Link
            href="/login"
            className="block w-full bg-accent hover:bg-accent-hover text-black font-semibold py-3 rounded-lg transition-colors tracking-wide"
          >
            Ir al login
          </Link>
        </div>
      ) : (
        <>
          <h2 className="text-xl font-bold text-white mb-2 text-center">
            Nueva contrasena
          </h2>
          <p className="text-neutral-400 text-sm mb-6 text-center">
            Introduce tu nueva contrasena.
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-[11px] text-neutral-200 mb-1.5 uppercase tracking-wider">
                Nueva contrasena
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-black border border-border rounded-lg px-4 py-3 text-sm text-white placeholder-neutral-700 focus:outline-none focus:border-accent/50 transition-colors"
                placeholder="Min. 8 caracteres"
                autoFocus
                required
              />
            </div>

            <div>
              <label className="block text-[11px] text-neutral-200 mb-1.5 uppercase tracking-wider">
                Confirmar contrasena
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-black border border-border rounded-lg px-4 py-3 text-sm text-white placeholder-neutral-700 focus:outline-none focus:border-accent/50 transition-colors"
                placeholder="Repetir contrasena"
                required
              />
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <button
              type="submit"
              disabled={loading || !password || !confirmPassword || !token}
              className="w-full bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-black font-semibold py-3 rounded-lg transition-colors tracking-wide"
            >
              {loading ? "Actualizando..." : "Restablecer contrasena"}
            </button>
          </form>
        </>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
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

        <Suspense fallback={
          <div className="bg-surface rounded-2xl p-5 sm:p-8 border border-border text-center">
            <span className="text-neutral-400 text-sm">Cargando...</span>
          </div>
        }>
          <ResetPasswordForm />
        </Suspense>

        <div className="mt-6 text-center">
          <Link href="/login" className="inline-block text-sm text-neutral-500 hover:text-neutral-300 transition-colors">
            &larr; Volver al login
          </Link>
        </div>
      </div>
    </div>
  );
}
