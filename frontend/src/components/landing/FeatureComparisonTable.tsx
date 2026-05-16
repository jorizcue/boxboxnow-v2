"use client";

/**
 * Detailed pricing comparison table.
 *
 * Lives directly below <PricingToggle/> in the landing page. The
 * cards summarise the value prop in 5-7 bullets; this table is the
 * full source-of-truth grid for visitors that want to compare every
 * feature side by side.
 *
 * Layout:
 *   * ≥ md  → standard 6-column table (feature name + 5 plan columns)
 *   * < md  → horizontal scroll inside a sticky-first-column container
 *
 * Both branches share the same markup — `overflow-x-auto` on the
 * wrapper plus `min-w-[760px]` on the table gives the mobile
 * scroll, and the first column gets `sticky left-0` so the feature
 * label stays visible while the prices scroll past.
 *
 * Row content uses three primitives:
 *   * `Yes`        — green check
 *   * `No`         — em-dash, muted
 *   * `Text` /
 *     `Soon`       — arbitrary text (numbers, "Próximamente", etc.)
 *
 * Source of truth for the matrix is the constant `ROWS` below — to
 * tweak features, edit that one array.
 */

import { useEffect, useRef, useState } from "react";

import { api } from "@/lib/api";
import { useTracker } from "@/hooks/useTracker";
import { useT } from "@/lib/i18n";

type T = ReturnType<typeof useT>;

// Columns of the table — order is left → right.
type Column = {
  key: "ind_m" | "ind_a" | "end_b" | "end_pro_m" | "end_pro_a";
  label: string;
  sub: string;
  popular?: boolean;
};

// Product names (label) are catalog data and stay literal; only the
// billing cadence (sub) is translated.
const buildColumns = (t: T): readonly Column[] => [
  { key: "ind_m", label: "Individual", sub: t("landing.compare.sub.monthly") },
  { key: "ind_a", label: "Individual", sub: t("landing.compare.sub.annual") },
  { key: "end_b", label: "Endurance Básico", sub: t("landing.compare.sub.monthly") },
  { key: "end_pro_m", label: "Endurance Pro", sub: t("landing.compare.sub.monthly"), popular: true },
  { key: "end_pro_a", label: "Endurance Pro", sub: t("landing.compare.sub.annual"), popular: true },
];

type ColumnKey = Column["key"];

// Map a backend plan (plan_type + billing_interval) to the table
// column it represents, so the admin "venta próximamente" flag on a
// product surfaces as a "Próximamente" badge on the right column.
// Substring matching mirrors PricingToggle.getTierGradient — robust to
// admin-created plan_types that don't follow the *_monthly/_annual
// convention. Basic only has a monthly column.
function colKeyForPlan(planType: string, interval: string | null): ColumnKey | null {
  const t = (planType || "").toLowerCase();
  const annual = interval === "year" || /_annual$|_year$/.test(t);
  if (t.includes("endurance_pro") || (t.includes("pro") && !t.includes("basic"))) {
    return annual ? "end_pro_a" : "end_pro_m";
  }
  if (t.includes("endurance_basic") || t.includes("basic")) {
    return "end_b";
  }
  if (t.includes("individual")) {
    return annual ? "ind_a" : "ind_m";
  }
  return null;
}

// Cell value primitives. Anything that's not a primitive falls back
// to a literal string render.
type Cell =
  | { kind: "yes" }
  | { kind: "no" }
  | { kind: "soon" }
  | { kind: "text"; value: string }
  | { kind: "limited"; value: string }; // "— / limitado" type fields

type Row = {
  /** Section header rendered as a label cell with no plan columns. */
  section?: string;
  /** Leftmost label column. */
  label?: string;
  /** Optional helper text under the label for context. */
  hint?: string;
  /** Per-column value. */
  values?: Record<ColumnKey, Cell>;
  /** Tag this row as a price row so we can style it differently
   *  (bold + larger). */
  emphasis?: boolean;
};

const YES: Cell = { kind: "yes" };
const NO: Cell = { kind: "no" };
const SOON: Cell = { kind: "soon" };
const text = (s: string): Cell => ({ kind: "text", value: s });
const limited = (s: string): Cell => ({ kind: "limited", value: s });

