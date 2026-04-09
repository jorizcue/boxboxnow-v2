"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await api.forgotPassword(email);
      setSent(true);
    } catch (err: any) {
      setError("Error al enviar el email. Intentalo de nuevo.");
    }
    setLoading(false);
  };

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

        <div className="bg-surface rounded-2xl p-5 sm:p-8 border border-border">
          {sent ? (
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-accent/10 flex items-center justify-center">
                <svg className="w-8 h-8 text-accent" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Email enviado</h2>
              <p className="text-neutral-400 text-sm mb-6">
                Si el email existe en nuestro sistema, recibiras un enlace para restablecer tu contrasena. Revisa tu bandeja de entrada.
              </p>
              <Link
                href="/login"
                className="block w-full bg-accent hover:bg-accent-hover text-black font-semibold py-3 rounded-lg transition-colors tracking-wide"
              >
                Volver al login
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-bold text-white mb-2 text-center">
                Recuperar contrasena
              </h2>
              <p className="text-neutral-400 text-sm mb-6 text-center">
                Introduce tu email y te enviaremos un enlace para restablecer tu contrasena.
              </p>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-[11px] text-neutral-200 mb-1.5 uppercase tracking-wider">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-black border border-border rounded-lg px-4 py-3 text-sm text-white placeholder-neutral-700 focus:outline-none focus:border-accent/50 transition-colors"
                    placeholder="tu@email.com"
                    autoFocus
                    required
                  />
                </div>

                {error && <p className="text-red-400 text-sm">{error}</p>}

                <button
                  type="submit"
                  disabled={loading || !email}
                  className="w-full bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-black font-semibold py-3 rounded-lg transition-colors tracking-wide"
                >
                  {loading ? "Enviando..." : "Enviar enlace"}
                </button>
              </form>
            </>
          )}
        </div>

        <div className="mt-6 text-center">
          <Link href="/login" className="inline-block text-sm text-neutral-500 hover:text-neutral-300 transition-colors">
            &larr; Volver al login
          </Link>
        </div>
      </div>
    </div>
  );
}
