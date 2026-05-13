"use client";

/**
 * Admin → Analítica panel.
 *
 * Three sub-views, switched via a top tab strip:
 *
 *   1. **Uso** (this file, default) — DAU/WAU/MAU KPIs, active users
 *      time series, top tabs, top actions. Powered by
 *      `/api/usage/stats/*`.
 *
 *   2. **Adquisición** (F2) — funnel + first-touch attribution. Lives
 *      in a sibling component, mounted as a tab here.
 *
 *   3. **Mapas de calor** (F3) — day × hour + sidebar heatmap.
 *
 * F1 ships only the Uso view; F2/F3 lazily expand the tab strip.
 */

import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import { api } from "@/lib/api";

type Overview = {
  dau: number;
  wau: number;
  mau: number;
  total_users: number;
  active_now: number;
  platforms: Record<string, number>;
};

type TimeSeries = { series: { day: string; active: number }[]; days: number };
type TopEvents = { top: { event_key: string; count: number; users: number }[]; days: number };

const RANGE_OPTIONS = [
  { label: "7 días", days: 7 },
  { label: "30 días", days: 30 },
  { label: "90 días", days: 90 },
];

type AnalyticsView = "usage" | "funnel" | "attribution" | "heatmap";

export function AdminAnalyticsPanel() {
  const [view, setView] = useState<AnalyticsView>("usage");
  return (
    <div className="space-y-4">
      <nav className="flex items-center gap-1 border-b border-border overflow-x-auto">
        <ViewTab active={view === "usage"} onClick={() => setView("usage")}>
          Uso
        </ViewTab>
        <ViewTab active={view === "funnel"} onClick={() => setView("funnel")}>
          Adquisición · Funnel
        </ViewTab>
        <ViewTab active={view === "attribution"} onClick={() => setView("attribution")}>
          Atribución
        </ViewTab>
        <ViewTab active={view === "heatmap"} onClick={() => setView("heatmap")}>
          Mapa de calor
        </ViewTab>
      </nav>
      {view === "usage" && <UsageView />}
      {view === "funnel" && <FunnelView />}
      {view === "attribution" && <AttributionView />}
      {view === "heatmap" && <HeatmapView />}
    </div>
  );
}

function ViewTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
        active
          ? "border-accent text-white"
          : "border-transparent text-neutral-500 hover:text-neutral-300"
      }`}
    >
      {children}
    </button>
  );
}

function UsageView() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [series, setSeries] = useState<TimeSeries | null>(null);
  const [topTabs, setTopTabs] = useState<TopEvents | null>(null);
  const [topActions, setTopActions] = useState<TopEvents | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      api.usageOverview(),
      api.usageActiveUsers(days),
      api.usageTopEvents({ event_type: "tab_view", days, limit: 10 }),
      api.usageTopEvents({ event_type: "action", days, limit: 10 }),
    ])
      .then(([o, s, tt, ta]) => {
        setOverview(o);
        setSeries(s);
        setTopTabs(tt);
        setTopActions(ta);
      })
      .catch((e) => setError(e?.message || "Error cargando analítica"))
      .finally(() => setLoading(false));
  }, [days]);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">Uso</h2>
          <p className="text-xs text-neutral-500 mt-1">
            Métricas agregadas first-party. Nada se comparte fuera del servidor.
          </p>
        </div>
        <div className="flex gap-1 bg-surface border border-border rounded-lg p-1">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.days}
              onClick={() => setDays(opt.days)}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                days === opt.days
                  ? "bg-accent text-black"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </header>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* KPI cards */}
      <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard label="DAU" value={overview?.dau} hint="últimas 24h" loading={loading} />
        <KpiCard label="WAU" value={overview?.wau} hint="últimos 7 días" loading={loading} />
        <KpiCard label="MAU" value={overview?.mau} hint="últimos 30 días" loading={loading} />
        <KpiCard label="Activos ahora" value={overview?.active_now} hint="últimos 5 min" loading={loading} />
        <KpiCard label="Cuentas" value={overview?.total_users} hint="registradas" loading={loading} />
      </section>

      {/* Plataforma breakdown */}
      {overview && Object.keys(overview.platforms).length > 0 && (
        <section className="bg-surface border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-white mb-3">
            Plataforma <span className="text-neutral-500 text-xs font-normal">· últimos 30 días</span>
          </h3>
          <PlatformBar platforms={overview.platforms} />
        </section>
      )}

      {/* Active users time series */}
      <section className="bg-surface border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold text-white mb-3">
          Usuarios activos por día
          <span className="text-neutral-500 text-xs font-normal ml-2">
            · últimos {days} días
          </span>
        </h3>
        <ActiveUsersChart series={series?.series ?? []} loading={loading} />
      </section>

      {/* Top tabs + top actions side by side */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TopEventsCard
          title="Tabs más visitadas"
          subtitle={`últimos ${days} días`}
          rows={topTabs?.top ?? []}
          loading={loading}
          empty="Aún no hay datos de navegación entre pestañas."
        />
        <TopEventsCard
          title="Acciones más frecuentes"
          subtitle={`últimos ${days} días`}
          rows={topActions?.top ?? []}
          loading={loading}
          empty="Aún no hay acciones instrumentadas (llega en F3)."
        />
      </section>
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
  loading,
}: {
  label: string;
  value: number | undefined;
  hint?: string;
  loading: boolean;
}) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <div className="text-[11px] uppercase tracking-wider text-neutral-500 font-medium">
        {label}
      </div>
      <div className="text-2xl font-bold text-white mt-1 tabular-nums">
        {loading ? "—" : (value ?? 0).toLocaleString("es-ES")}
      </div>
      {hint && <div className="text-[11px] text-neutral-500 mt-1">{hint}</div>}
    </div>
  );
}

function PlatformBar({ platforms }: { platforms: Record<string, number> }) {
  const entries = useMemo(() => {
    const total = Object.values(platforms).reduce((a, b) => a + b, 0) || 1;
    return Object.entries(platforms)
      .map(([k, v]) => ({ key: k, count: v, pct: (v / total) * 100 }))
      .sort((a, b) => b.count - a.count);
  }, [platforms]);

  const colors: Record<string, string> = {
    web: "#41D238",
    ios: "#2196F3",
    android: "#FFCC00",
  };

  return (
    <div className="space-y-2">
      <div className="flex h-2.5 rounded-full overflow-hidden bg-black">
        {entries.map((e) => (
          <div
            key={e.key}
            style={{ width: `${e.pct}%`, backgroundColor: colors[e.key] ?? "#8E8E93" }}
            title={`${e.key}: ${e.count}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {entries.map((e) => (
          <div key={e.key} className="flex items-center gap-1.5 text-neutral-400">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: colors[e.key] ?? "#8E8E93" }}
            />
            <span className="text-white">{e.key}</span>
            <span className="tabular-nums">
              {e.count.toLocaleString("es-ES")}
            </span>
            <span className="text-neutral-500">({e.pct.toFixed(0)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActiveUsersChart({
  series,
  loading,
}: {
  series: { day: string; active: number }[];
  loading: boolean;
}) {
  // Vanilla SVG line chart — keeps the bundle small (no recharts) and
  // gives us full control of dark-theme styling. Hover crosshair +
  // tooltip implemented via pointer events on a transparent overlay
  // because per-point hit testing is overkill for ≤365 daily points.
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(600);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!wrapperRef.current) return;
    const el = wrapperRef.current;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setWidth(e.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (loading) {
    return (
      <div ref={wrapperRef} className="h-56 flex items-center justify-center text-neutral-500 text-sm">
        Cargando…
      </div>
    );
  }
  if (series.length === 0) {
    return (
      <div ref={wrapperRef} className="h-56 flex items-center justify-center text-neutral-500 text-sm">
        Sin datos.
      </div>
    );
  }

  const height = 224;
  const padL = 36;
  const padR = 12;
  const padT = 8;
  const padB = 24;
  const innerW = Math.max(10, width - padL - padR);
  const innerH = height - padT - padB;

  const maxVal = Math.max(1, ...series.map((s) => s.active));
  const yTicks = niceTicks(maxVal, 4);
  const yMax = yTicks[yTicks.length - 1];

  const points = series.map((s, i) => {
    const x = padL + (series.length === 1 ? innerW / 2 : (i / (series.length - 1)) * innerW);
    const y = padT + innerH - (s.active / yMax) * innerH;
    return { x, y, label: s.day, value: s.active };
  });
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  // ~5 X-axis ticks, evenly spaced
  const tickStride = Math.max(1, Math.floor(series.length / 5));
  const xTickIdx = series
    .map((_, i) => i)
    .filter((i) => i === 0 || i === series.length - 1 || i % tickStride === 0);

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < padL || x > padL + innerW) {
      setHoverIdx(null);
      return;
    }
    const ratio = (x - padL) / innerW;
    const idx = Math.round(ratio * (series.length - 1));
    setHoverIdx(Math.max(0, Math.min(series.length - 1, idx)));
  };

  const hover = hoverIdx !== null ? points[hoverIdx] : null;

  return (
    <div ref={wrapperRef} className="relative">
      <svg
        width={width}
        height={height}
        onMouseMove={onMove}
        onMouseLeave={() => setHoverIdx(null)}
        className="overflow-visible"
      >
        {/* Y grid + labels */}
        {yTicks.map((t) => {
          const y = padT + innerH - (t / yMax) * innerH;
          return (
            <g key={t}>
              <line x1={padL} x2={padL + innerW} y1={y} y2={y} stroke="#1f1f1f" strokeDasharray="3 3" />
              <text x={padL - 6} y={y} fontSize={10} fill="#8E8E93" textAnchor="end" alignmentBaseline="middle">
                {t}
              </text>
            </g>
          );
        })}
        {/* X labels */}
        {xTickIdx.map((i) => {
          const x = padL + (series.length === 1 ? innerW / 2 : (i / (series.length - 1)) * innerW);
          return (
            <text key={i} x={x} y={height - 4} fontSize={10} fill="#8E8E93" textAnchor="middle">
              {series[i].day.slice(5)}
            </text>
          );
        })}
        {/* Line */}
        <path d={path} stroke="#41D238" strokeWidth={2} fill="none" />
        {/* Hover crosshair */}
        {hover && (
          <>
            <line x1={hover.x} x2={hover.x} y1={padT} y2={padT + innerH} stroke="#41D238" strokeOpacity={0.35} />
            <circle cx={hover.x} cy={hover.y} r={4} fill="#41D238" stroke="#000" strokeWidth={1.5} />
          </>
        )}
      </svg>
      {hover && (
        <div
          className="pointer-events-none absolute bg-black/95 border border-border rounded-md px-2 py-1 text-[11px] text-white shadow-lg whitespace-nowrap"
          style={{
            left: Math.min(hover.x + 8, width - 80),
            top: Math.max(hover.y - 32, 4),
          }}
        >
          <div className="text-neutral-400">{hover.label}</div>
          <div className="font-semibold tabular-nums">
            {hover.value.toLocaleString("es-ES")} activos
          </div>
        </div>
      )}
    </div>
  );
}

/** Compute up to `count` "nice" Y-axis ticks for a max value. */
function niceTicks(maxVal: number, count: number): number[] {
  if (maxVal <= 0) return [0, 1];
  const rough = maxVal / count;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const top = Math.ceil(maxVal / step) * step;
  const out: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) out.push(Math.round(v));
  return out;
}

