"use client";

/**
 * Admin → Ranking panel.
 *
 * Listing of the Glicko-2 driver leaderboard, search + merge tools, and
 * a button to trigger the backend's incremental backfill of new
 * recordings. Only admin users see this — it lives under the
 * admin-hub umbrella in the sidebar.
 *
 * Data sources:
 *   - GET /api/admin/ranking/top      → leaderboard
 *   - GET /api/admin/ranking/search?q=  → name search for merges
 *   - POST /api/admin/ranking/merge   → fold one driver into another
 *   - POST /api/admin/ranking/reprocess → scan recordings/ for new logs
 *
 * Ratings come straight from the backend's Glicko-2 implementation
 * (see backend/app/services/ranking/). RD (rating deviation) is the
 * confidence interval — small RD = stable rating, big RD = early in
 * the data. We surface both so the operator knows whose rating to
 * trust.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type RankingTopRow, type RankingSearchRow } from "@/lib/api";

function ratingBadge(rating: number): string {
  // Crude tier display — colour reflects the rating bracket. Same
  // breakpoints as Glicko-2's traditional bands (1500 = average).
  if (rating >= 1900) return "bg-emerald-500/15 text-emerald-300 border-emerald-500/40";
  if (rating >= 1700) return "bg-lime-500/15 text-lime-300 border-lime-500/40";
  if (rating >= 1550) return "bg-amber-500/15 text-amber-300 border-amber-500/40";
  if (rating >= 1400) return "bg-orange-500/15 text-orange-300 border-orange-500/40";
  return "bg-rose-500/15 text-rose-300 border-rose-500/40";
}

export function AdminRankingPanel() {
  const [rows, setRows] = useState<RankingTopRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(100);
  const [minSessions, setMinSessions] = useState(2);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<RankingSearchRow[]>([]);
  const [mergeMode, setMergeMode] = useState<{ from: RankingSearchRow | null }>({ from: null });
  const [reprocessStatus, setReprocessStatus] = useState<string | null>(null);
  const [reprocessing, setReprocessing] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.rankingAdminTop(limit, minSessions);
      setRows(data.drivers);
    } catch (e: any) {
      setError(e.message || "Error cargando ranking");
    } finally {
      setLoading(false);
    }
  }, [limit, minSessions]);

  useEffect(() => { reload(); }, [reload]);

  // Live search — fires on every change with > 1 char.
  useEffect(() => {
    if (!search.trim() || search.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    api.rankingAdminSearch(search.trim())
      .then((data) => { if (!cancelled) setSearchResults(data.drivers); })
      .catch(() => { if (!cancelled) setSearchResults([]); });
    return () => { cancelled = true; };
  }, [search]);

  const handleStartMerge = (d: RankingSearchRow) => {
    setMergeMode({ from: d });
  };

  const handleMergeInto = async (intoId: number, intoName: string) => {
    if (!mergeMode.from) return;
    const ok = window.confirm(
      `Combinar "${mergeMode.from.canonical_name}" dentro de "${intoName}"?\n\n` +
      `Se moverán todas las sesiones y alias del primero al segundo. El piloto fuente desaparece. ` +
      `El rating del destino NO se recalcula — mantiene su valor actual.`
    );
    if (!ok) return;
    try {
      await api.rankingAdminMerge(intoId, mergeMode.from.driver_id);
      setMergeMode({ from: null });
      setSearch("");
      setSearchResults([]);
      await reload();
    } catch (e: any) {
      alert("Error: " + (e.message || "merge_failed"));
    }
  };

  const handleReprocess = async () => {
    if (reprocessing) return;
    setReprocessing(true);
    setReprocessStatus("Procesando logs pendientes…");
    try {
      const result = await api.rankingAdminReprocess();
      setReprocessStatus(
        `Hecho. ${result.processed} logs nuevos, ${result.skipped} ya procesados ` +
        `(de ${result.total_candidates} totales).`
      );
      await reload();
    } catch (e: any) {
      setReprocessStatus("Error: " + (e.message || "reprocess_failed"));
    } finally {
      setReprocessing(false);
    }
  };

  const ratingStats = useMemo(() => {
    if (!rows.length) return null;
    const ratings = rows.map((r) => r.rating);
    return {
      count: rows.length,
      max: Math.max(...ratings),
      min: Math.min(...ratings),
      avg: ratings.reduce((a, b) => a + b, 0) / ratings.length,
    };
  }, [rows]);

  return (
    <div className="p-4 sm:p-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-lg font-semibold text-white">Ranking de pilotos (Glicko-2)</h2>
          <p className="text-sm text-neutral-400 mt-0.5">
            Ratings derivados de todas las sesiones grabadas. Identificación por nombre normalizado;
            usa <em>Buscar y combinar</em> para unir alias del mismo piloto.
          </p>
        </div>
        <button
          onClick={handleReprocess}
          disabled={reprocessing}
          className="border border-border rounded-lg px-3 py-1.5 text-sm text-neutral-300 hover:text-white hover:border-accent transition-colors disabled:opacity-50"
        >
          {reprocessing ? "Procesando…" : "Procesar logs nuevos"}
        </button>
      </div>

      {reprocessStatus && (
        <div className="mb-4 text-xs text-neutral-400 bg-surface border border-border rounded-lg px-3 py-2">
          {reprocessStatus}
        </div>
      )}

      {ratingStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          <Stat label="Pilotos rankeados" value={String(ratingStats.count)} />
          <Stat label="Mejor rating" value={ratingStats.max.toFixed(0)} />
          <Stat label="Peor rating" value={ratingStats.min.toFixed(0)} />
          <Stat label="Media" value={ratingStats.avg.toFixed(0)} />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4 text-sm">
        <label className="text-neutral-400">Mostrar top</label>
        <select
          value={limit}
          onChange={(e) => setLimit(parseInt(e.target.value, 10))}
          className="bg-surface border border-border rounded-lg px-2 py-1 text-white"
        >
          <option value={50}>50</option>
          <option value={100}>100</option>
          <option value={250}>250</option>
          <option value={500}>500</option>
        </select>
        <label className="text-neutral-400 ml-3">Mín. sesiones</label>
        <select
          value={minSessions}
          onChange={(e) => setMinSessions(parseInt(e.target.value, 10))}
          className="bg-surface border border-border rounded-lg px-2 py-1 text-white"
        >
          <option value={1}>1 (incluye novatos)</option>
          <option value={2}>2</option>
          <option value={3}>3</option>
          <option value={5}>5 (más confiables)</option>
        </select>
      </div>

      {/* Search + merge */}
      <div className="bg-surface border border-border rounded-xl p-4 mb-4">
        <h3 className="text-sm font-semibold text-white mb-2">Buscar y combinar pilotos</h3>
        <p className="text-xs text-neutral-500 mb-3">
          Si dos filas son la misma persona (typo, mayúsculas/minúsculas), busca una, clic en
          &ldquo;Combinar&rdquo;, luego busca la otra y clic en su botón para unirlas. El piloto destino
          conserva su rating actual.
        </p>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={mergeMode.from
            ? `Combinar "${mergeMode.from.canonical_name}" en… (buscar destino)`
            : "Buscar piloto…"}
          className="bg-black border border-border rounded-lg px-3 py-1.5 text-sm text-white placeholder-neutral-500 w-full focus:outline-none focus:border-accent"
        />
        {mergeMode.from && (
          <div className="mt-2 text-xs text-amber-400">
            Modo combinar: <strong>{mergeMode.from.canonical_name}</strong> →
            <button onClick={() => setMergeMode({ from: null })} className="ml-2 underline">cancelar</button>
          </div>
        )}
        {searchResults.length > 0 && (
          <ul className="mt-2 divide-y divide-border border border-border rounded-lg max-h-64 overflow-auto">
            {searchResults.map((d) => (
              <li key={d.driver_id} className="flex items-center justify-between px-3 py-2 text-sm hover:bg-black/30">
                <div className="min-w-0">
                  <div className="text-white truncate">{d.canonical_name}</div>
                  <div className="text-xs text-neutral-500">
                    {d.sessions_count} sesiones · {d.total_laps} vueltas · rating {d.rating.toFixed(0)} (rd {d.rd.toFixed(0)})
                  </div>
                </div>
                {mergeMode.from
                  ? (mergeMode.from.driver_id !== d.driver_id ? (
                    <button
                      onClick={() => handleMergeInto(d.driver_id, d.canonical_name)}
                      className="text-xs border border-accent text-accent rounded px-2 py-1 hover:bg-accent/20"
                    >
                      Combinar aquí
                    </button>
                  ) : (
                    <span className="text-xs text-neutral-500">(origen)</span>
                  ))
                  : (
                    <button
                      onClick={() => handleStartMerge(d)}
                      className="text-xs border border-border text-neutral-300 rounded px-2 py-1 hover:border-accent"
                    >
                      Combinar…
                    </button>
                  )
                }
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Leaderboard */}
      {loading ? (
        <div className="text-neutral-500 text-sm">Cargando…</div>
      ) : error ? (
        <div className="text-rose-400 text-sm">{error}</div>
      ) : rows.length === 0 ? (
        <div className="text-neutral-500 text-sm">
          Todavía no hay pilotos con suficientes sesiones. Pulsa &ldquo;Procesar logs nuevos&rdquo; para
          ejecutar el backfill, o reduce el filtro de Mín. sesiones.
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-black/40 text-xs uppercase text-neutral-500">
              <tr>
                <th className="text-left px-3 py-2 w-12">#</th>
                <th className="text-left px-3 py-2">Piloto</th>
                <th className="text-right px-3 py-2">Rating</th>
                <th className="text-right px-3 py-2">RD</th>
                <th className="text-right px-3 py-2">Sesiones</th>
                <th className="text-right px-3 py-2">Vueltas</th>
                <th className="text-right px-3 py-2">Última</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((d) => (
                <tr key={d.driver_id} className="hover:bg-black/20">
                  <td className="px-3 py-2 text-neutral-500 font-mono">{d.rank}</td>
                  <td className="px-3 py-2 text-white truncate">{d.canonical_name}</td>
                  <td className="px-3 py-2 text-right">
                    <span className={`inline-block border rounded px-2 py-0.5 font-mono text-xs ${ratingBadge(d.rating)}`}>
                      {d.rating.toFixed(0)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-neutral-500 font-mono text-xs">±{d.rd.toFixed(0)}</td>
                  <td className="px-3 py-2 text-right text-neutral-300 font-mono">{d.sessions_count}</td>
                  <td className="px-3 py-2 text-right text-neutral-300 font-mono">{d.total_laps}</td>
                  <td className="px-3 py-2 text-right text-neutral-500 text-xs">
                    {d.last_session_at ? d.last_session_at.slice(0, 10) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface border border-border rounded-lg p-3">
      <div className="text-[10px] uppercase tracking-wider text-neutral-500">{label}</div>
      <div className="text-lg font-mono text-white mt-0.5">{value}</div>
    </div>
  );
}