// Single source of truth for what each plan includes. Edit this list
// to change what shows in the landing. The order of keys inside each
// `values` block matches COLUMNS above — TypeScript will complain if
// any column is missing or a stray one is added.
// Numeric price cells ("8,99 €/mes" …) and the numeric "1"/"3"
// circuit counts are catalog data and stay literal. Everything else
// (section headers, row labels, descriptive cells) is translated.
const buildRows = (t: T): Row[] => {
  const users = (n: number): Cell =>
    text(n === 1 ? t("landing.compare.cell.usuarios", { n }) : t("landing.compare.cell.usuariosPlural", { n }));
  return [
  { section: t("landing.compare.section.precios") },
  {
    label: t("landing.compare.row.precio"),
    emphasis: true,
    values: {
      ind_m: text("8,99 €/mes"),
      ind_a: text("89,90 €/año"),
      end_b: text("49 €/mes"),
      end_pro_m: text("79 €/mes"),
      end_pro_a: text("790 €/año"),
    },
  },
  {
    label: t("landing.compare.row.equivMensual"),
    values: {
      ind_m: text("8,99 €"),
      ind_a: text("7,49 €"),
      end_b: text("49 €"),
      end_pro_m: text("79 €"),
      end_pro_a: text("65,83 €"),
    },
  },
  {
    label: t("landing.compare.row.ahorroAnual"),
    values: {
      ind_m: NO,
      ind_a: text(t("landing.compare.cell.dosMesesGratis")),
      end_b: NO,
      end_pro_m: NO,
      end_pro_a: text(t("landing.compare.cell.dosMesesGratis")),
    },
  },

  { section: t("landing.compare.section.disenadoPara") },
  {
    label: t("landing.compare.row.tipoUsuario"),
    values: {
      ind_m: text(t("landing.compare.cell.piloto")),
      ind_a: text(t("landing.compare.cell.pilotoRecurrente")),
      end_b: text(t("landing.compare.cell.pilotoEquipoIniciacion")),
      end_pro_m: text(t("landing.compare.cell.equipoProfesional")),
      end_pro_a: text(t("landing.compare.cell.equipoProfesional")),
    },
  },
  {
    label: t("landing.compare.row.mejorPara"),
    values: {
      ind_m: text(t("landing.compare.cell.usoPersonal")),
      ind_a: text(t("landing.compare.cell.pilotoFrecuente")),
      end_b: text(t("landing.compare.cell.empezarSinCompromiso")),
      end_pro_m: text(t("landing.compare.cell.usoHabitual")),
      end_pro_a: text(t("landing.compare.cell.usoIntensivo")),
    },
  },

  { section: t("landing.compare.section.capacidad") },
  {
    label: t("landing.compare.row.circuitosIncluidos"),
    values: {
      ind_m: text("1"),
      ind_a: text(t("landing.compare.cell.todos")),
      end_b: text("1"),
      end_pro_m: text("3"),
      end_pro_a: text(t("landing.compare.cell.todos")),
    },
  },
  {
    label: t("landing.compare.row.appMovil"),
    values: {
      ind_m: users(1),
      ind_a: users(1),
      end_b: users(2),
      end_pro_m: users(6),
      end_pro_a: users(6),
    },
  },
  {
    label: t("landing.compare.row.accesoWeb"),
    values: {
      ind_m: NO,
      ind_a: NO,
      end_b: users(1),
      end_pro_m: users(2),
      end_pro_a: users(2),
    },
  },

  { section: t("landing.compare.section.funcionalidades") },
  {
    label: t("landing.compare.row.vistaPiloto"),
    values: { ind_m: YES, ind_a: YES, end_b: YES, end_pro_m: YES, end_pro_a: YES },
  },
  {
    label: t("landing.compare.row.configCarrera"),
    values: { ind_m: YES, ind_a: YES, end_b: YES, end_pro_m: YES, end_pro_a: YES },
  },
  {
    label: t("landing.compare.row.moduloCarrera"),
    values: { ind_m: NO, ind_a: NO, end_b: YES, end_pro_m: YES, end_pro_a: YES },
  },
  {
    label: t("landing.compare.row.moduloBox"),
    values: { ind_m: NO, ind_a: NO, end_b: YES, end_pro_m: YES, end_pro_a: YES },
  },
  {
    label: t("landing.compare.row.liveTiming"),
    values: { ind_m: NO, ind_a: NO, end_b: YES, end_pro_m: YES, end_pro_a: YES },
  },
  {
    label: t("landing.compare.row.replay"),
    values: {
      ind_m: NO,
      ind_a: NO,
      end_b: NO,
      end_pro_m: NO,
      end_pro_a: YES,
    },
  },
  {
    label: t("landing.compare.row.analisisKarts"),
    values: { ind_m: NO, ind_a: NO, end_b: NO, end_pro_m: YES, end_pro_a: YES },
  },
  {
    label: t("landing.compare.row.gpsInsights"),
    values: {
      ind_m: NO,
      ind_a: YES,
      end_b: NO,
      end_pro_m: NO,
      end_pro_a: YES,
    },
  },
  {
    label: t("landing.compare.row.clasificacionReal"),
    values: { ind_m: NO, ind_a: NO, end_b: NO, end_pro_m: SOON, end_pro_a: SOON },
  },
  {
    label: t("landing.compare.row.soportePrioritario"),
    values: { ind_m: NO, ind_a: NO, end_b: NO, end_pro_m: YES, end_pro_a: YES },
  },
  ];
};

