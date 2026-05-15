"use client";

/**
 * Admin → Ranking panel.
 *
 * Three things in one place:
 *   1. Glicko-2 leaderboard. Two flavours — global across all
 *      circuits, or per-circuit when the dropdown is set to one. The
 *      per-circuit table is the same Glicko-2 math but only counting
 *      sessions at that specific track, so e.g. "the Ariza
 *      specialist" surfaces even if their global rating is mid-pack.
 *   2. Driver detail modal. Click a row → opens a side panel with
 *      the driver's global + per-circuit ratings, rating-over-time
 *      chart, aliases, and recent sessions.
 *   3. Admin maintenance: search/merge duplicate driver names,
 *      trigger the incremental backfill, and full reset.
 *
 * All endpoints under /api/admin/ranking/* — admin-only.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  type RankingTopRow,
  type RankingSearchRow,
  type RankingCircuitRow,
  type RankingDriverDetail,
} from "@/lib/api";

function ratingBadge(rating: number): string {
  if (rating >= 1900) return "bg-emerald-500/15 text-emerald-300 border-emerald-500/40";
  if (rating >= 1700) return "bg-lime-500/15 text-lime-300 border-lime-500/40";
  if (rating >= 1550) return "bg-amber-500/15 text-amber-300 border-amber-500/40";
  if (rating >= 1400) return "bg-orange-500/15 text-orange-300 border-orange-500/40";
  return "bg-rose-500/15 text-rose-300 border-rose-500/40";
}

function formatLapMs(ms: number): string {
  if (!ms) return "—";
  const s = ms / 1000;
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return m > 0 ? `${m}:${rest.toFixed(3).padStart(6, "0")}` : rest.toFixed(3);
}

// Unified row for the leaderboard table — fed either by the loaded
// top-N (RankingTopRow) or the server search (RankingSearchRow, which
// has no global rank / last-session).
type LeaderRow = {
  rank: number | null;
  driver_id: number;
  canonical_name: string;
  rating: number;
  rd: number;
  sessions_count: number;
  total_laps: number;
  last_session_at: string | null;
};

export function AdminRankingPanel() {
  const [rows, setRows] = useState<RankingTopRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState<number | null>(100);
  const [minSessions, setMinSessions] = useState(2);
  // Circuit selector. "" ⇒ global rating. Otherwise the per-circuit
  // leaderboard. Initial list of circuits comes from a separate
  // endpoint so we don't have to load every rating just to populate
  // the dropdown.
  const [circuit, setCircuit] = useState<string>("");
  const [circuits, setCircuits] = useState<RankingCircuitRow[]>([]);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<RankingSearchRow[]>([]);
  // Server-side filter for the leaderboard table below. Uses the SAME
  // endpoint as the merge tool (`rankingAdminSearch`) so "Izcue"
  // matches "Jorge Izcue" and it searches EVERY driver — not just the
  // loaded top-N / min-sessions slice.
  const [tableFilter, setTableFilter] = useState("");
  const [tableSearchResults, setTableSearchResults] = useState<RankingSearchRow[]>([]);
  const [tableSearching, setTableSearching] = useState(false);
  const [mergeMode, setMergeMode] = useState<{ from: RankingSearchRow | null }>({ from: null });
  const [reprocessStatus, setReprocessStatus] = useState<string | null>(null);
  const [reprocessing, setReprocessing] = useState(false);
  const [detailOpen, setDetailOpen] = useState<RankingDriverDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [topData, circuitsData] = await Promise.all([
        api.rankingAdminTop(limit, minSessions, circuit || null),
        api.rankingAdminCircuits(),
      ]);
      setRows(topData.drivers);
      setCircuits(circuitsData.circuits);
    } catch (e: any) {
      setError(e.message || "Error cargando ranking");
    } finally {
      setLoading(false);
    }
  }, [limit, minSessions, circuit]);

  useEffect(() => { reload(); }, [reload]);

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

  // Leaderboard table filter → server search across ALL drivers
  // (debounced). < 2 chars falls back to the loaded leaderboard.
  useEffect(() => {
    const q = tableFilter.trim();
    if (q.length < 2) {
      setTableSearchResults([]);
      setTableSearching(false);
      return;
    }
    let cancelled = false;
    setTableSearching(true);
    const handle = setTimeout(() => {
      api.rankingAdminSearch(q)
        .then((data) => { if (!cancelled) setTableSearchResults(data.drivers); })
        .catch(() => { if (!cancelled) setTableSearchResults([]); })
        .finally(() => { if (!cancelled) setTableSearching(false); });
    }, 250);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [tableFilter]);

  const handleStartMerge = (d: RankingSearchRow) => setMergeMode({ from: d });

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

  const handleReset = async () => {
    const wipeDrivers = window.confirm(
      "¿Borrar también la lista de pilotos y sus alias?\n\n" +
      "• Aceptar: pilotos + alias se borran. Pierdes los merges manuales.\n" +
      "• Cancelar: pilotos + alias se conservan. Solo se recalculan los ratings."
    );
    const reallyOk = window.confirm(
      `Esto va a:\n` +
      `  · Vaciar driver_ratings, driver_circuit_ratings, rating_history.\n` +
      `  · Vaciar session_results y processed_logs.\n` +
      (wipeDrivers ? `  · Vaciar también drivers y driver_aliases.\n` : `  · CONSERVAR drivers y driver_aliases.\n`) +
      `  · Re-procesar TODOS los logs desde cero.\n\n` +
      `Puede tardar varios minutos. ¿Continuar?`
    );
    if (!reallyOk) return;
    setReprocessing(true);
    setReprocessStatus("Reset en curso…");
    try {
      const result = await api.rankingAdminReset(wipeDrivers, true);
      const r = result.reprocess;
      setReprocessStatus(
        `Reset completado. ${r ? `${r.processed} logs re-procesados.` : "Sin re-proceso."}`
      );
      await reload();
    } catch (e: any) {
      setReprocessStatus("Error en reset: " + (e.message || "reset_failed"));
    } finally {
      setReprocessing(false);
    }
  };

  const openDetail = async (driverId: number) => {
    setDetailLoading(true);
    setDetailOpen(null);
    try {
      const detail = await api.rankingAdminDriverDetail(driverId);
      setDetailOpen(detail);
    } catch (e: any) {
      alert("Error cargando detalle: " + (e.message || "fetch_failed"));
    } finally {
      setDetailLoading(false);
    }
  };

  // Active filter ⇒ show the server search results (all drivers);
  // otherwise the loaded leaderboard. Normalized to one row shape:
  // search rows have no global rank / last-session, shown as "—".
  const isTableFiltering = tableFilter.trim().length >= 2;
  const displayRows: LeaderRow[] = useMemo(() => {
    if (isTableFiltering) {
      return tableSearchResults.map((d) => ({
        rank: null,
        driver_id: d.driver_id,
        canonical_name: d.canonical_name,
        rating: d.rating,
        rd: d.rd,
        sessions_count: d.sessions_count,
        total_laps: d.total_laps,
        last_session_at: null,
      }));
    }
    return rows.map((d) => ({
      rank: d.rank,
      driver_id: d.driver_id,
      canonical_name: d.canonical_name,
      rating: d.rating,
      rd: d.rd,
      sessions_count: d.sessions_count,
      total_laps: d.total_laps,
      last_session_at: d.last_session_at,
    }));
  }, [isTableFiltering, tableSearchResults, rows]);

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
            Ratings derivados de todas las sesiones grabadas. Cambia entre ranking global y por
            circuito. Pulsa un piloto para ver su ficha completa.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleReprocess}
            disabled={reprocessing}
            className="border border-border rounded-lg px-3 py-1.5 text-sm text-neutral-300 hover:text-white hover:border-accent transition-colors disabled:opacity-50"
          >
            {reprocessing ? "Procesando…" : "Procesar logs nuevos"}
          </button>
          <button
            onClick={handleReset}
            disabled={reprocessing}
            className="border border-rose-500/40 rounded-lg px-3 py-1.5 text-sm text-rose-300 hover:bg-rose-500/10 transition-colors disabled:opacity-50"
            title="Vacía ratings y re-procesa todo desde cero. Útil tras cambiar el algoritmo."
          >
            Reset completo
          </button>
        </div>
      </div>

      {reprocessStatus && (
        <div className="mb-4 text-xs text-neutral-400 bg-surface border border-border rounded-lg px-3 py-2">
          {reprocessStatus}
        </div>
      )}

      {ratingStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          <Stat label={circuit ? `Pilotos en ${circuit}` : "Pilotos rankeados"} value={String(ratingStats.count)} />
          <Stat label="Mejor rating" value={ratingStats.max.toFixed(0)} />
          <Stat label="Peor rating" value={ratingStats.min.toFixed(0)} />
          <Stat label="Media" value={ratingStats.avg.toFixed(0)} />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4 text-sm">
        <label className="text-neutral-400">Ranking</label>
        <select
          value={circuit}
          onChange={(e) => setCircuit(e.target.value)}
          className="bg-surface border border-border rounded-lg px-2 py-1 text-white min-w-[180px]"
        >
          <option value="">Global (todos los circuitos)</option>
          {circuits.map((c) => (
            <option key={c.circuit_name} value={c.circuit_name}>
              {c.circuit_name} ({c.drivers_count})
            </option>
          ))}
        </select>
        <label className="text-neutral-400 ml-3">Top</label>
        <select
          value={limit === null ? "all" : String(limit)}
          onChange={(e) => setLimit(e.target.value === "all" ? null : parseInt(e.target.value, 10))}
          className="bg-surface border border-border rounded-lg px-2 py-1 text-white"
        >
          <option value="50">50</option>
          <option value="100">100</option>
          <option value="250">250</option>
          <option value="500">500</option>
          <option value="all">Todos</option>
        </select>
        <label className="text-neutral-400 ml-3">Mín. sesiones</label>
        <select
          value={minSessions}
          onChange={(e) => setMinSessions(parseInt(e.target.value, 10))}
          className="bg-surface border border-border rounded-lg px-2 py-1 text-white"
        >
          <option value={1}>1</option>
          <option value={2}>2</option>
          <option value={3}>3</option>
          <option value={5}>5</option>
        </select>
        <div className="relative ml-auto">
          <input
            type="text"
            value={tableFilter}
            onChange={(e) => setTableFilter(e.target.value)}
            placeholder="Filtrar por nombre de piloto…"
            className="bg-surface border border-border rounded-lg pl-3 pr-7 py-1 text-white placeholder-neutral-500 min-w-[220px] focus:outline-none focus:border-accent"
          />
          {tableFilter && (
            <button
              type="button"
              onClick={() => setTableFilter("")}
              aria-label="Limpiar filtro"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white text-sm leading-none"
            >
              ×
            </button>
          )}
        </div>
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
      ) : isTableFiltering && tableSearching ? (
        <div className="text-neutral-500 text-sm">Buscando &ldquo;{tableFilter}&rdquo;…</div>
      ) : !isTableFiltering && rows.length === 0 ? (
        <div className="text-neutral-500 text-sm">
          {circuit
            ? `No hay pilotos con ratings en ${circuit} con ese mínimo de sesiones. Reduce el filtro o cambia de circuito.`
            : "Todavía no hay pilotos rankeados. Pulsa \"Procesar logs nuevos\" para arrancar el backfill."}
        </div>
      ) : displayRows.length === 0 ? (
        <div className="text-neutral-500 text-sm">
          Ningún piloto coincide con &ldquo;{tableFilter}&rdquo;.{" "}
          <button onClick={() => setTableFilter("")} className="underline hover:text-white">
            Limpiar filtro
          </button>
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
              {displayRows.map((d) => (
                <tr
                  key={d.driver_id}
                  className="hover:bg-black/20 cursor-pointer"
                  onClick={() => openDetail(d.driver_id)}
                >
                  <td className="px-3 py-2 text-neutral-500 font-mono">{d.rank ?? "—"}</td>
                  <td className="px-3 py-2 text-white truncate underline-offset-2 hover:underline">
                    {d.canonical_name}
                  </td>
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

      {/* Driver detail modal */}
      {detailLoading && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70">
          <div className="text-neutral-300 text-sm">Cargando ficha…</div>
        </div>
      )}
      {detailOpen && (
        <DriverDetailModal
          detail={detailOpen}
          onClose={() => setDetailOpen(null)}
        />
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


// ──────────────────────────────────────────────────────────────────
// Driver detail modal — opens on row click. Renders the rating
// over time as an inline SVG line chart (no external chart lib), a
// per-circuit table, aliases, and recent sessions.
// ──────────────────────────────────────────────────────────────────

function DriverDetailModal({
  detail,
  onClose,
}: {
  detail: RankingDriverDetail;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-stretch justify-end bg-black/70"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl h-full overflow-auto bg-surface border-l border-border p-5"
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-white">{detail.canonical_name}</h2>
            <p className="text-xs text-neutral-500 mt-1">
              {detail.sessions_count} sesiones · {detail.total_laps} vueltas en total
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-500 hover:text-white text-xl leading-none px-2"
          >×</button>
        </div>

        {/* Global rating big card */}
        <div className="flex items-center gap-4 bg-black/40 border border-border rounded-xl p-4 mb-4">
          <div className={`text-3xl font-mono font-bold px-3 py-1 rounded border ${ratingBadge(detail.global_rating.rating)}`}>
            {detail.global_rating.rating.toFixed(0)}
          </div>
          <div className="text-xs text-neutral-400 space-y-0.5">
            <div>Rating global</div>
            <div>RD ±{detail.global_rating.rd.toFixed(0)} · {detail.global_rating.sessions_count} sesiones rateables</div>
            <div className="text-neutral-600">
              Última sesión: {detail.global_rating.last_session_at?.slice(0, 10) ?? "—"}
            </div>
          </div>
        </div>

        {/* Rating over time chart */}
        {detail.history.length >= 2 && (
          <section className="mb-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">
              Rating en el tiempo
            </h3>
            <div className="bg-black/40 border border-border rounded-xl p-3">
              <RatingChart history={detail.history} />
              <p className="mt-1 text-[10px] text-neutral-600">
                Cada punto = una sesión rateable. Hover muestra fecha y circuito.
              </p>
            </div>
          </section>
        )}

        {/* Per-circuit ratings */}
        {detail.circuit_ratings.length > 0 && (
          <section className="mb-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">
              Rating por circuito
            </h3>
            <div className="bg-black/40 border border-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-black/40 text-xs uppercase text-neutral-500">
                  <tr>
                    <th className="text-left px-3 py-2">Circuito</th>
                    <th className="text-right px-3 py-2">Rating</th>
                    <th className="text-right px-3 py-2">RD</th>
                    <th className="text-right px-3 py-2">Sesiones</th>
                    <th className="text-right px-3 py-2">Última</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {detail.circuit_ratings.map((c) => (
                    <tr key={c.circuit_name}>
                      <td className="px-3 py-1.5 text-white">{c.circuit_name}</td>
                      <td className="px-3 py-1.5 text-right">
                        <span className={`inline-block border rounded px-2 py-0.5 font-mono text-xs ${ratingBadge(c.rating)}`}>
                          {c.rating.toFixed(0)}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-right text-neutral-500 font-mono text-xs">±{c.rd.toFixed(0)}</td>
                      <td className="px-3 py-1.5 text-right text-neutral-300 font-mono">{c.sessions_count}</td>
                      <td className="px-3 py-1.5 text-right text-neutral-600 text-xs">
                        {c.last_session_at?.slice(0, 10) ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Aliases */}
        {detail.aliases.length > 0 && (
          <section className="mb-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">
              Alias detectados ({detail.aliases.length})
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {detail.aliases.map((a) => (
                <span key={a} className="text-xs font-mono bg-black/30 border border-border rounded px-2 py-0.5 text-neutral-400">
                  {a}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Recent sessions */}
        {detail.recent_sessions.length > 0 && (
          <section className="mb-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">
              Últimas sesiones
            </h3>
            <div className="bg-black/40 border border-border rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-black/40 uppercase text-neutral-500">
                  <tr>
                    <th className="text-left px-3 py-2">Fecha</th>
                    <th className="text-left px-3 py-2">Circuito</th>
                    <th className="text-left px-3 py-2">Sesión</th>
                    <th className="text-right px-3 py-2">Kart</th>
                    <th className="text-right px-3 py-2">Vueltas</th>
                    <th className="text-right px-3 py-2">Mejor</th>
                    <th className="text-right px-3 py-2">Pos</th>
                    <th className="text-right px-3 py-2" title="Pilotos contra los que corrió en esa sesión">Rivales</th>
                    <th className="text-right px-3 py-2" title="Puntos ELO ganados/perdidos en esa sesión">ΔELO</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {detail.recent_sessions.map((s, i) => {
                    const fullSession = [s.title1, s.title2].filter(Boolean).join(" / ") || "—";
                    const rivals = s.field_size != null ? s.field_size - 1 : null;
                    return (
                    <tr key={`${s.log_date}-${s.title1}-${s.title2}-${i}`}>
                      <td className="px-3 py-1.5 text-neutral-400 font-mono">{s.log_date}</td>
                      <td className="px-3 py-1.5 text-white">{s.circuit_name}</td>
                      <td className="px-3 py-1.5 text-neutral-300 truncate max-w-[180px]" title={fullSession}>
                        {fullSession}
                      </td>
                      <td className="px-3 py-1.5 text-right text-neutral-400 font-mono">{s.kart_number ?? "—"}</td>
                      <td className="px-3 py-1.5 text-right text-neutral-300 font-mono">{s.total_laps}</td>
                      <td className="px-3 py-1.5 text-right text-neutral-300 font-mono">{formatLapMs(s.best_lap_ms)}</td>
                      <td className="px-3 py-1.5 text-right text-neutral-400 font-mono">{s.final_position ?? "—"}</td>
                      <td className="px-3 py-1.5 text-right text-neutral-400 font-mono">
                        {rivals != null && rivals >= 0 ? rivals : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono">
                        {s.elo_delta == null ? (
                          <span className="text-neutral-600">—</span>
                        ) : (
                          <span className={s.elo_delta >= 0 ? "text-emerald-400" : "text-rose-400"}>
                            {s.elo_delta >= 0 ? "+" : ""}{s.elo_delta.toFixed(1)}
                          </span>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}


// ──────────────────────────────────────────────────────────────────
// Inline SVG rating chart. No external libs — the historical points
// are at most a few hundred, so a simple polyline is plenty. Y-axis
// auto-scales to [min−padding, max+padding]; X is just step index
// because sessions aren't evenly spaced in time and we want each
// session to be visually distinct.
// ──────────────────────────────────────────────────────────────────

function RatingChart({
  history,
}: {
  history: RankingDriverDetail["history"];
}) {
  const [hovered, setHovered] = useState<number | null>(null);

  const W = 720;
  const H = 200;
  const PAD = 28;

  if (history.length < 2) return null;

  const values = history.map((h) => h.rating_after);
  const minY = Math.min(...values, 1400);
  const maxY = Math.max(...values, 1600);
  const range = maxY - minY || 1;

  const xFor = (i: number) => PAD + (i / (history.length - 1)) * (W - 2 * PAD);
  const yFor = (v: number) => H - PAD - ((v - minY) / range) * (H - 2 * PAD);

  const path = history.map((h, i) => `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(1)} ${yFor(h.rating_after).toFixed(1)}`).join(" ");

  // Horizontal gridlines at rating bands
  const gridLines = [1400, 1500, 1600, 1700, 1800, 1900, 2000, 2100, 2200].filter((v) => v >= minY && v <= maxY);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-44">
      {/* Gridlines */}
      {gridLines.map((v) => (
        <g key={v}>
          <line x1={PAD} x2={W - PAD} y1={yFor(v)} y2={yFor(v)} stroke="#262626" strokeDasharray="2 4" />
          <text x={4} y={yFor(v) + 3} fontSize={9} fill="#525252">{v}</text>
        </g>
      ))}
      {/* Reference at 1500 */}
      {1500 >= minY && 1500 <= maxY && (
        <line x1={PAD} x2={W - PAD} y1={yFor(1500)} y2={yFor(1500)} stroke="#404040" strokeWidth={0.5} />
      )}
      {/* Rating line */}
      <path d={path} fill="none" stroke="#9fe556" strokeWidth={1.4} />
      {/* Points + invisible hit areas */}
      {history.map((h, i) => (
        <g key={i}>
          <circle cx={xFor(i)} cy={yFor(h.rating_after)} r={2} fill={h.delta >= 0 ? "#9fe556" : "#fb7185"} />
          <circle
            cx={xFor(i)}
            cy={yFor(h.rating_after)}
            r={6}
            fill="transparent"
            style={{ cursor: "pointer" }}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered((cur) => (cur === i ? null : cur))}
          />
        </g>
      ))}
      {/* Hover tooltip */}
      {hovered !== null && (() => {
        const h = history[hovered];
        const cx = xFor(hovered);
        const cy = yFor(h.rating_after);
        const flipLeft = cx > W - 160;
        const tx = flipLeft ? cx - 158 : cx + 8;
        const ty = Math.max(20, cy - 30);
        return (
          <g pointerEvents="none">
            <rect x={tx} y={ty} width={150} height={50} rx={3} fill="#000" stroke="#404040" />
            <text x={tx + 6} y={ty + 14} fontSize={10} fill="#e5e5e5">
              {h.log_date} · {h.circuit_name}
            </text>
            <text x={tx + 6} y={ty + 28} fontSize={10} fill="#a3a3a3">
              {[h.title1, h.title2].filter(Boolean).join(" / ").slice(0, 24)}
            </text>
            <text x={tx + 6} y={ty + 42} fontSize={10} fill={h.delta >= 0 ? "#9fe556" : "#fb7185"}>
              {h.rating_before.toFixed(0)} → {h.rating_after.toFixed(0)} ({h.delta >= 0 ? "+" : ""}{h.delta.toFixed(1)})
            </text>
          </g>
        );
      })()}
    </svg>
  );
}