function TopEventsCard({
  title,
  subtitle,
  rows,
  loading,
  empty,
}: {
  title: string;
  subtitle?: string;
  rows: { event_key: string; count: number; users: number }[];
  loading: boolean;
  empty: string;
}) {
  const max = rows[0]?.count ?? 0;
  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <h3 className="text-sm font-semibold text-white mb-3">
        {title}
        {subtitle && <span className="text-neutral-500 text-xs font-normal ml-2">· {subtitle}</span>}
      </h3>
      {loading ? (
        <div className="h-40 flex items-center justify-center text-neutral-500 text-sm">Cargando…</div>
      ) : rows.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-neutral-500 text-sm text-center px-4">
          {empty}
        </div>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((row) => {
            const pct = max > 0 ? (row.count / max) * 100 : 0;
            return (
              <li key={row.event_key} className="text-xs">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-white truncate pr-2">{row.event_key}</span>
                  <span className="text-neutral-400 tabular-nums flex-shrink-0">
                    {row.count.toLocaleString("es-ES")}{" "}
                    <span className="text-neutral-600">· {row.users}u</span>
                  </span>
                </div>
                <div className="h-1.5 bg-black rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent rounded-full transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ─────────────────────────── Funnel view ───────────────────────────

type FunnelStage = {
  event_key: string;
  label: string;
  count: number;
  pct_overall: number | null;
  pct_step: number | null;
};

function FunnelView() {
  const [stages, setStages] = useState<FunnelStage[]>([]);
  const [days, setDays] = useState(30);
  const [utmSource, setUtmSource] = useState("");
  const [utmCampaign, setUtmCampaign] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .usageFunnel({
        days,
        utm_source: utmSource || undefined,
        utm_campaign: utmCampaign || undefined,
      })
      .then((r) => setStages(r.stages))
      .catch((e) => setError(e?.message || "Error cargando funnel"))
      .finally(() => setLoading(false));
  }, [days, utmSource, utmCampaign]);

  const topCount = stages[0]?.count ?? 0;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">Funnel de adquisición</h2>
          <p className="text-xs text-neutral-500 mt-1">
            Visitantes únicos por etapa. La barra azul es la conversión
            absoluta vs el primer paso; el % a la derecha es la tasa
            etapa-a-etapa.
          </p>
        </div>
        <div className="flex gap-1 bg-surface border border-border rounded-lg p-1">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.days}
              onClick={() => setDays(opt.days)}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                days === opt.days
                  ? "bg-accent text-black"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <FilterInput
          label="utm_source"
          value={utmSource}
          onChange={setUtmSource}
          placeholder="p. ej. google_ads"
        />
        <FilterInput
          label="utm_campaign"
          value={utmCampaign}
          onChange={setUtmCampaign}
          placeholder="p. ej. lanzamiento_q3"
        />
      </section>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <section className="bg-surface border border-border rounded-xl p-4 space-y-2">
        {loading ? (
          <div className="h-64 flex items-center justify-center text-neutral-500 text-sm">
            Cargando…
          </div>
        ) : topCount === 0 ? (
          <div className="h-64 flex items-center justify-center text-neutral-500 text-sm text-center px-6">
            Aún no hay datos en este rango. Cuando los visitantes
            atraviesen la landing y los flujos de registro / pago, las
            etapas se llenarán automáticamente.
          </div>
        ) : (
          stages.map((stage, i) => (
            <FunnelStageRow
              key={stage.event_key}
              stage={stage}
              barPct={topCount > 0 ? (stage.count / topCount) * 100 : 0}
              isFirst={i === 0}
            />
          ))
        )}
      </section>
    </div>
  );
}

function FunnelStageRow({
  stage,
  barPct,
  isFirst,
}: {
  stage: FunnelStage;
  barPct: number;
  isFirst: boolean;
}) {
  const stepPct = stage.pct_step;
  const overallPct = stage.pct_overall;
  const stepColor =
    stepPct == null || isFirst
      ? "text-neutral-500"
      : stepPct >= 50
        ? "text-emerald-400"
        : stepPct >= 20
          ? "text-amber-300"
          : "text-red-400";

  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-white truncate">{stage.label}</span>
          <span className="text-neutral-600 truncate">· {stage.event_key}</span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 tabular-nums">
          <span className="text-white font-semibold">
            {stage.count.toLocaleString("es-ES")}
          </span>
          {overallPct != null && (
            <span className="text-neutral-500 text-[11px]">
              {overallPct.toFixed(1)}% total
            </span>
          )}
          {!isFirst && stepPct != null && (
            <span className={`text-[11px] ${stepColor}`}>
              {stepPct.toFixed(1)}% paso
            </span>
          )}
        </div>
      </div>
      <div className="h-3 bg-black rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-accent to-accent/60 rounded-full transition-all"
          style={{ width: `${barPct}%` }}
        />
      </div>
    </div>
  );
}

function FilterInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wider text-neutral-500 font-medium block mb-1">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-black border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-accent transition-colors"
      />
    </label>
  );
}

// ───────────────────────── Attribution view ─────────────────────────

type AttrRow = {
  key: string;
  visitors: number;
  registrations: number;
  payments: number;
};

function AttributionView() {
  const [bySource, setBySource] = useState<AttrRow[]>([]);
  const [byCampaign, setByCampaign] = useState<AttrRow[]>([]);
  const [byReferrer, setByReferrer] = useState<AttrRow[]>([]);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .usageAttribution(days)
      .then((r) => {
        setBySource(r.by_source);
        setByCampaign(r.by_campaign);
        setByReferrer(r.by_referrer);
      })
      .catch((e) => setError(e?.message || "Error cargando atribución"))
      .finally(() => setLoading(false));
  }, [days]);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">Atribución first-touch</h2>
          <p className="text-xs text-neutral-500 mt-1">
            Visitantes, registros y pagos por la fuente que los trajo
            originalmente. Snapshot capturado en el primer hit, no se
            sobrescribe en visitas posteriores.
          </p>
        </div>
        <div className="flex gap-1 bg-surface border border-border rounded-lg p-1">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.days}
              onClick={() => setDays(opt.days)}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                days === opt.days
                  ? "bg-accent text-black"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </header>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <AttrTable
        title="Por utm_source"
        rows={bySource}
        loading={loading}
        emptyHint="No hay tráfico marcado con utm_source en el rango."
      />
      <AttrTable
        title="Por utm_campaign"
        rows={byCampaign}
        loading={loading}
        emptyHint="No hay tráfico marcado con utm_campaign en el rango."
      />
      <AttrTable
        title="Por referrer (host)"
        rows={byReferrer}
        loading={loading}
        emptyHint="No hay tráfico con referrer externo en el rango."
      />
    </div>
  );
}