export function FeatureComparisonTable() {
  // Fire "pricing.compare_view" once when the table scrolls into view
  // so we can see in the funnel how many visitors actually open the
  // detailed comparison vs. converting from cards alone.
  const ref = useRef<HTMLDivElement | null>(null);
  const firedRef = useRef(false);
  const { trackFunnel } = useTracker();
  const t = useT();
  const COLUMNS = buildColumns(t);
  const ROWS = buildRows(t);

  // Columns flagged "venta próximamente" from the admin product config.
  const [comingSoon, setComingSoon] = useState<Partial<Record<ColumnKey, boolean>>>({});
  useEffect(() => {
    let cancelled = false;
    api
      .getPlans()
      .then((plans) => {
        if (cancelled || !plans) return;
        const map: Partial<Record<ColumnKey, boolean>> = {};
        for (const p of plans) {
          if (!p.coming_soon) continue;
          const k = colKeyForPlan(p.plan_type, p.billing_interval);
          if (k) map[k] = true;
        }
        setComingSoon(map);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el || firedRef.current) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !firedRef.current) {
            firedRef.current = true;
            trackFunnel("pricing.compare_view");
            io.disconnect();
            break;
          }
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [trackFunnel]);

  return (
    <div ref={ref} className="mt-24">
      <div className="text-center mb-10">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent mb-3">
          {t("landing.compare.eyebrow")}
        </p>
        <h3 className="text-2xl sm:text-3xl font-bold text-white">
          {t("landing.compare.title")}
        </h3>
        <p className="mt-3 text-sm text-neutral-500">
          {t("landing.compare.subtitle")}
        </p>
      </div>

      <div className="rounded-2xl border border-border/50 bg-surface/40 overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead>
            <tr className="border-b border-border/60 bg-black/40">
              <th
                scope="col"
                className="sticky left-0 z-10 bg-black/80 backdrop-blur text-left py-4 pl-5 pr-4 text-xs font-semibold uppercase tracking-wider text-neutral-500"
              >
                {t("landing.compare.featureCol")}
              </th>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={`py-4 px-4 text-center align-bottom ${
                    col.popular ? "bg-accent/[0.04]" : ""
                  }`}
                >
                  <div className="flex flex-col items-center gap-0.5">
                    <span
                      className={`text-sm font-bold ${
                        col.popular ? "text-accent" : "text-white"
                      }`}
                    >
                      {col.label}
                    </span>
                    <span className="text-[11px] text-neutral-500">{col.sub}</span>
                    {col.popular && !comingSoon[col.key] && (
                      <span className="mt-1 rounded-full bg-accent px-2 py-0.5 text-[9px] font-bold text-black uppercase tracking-wider">
                        {t("landing.compare.popular")}
                      </span>
                    )}
                    {comingSoon[col.key] && (
                      <span className="mt-1 rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[9px] font-bold text-amber-300 uppercase tracking-wider">
                        {t("landing.compare.soon")}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row, i) => {
              if (row.section) {
                return (
                  <tr key={`sec-${i}`} className="bg-black/30">
                    <td
                      colSpan={COLUMNS.length + 1}
                      className="sticky left-0 z-10 bg-black/40 backdrop-blur py-2.5 pl-5 text-[11px] font-bold uppercase tracking-[0.15em] text-accent/80"
                    >
                      {row.section}
                    </td>
                  </tr>
                );
              }
              return (
                <tr
                  key={`row-${i}`}
                  className="border-t border-border/30 hover:bg-white/[0.02] transition-colors"
                >
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-black/70 backdrop-blur text-left py-3 pl-5 pr-4 font-normal text-neutral-200"
                  >
                    {row.label}
                    {row.hint && (
                      <div className="text-[11px] text-neutral-500 mt-0.5">
                        {row.hint}
                      </div>
                    )}
                  </th>
                  {COLUMNS.map((col) => {
                    const value = row.values?.[col.key];
                    return (
                      <td
                        key={col.key}
                        className={`py-3 px-4 text-center align-middle ${
                          col.popular ? "bg-accent/[0.03]" : ""
                        } ${row.emphasis ? "text-white font-semibold" : "text-neutral-400"}`}
                      >
                        <CellRenderer
                          value={value}
                          includedLabel={t("landing.compare.included")}
                          soonLabel={t("landing.compare.soon")}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-center text-xs text-neutral-500">
        {t("landing.compare.scrollHint")}
      </p>
    </div>
  );
}

function CellRenderer({
  value,
  includedLabel,
  soonLabel,
}: {
  value: Cell | undefined;
  includedLabel: string;
  soonLabel: string;
}) {
  if (!value) return <span className="text-muted/30">—</span>;
  switch (value.kind) {
    case "yes":
      return (
        <svg
          className="mx-auto h-5 w-5 text-accent"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
          aria-label={includedLabel}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      );
    case "no":
      return <span className="text-muted/30">—</span>;
    case "soon":
      return (
        <span className="inline-block rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
          {soonLabel}
        </span>
      );
    case "limited":
      return (
        <span className="inline-block rounded-full bg-cyan-500/15 border border-cyan-500/30 px-2 py-0.5 text-[10px] font-semibold text-cyan-300">
          {value.value}
        </span>
      );
    case "text":
      return <span>{value.value}</span>;
  }
}
