"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";

export function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { setAuth } = useAuth();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const data = await api.login(username, password);
      setAuth(data.access_token, data.user);
    } catch (err: any) {
      setError("Usuario o contrasena incorrectos");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <div className="bg-card rounded-xl p-8 w-full max-w-sm shadow-2xl border border-gray-800">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-accent">BOXBOXNOW</h1>
          <p className="text-gray-500 text-sm mt-1">Race Strategy Dashboard</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Usuario</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-surface border border-gray-700 rounded px-3 py-2.5 text-sm focus:border-accent focus:outline-none"
              placeholder="usuario"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Contrasena</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-surface border border-gray-700 rounded px-3 py-2.5 text-sm focus:border-accent focus:outline-none"
              placeholder="contrasena"
            />
          </div>

          {error && (
            <p className="text-red-500 text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !username || !password}
            className="w-full bg-accent hover:bg-accent/80 disabled:opacity-50 text-white font-medium py-2.5 rounded transition-colors"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