function AttrTable({
  title,
  rows,
  loading,
  emptyHint,
}: {
  title: string;
  rows: AttrRow[];
  loading: boolean;
  emptyHint: string;
}) {
  return (
    <section className="bg-surface border border-border rounded-xl p-4">
      <h3 className="text-sm font-semibold text-white mb-3">{title}</h3>
      {loading ? (
        <div className="h-32 flex items-center justify-center text-neutral-500 text-sm">
          Cargando…
        </div>
      ) : rows.length === 0 ? (
        <div className="h-32 flex items-center justify-center text-neutral-500 text-sm text-center px-6">
          {emptyHint}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-neutral-500">
              <tr>
                <th className="text-left font-medium pb-2">Origen</th>
                <th className="text-right font-medium pb-2">Visitantes</th>
                <th className="text-right font-medium pb-2">Registros</th>
                <th className="text-right font-medium pb-2">Pagos</th>
                <th className="text-right font-medium pb-2">Conv. pago</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 20).map((row) => {
                const conv =
                  row.visitors > 0 ? (row.payments / row.visitors) * 100 : 0;
                return (
                  <tr key={row.key} className="border-t border-border/50">
                    <td className="py-2 text-white truncate max-w-[18rem]">
                      {row.key}
                    </td>
                    <td className="py-2 text-right text-white tabular-nums">
                      {row.visitors.toLocaleString("es-ES")}
                    </td>
                    <td className="py-2 text-right text-neutral-300 tabular-nums">
                      {row.registrations.toLocaleString("es-ES")}
                    </td>
                    <td className="py-2 text-right text-emerald-400 tabular-nums">
                      {row.payments.toLocaleString("es-ES")}
                    </td>
                    <td className="py-2 text-right text-neutral-400 tabular-nums">
                      {conv.toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ─────────────────────────── Heatmap view ───────────────────────────

const DAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function HeatmapView() {
  const [days, setDays] = useState(30);
  const [cells, setCells] = useState<{ day_of_week: number; hour: number; count: number }[]>([]);
  const [maxCount, setMaxCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .usageHeatmap(days)
      .then((r) => {
        setCells(r.cells);
        setMaxCount(r.max_count);
      })
      .catch((e) => setError(e?.message || "Error cargando heatmap"))
      .finally(() => setLoading(false));
  }, [days]);

  // Build a 7×24 matrix of counts (Monday=0..Sunday=6).
  const matrix = useMemo(() => {
    const m: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    for (const c of cells) {
      if (c.day_of_week >= 0 && c.day_of_week < 7 && c.hour >= 0 && c.hour < 24) {
        m[c.day_of_week][c.hour] = c.count;
      }
    }
    return m;
  }, [cells]);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">Mapa de calor · día × hora</h2>
          <p className="text-xs text-neutral-500 mt-1">
            Intensidad de uso por día de la semana y hora (UTC). Útil
            para detectar picos y planificar mantenimientos.
          </p>
        </div>
        <div className="flex gap-1 bg-surface border border-border rounded-lg p-1">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.days}
              onClick={() => setDays(opt.days)}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                days === opt.days
                  ? "bg-accent text-black"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </header>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <section className="bg-surface border border-border rounded-xl p-4 overflow-x-auto">
        {loading ? (
          <div className="h-64 flex items-center justify-center text-neutral-500 text-sm">
            Cargando…
          </div>
        ) : maxCount === 0 ? (
          <div className="h-64 flex items-center justify-center text-neutral-500 text-sm">
            Sin datos en el rango.
          </div>
        ) : (
          <HeatmapGrid matrix={matrix} maxCount={maxCount} />
        )}
      </section>
    </div>
  );
}

function HeatmapGrid({
  matrix,
  maxCount,
}: {
  matrix: number[][];
  maxCount: number;
}) {
  // Color scale: black (0) → accent green at peak. Logarithmic step so
  // a few outlier-busy hours don't make every other cell look empty.
  const intensity = (count: number): number => {
    if (count <= 0) return 0;
    return Math.min(1, Math.log10(count + 1) / Math.log10(maxCount + 1));
  };

  return (
    <div className="min-w-[640px]">
      <div className="grid" style={{ gridTemplateColumns: "auto repeat(24, minmax(0, 1fr))", gap: 2 }}>
        {/* Header row: hour labels */}
        <div />
        {Array.from({ length: 24 }, (_, h) => (
          <div
            key={`h-${h}`}
            className="text-[10px] text-neutral-500 text-center"
          >
            {h % 3 === 0 ? `${h}h` : ""}
          </div>
        ))}

        {/* Data rows */}
        {matrix.map((row, dow) => (
          <Fragment key={`row-${dow}`}>
            <div className="text-[11px] text-neutral-400 pr-2 flex items-center justify-end">
              {DAY_LABELS[dow]}
            </div>
            {row.map((count, h) => {
              const alpha = intensity(count);
              return (
                <div
                  key={`c-${dow}-${h}`}
                  title={`${DAY_LABELS[dow]} ${h}h — ${count.toLocaleString("es-ES")} eventos`}
                  className="aspect-square rounded-sm border border-border/60"
                  style={{
                    backgroundColor:
                      alpha > 0
                        ? `rgba(65, 210, 56, ${0.08 + alpha * 0.85})`
                        : "#0a0a0a",
                  }}
                />
              );
            })}
          </Fragment>
        ))}
      </div>

      {/* Legend */}
      <div className="mt-4 flex items-center gap-2 text-[11px] text-neutral-500">
        <span>0</span>
        <div
          className="h-3 w-40 rounded-sm border border-border"
          style={{
            background:
              "linear-gradient(to right, #0a0a0a 0%, rgba(65,210,56,0.15) 20%, rgba(65,210,56,0.45) 50%, rgba(65,210,56,0.93) 100%)",
          }}
        />
        <span>{maxCount.toLocaleString("es-ES")}</span>
      </div>
    </div>
  );
}
