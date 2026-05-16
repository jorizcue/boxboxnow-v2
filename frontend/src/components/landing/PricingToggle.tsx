"use client";

import { useState, useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { useTracker } from "@/hooks/useTracker";
import { useT } from "@/lib/i18n";

interface PlanData {
  plan_type: string;
  display_name: string;
  description: string | null;
  features: string[];
  price_amount: number | null;
  billing_interval: string | null;  // "month", "year", "one_time"
  is_popular: boolean;
  // Admin "venta próximamente" flag. Optional so FALLBACK_PLANS below
  // (and any older cached payload) don't need the key — treated as
  // false when absent.
  coming_soon?: boolean;
  sort_order: number;
}

/** Grouped plan for display — one card can have monthly + annual prices */
interface GroupedPlan {
  base_type: string;
  display_name: string;
  description: string | null;
  features: string[];
  price_monthly: number | null;
  price_annual: number | null;
  price_event: number | null;
  // Exact plan_type keys from DB so we can round-trip without reconstructing
  // from suffix. Needed for admin-created plans whose plan_type doesn't
  // follow the `_monthly` / `_annual` naming convention.
  plan_type_monthly: string | null;
  plan_type_annual: string | null;
  plan_type_event: string | null;
  is_popular: boolean;
  coming_soon: boolean;
  is_event: boolean;
  sort_order: number;
}

// Fallback when /api/plans returns nothing. The admin should populate
// real plans + Stripe price_ids from Admin → Plataforma → Productos;
// these fallback rows are what the landing shows in development /
// before that's done. The 5-plan layout below mirrors what we
// announced commercially:
//
//   Individual            → mensual + anual
//   Endurance Básico      → solo mensual
//   Endurance Pro         → mensual + anual
//
// Each card aggregates monthly + annual prices of the same `base_type`
// (Individual / Endurance Pro), and the toggle picks which to show.
// Endurance Básico has no annual row, so when the toggle is on
// "Anual" the card stays in monthly mode with a "Solo mensual" hint
// (handled in render — see `pickAnnualOrFallbackMonthly`).
const FALLBACK_PLANS: PlanData[] = [
  // ── Individual ──
  {
    plan_type: "individual_monthly",
    display_name: "Individual",
    description: "Para el piloto que corre por su cuenta",
    features: [
      "1 circuito",
      "App móvil · 1 usuario",
      "Vista de piloto",
      "Configuración de carrera",
    ],
    price_amount: 8.99,
    billing_interval: "month",
    is_popular: false,
    sort_order: 1,
  },
  {
    plan_type: "individual_annual",
    display_name: "Individual",
    description: "Para el piloto que corre por su cuenta",
    features: [
      "Todos los circuitos",
      "App móvil · 1 usuario",
      "Vista de piloto",
      "Configuración de carrera",
      "GPS Insights",
      "2 meses gratis",
    ],
    price_amount: 89.9,
    billing_interval: "year",
    is_popular: false,
    sort_order: 1,
  },

  // ── Endurance Básico (sólo mensual) ──
  {
    plan_type: "endurance_basic_monthly",
    display_name: "Endurance Básico",
    description: "Para equipos o circuitos pequeños que empiezan",
    features: [
      "1 circuito",
      "App móvil · 2 usuarios",
      "Acceso web · 1 usuario",
      "Módulo carrera + módulo box",
      "LiveTiming",
    ],
    price_amount: 49,
    billing_interval: "month",
    is_popular: false,
    sort_order: 2,
  },

  // ── Endurance Pro ──
  {
    plan_type: "endurance_pro_monthly",
    display_name: "Endurance Pro",
    description: "Para equipos avanzados y circuitos serios",
    features: [
      "3 circuitos",
      "App móvil · 6 usuarios",
      "Acceso web · 2 usuarios",
      "Todo lo de Endurance Básico",
      "Análisis de karts",
      "Replay y GPS Insights (limitado)",
      "Soporte prioritario",
    ],
    price_amount: 79,
    billing_interval: "month",
    is_popular: true,
    sort_order: 3,
  },
  {
    plan_type: "endurance_pro_annual",
    display_name: "Endurance Pro",
    description: "Para equipos avanzados y circuitos serios",
    features: [
      "Todos los circuitos",
      "App móvil · 6 usuarios",
      "Acceso web · 2 usuarios",
      "Todo lo de Endurance Básico",
      "Análisis de karts",
      "Replay y GPS Insights completos",
      "Soporte prioritario",
      "2 meses gratis",
    ],
    price_amount: 790,
    billing_interval: "year",
    is_popular: true,
    sort_order: 3,
  },
];

/**
 * Group per-price plans into display cards.
 * Monthly/annual rows of the same base product merge into one card.
 */
function groupPlans(raw: PlanData[]): GroupedPlan[] {
  const map = new Map<string, GroupedPlan>();

  for (const p of raw) {
    const base = p.plan_type.replace(/_monthly$/, "").replace(/_annual$/, "");
    const isEvent = p.billing_interval === "one_time" || p.plan_type === "event";
    const isMonthly = p.billing_interval === "month";
    const isAnnual = p.billing_interval === "year";

    if (!map.has(base)) {
      map.set(base, {
        base_type: base,
        display_name: p.display_name,
        description: p.description,
        features: p.features,
        price_monthly: isMonthly ? p.price_amount : null,
        price_annual: isAnnual ? p.price_amount : null,
        price_event: isEvent ? p.price_amount : null,
        plan_type_monthly: isMonthly ? p.plan_type : null,
        plan_type_annual: isAnnual ? p.plan_type : null,
        plan_type_event: isEvent ? p.plan_type : null,
        is_popular: p.is_popular,
        coming_soon: p.coming_soon ?? false,
        is_event: isEvent,
        sort_order: p.sort_order,
      });
    } else {
      const existing = map.get(base)!;
      if (isMonthly && existing.price_monthly == null) {
        existing.price_monthly = p.price_amount;
        existing.plan_type_monthly = p.plan_type;
      }
      if (isAnnual && existing.price_annual == null) {
        existing.price_annual = p.price_amount;
        existing.plan_type_annual = p.plan_type;
      }
      if (isEvent && existing.price_event == null) {
        existing.price_event = p.price_amount;
        existing.plan_type_event = p.plan_type;
      }
      if (p.is_popular) existing.is_popular = true;
      if (p.coming_soon) existing.coming_soon = true;
      if (p.features.length > existing.features.length) existing.features = p.features;
    }
  }

  return Array.from(map.values()).sort((a, b) => a.sort_order - b.sort_order);
}

// Accent gradient for the 1px bar at the top of each card. Keys are
// substring-matched against base_type (e.g. "endurance_pro" matches
// the "endurance_pro" key). The order below matters — the most
// specific key has to win, so "endurance_pro" is checked before
// "endurance_basic" before "individual".
const tierColors: Record<string, string> = {
  endurance_pro: "from-accent to-accent-hover",
  endurance_basic: "from-cyan-400 to-cyan-600",
  individual: "from-muted/30 to-muted/10",
  // Legacy keys kept so admin-created plans with the old names still
  // render a sensible bar instead of falling through to the default.
  pro: "from-accent to-accent-hover",
  basic: "from-cyan-400 to-cyan-600",
  event: "from-gold to-yellow-500",
};

function getTierGradient(baseType: string): string {
  const bt = baseType.toLowerCase();
  for (const key of Object.keys(tierColors)) {
    if (bt.includes(key)) return tierColors[key];
  }
  return tierColors.individual;
}

export function PricingToggle() {
  const [annual, setAnnual] = useState(false);
  const [plans, setPlans] = useState<GroupedPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [trialDays, setTrialDays] = useState(0);
  const { trackFunnel } = useTracker();
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const t = useT();

  useEffect(() => {
    Promise.all([
      api.getPlans().catch(() => null),
      api.getTrialConfig().catch(() => ({ trial_enabled: false, trial_days: 0 })),
    ]).then(([plansData, trialConfig]) => {
      if (plansData && plansData.length > 0) {
        setPlans(groupPlans(plansData));
      } else {
        setPlans(groupPlans(FALLBACK_PLANS));
      }
      setTrialDays(trialConfig.trial_days ?? 0);
      setLoading(false);
    });
  }, []);

  // Funnel: pricing.view fires once when the section actually becomes
  // visible in the viewport. Using IntersectionObserver instead of "on
  // mount" because the pricing block is at the bottom of the landing —
  // a visitor who only sees the hero shouldn't count as having viewed
  // pricing. The `firedRef` guard makes it strictly once per page load.
  const firedRef = useRef(false);
  useEffect(() => {
    if (loading) return;
    const el = sectionRef.current;
    if (!el || firedRef.current) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !firedRef.current) {
            firedRef.current = true;
            trackFunnel("pricing.view");
            io.disconnect();
            break;
          }
        }
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loading, trackFunnel]);

  /** True iff the visitor flipped the toggle to "Anual" AND this plan
   *  actually has an annual price. Endurance Básico for example has
   *  no annual row in the catalog, so it stays on monthly even when
   *  the toggle is on — pricing display + CTA both fall back to the
   *  monthly plan rather than disappearing from the grid. */
  const effectivelyAnnual = (p: GroupedPlan): boolean =>
    annual && p.price_annual != null;

  const planLink = (p: GroupedPlan) => {
    // Use the exact plan_type from the DB so the /register → /dashboard
    // round-trip preserves it (required so per_circuit lookup matches).
    if (p.is_event) {
      const evt = p.plan_type_event ?? "event";
      return `/register?plan=${encodeURIComponent(evt)}`;
    }
    // Pick the annual plan_type when the toggle is on AND it exists;
    // otherwise drop back to monthly so the CTA still works for the
    // monthly-only Endurance Básico.
    const exact = effectivelyAnnual(p) ? p.plan_type_annual : p.plan_type_monthly;
    const planParam = exact ?? `${p.base_type}${effectivelyAnnual(p) ? "_annual" : "_monthly"}`;
    return `/register?plan=${encodeURIComponent(planParam)}`;
  };

  const planButtonText = (p: GroupedPlan) => {
    if (p.is_event) return t("landing.pricing.buyEvent");
    if (p.is_popular) return t("landing.pricing.startNow");
    return trialDays > 0
      ? t("landing.pricing.tryFreeDays", { days: trialDays })
      : t("landing.pricing.subscribe");
  };

  const planButtonHref = (p: GroupedPlan) => planLink(p);

  /** Pretty-print a price in es-ES (e.g. 89.90 → "89,90"). */
  const formatPrice = (value: number): string =>
    value.toLocaleString("es-ES", {
      minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
      maximumFractionDigits: 2,
    });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
        <span className="sr-only">{t("landing.pricing.loading")}</span>
      </div>
    );
  }

  return (
    <div ref={sectionRef}>
      {/* Toggle */}
      <div className="flex items-center justify-center gap-4 mb-16">
        <span
          className={`text-sm font-medium transition-colors duration-200 ${
            !annual ? "text-white" : "text-muted/30"
          }`}
        >
          {t("landing.pricing.monthly")}
        </span>
        <button
          onClick={() => setAnnual(!annual)}
          className={`relative h-8 w-16 rounded-full transition-all duration-300 ${
            annual
              ? "bg-accent shadow-[0_0_20px_rgba(159,229,86,0.2)]"
              : "bg-border/60"
          }`}
          aria-label={t("landing.pricing.toggleAria")}
        >
          <span
            className={`absolute top-1 left-1 h-6 w-6 rounded-full bg-white shadow-md transition-all duration-300 ${
              annual ? "translate-x-8" : ""
            }`}
          />
        </button>
        <span
          className={`text-sm font-medium transition-colors duration-200 ${
            annual ? "text-white" : "text-muted/30"
          }`}
        >
          {t("landing.pricing.annual")}
        </span>
        {annual && (
          <span className="rounded-full bg-accent/15 border border-accent/20 px-3 py-1 text-xs font-bold text-accent font-mono">
            {t("landing.pricing.twoMonthsFree")}
          </span>
        )}
      </div>

      {/* Cards */}
      <div className={`grid gap-5 max-w-5xl mx-auto items-start ${
        plans.length === 1 ? "md:grid-cols-1 max-w-sm" :
        plans.length === 2 ? "md:grid-cols-2 max-w-3xl" :
        "md:grid-cols-3"
      }`}>
        {plans.map((plan) => (
          <div
            key={plan.base_type}
            className={`relative rounded-2xl border overflow-hidden transition-all duration-300 hover:-translate-y-1 ${
              plan.is_popular
                ? "bg-accent/[0.03] border-accent/40 shadow-[0_0_60px_rgba(159,229,86,0.1)] md:scale-105"
                : plan.is_event
                  ? "bg-[#1a1708] border-gold/30 hover:border-gold/50"
                  : "bg-surface border-border/50 hover:border-border"
            }`}
          >
            {/* Top gradient bar */}
            <div className={`h-1 bg-gradient-to-r ${getTierGradient(plan.base_type)}`} />

            {plan.is_popular && (
              <div className="absolute top-4 right-4">
                <span className="rounded-full bg-accent px-3 py-1 text-[10px] font-bold text-black uppercase tracking-wider">
                  {t("landing.pricing.popular")}
                </span>
              </div>
            )}

            <div className="p-7">
              <h3 className="text-lg font-bold text-white">
                {plan.display_name}
              </h3>
              {plan.description && (
                <p className="text-sm text-muted/40 mt-1">{plan.description}</p>
              )}

              <div className="mt-5 mb-7">
                <div className="flex items-baseline gap-1">
                  <span className="stat-number text-4xl font-bold text-white">
                    {plan.is_event
                      ? formatPrice(plan.price_event ?? 0)
                      : effectivelyAnnual(plan)
                        ? formatPrice(plan.price_annual ?? 0)
                        : formatPrice(plan.price_monthly ?? 0)}
                  </span>
                  <span className="text-lg text-muted/40">&euro;</span>
                  <span className="text-sm text-muted/30 ml-1">
                    {plan.is_event
                      ? t("landing.pricing.perEvent")
                      : effectivelyAnnual(plan)
                        ? t("landing.pricing.perYear")
                        : t("landing.pricing.perMonth")}
                  </span>
                </div>

                {/* Equivalent monthly under an annual price \u2014 keep 2
                    decimals because individual_annual is 89,90 \u20AC \u2192
                    7,49 \u20AC/mes (rounding to 7 would mislead). */}
                {effectivelyAnnual(plan) && plan.price_annual && (
                  <p className="font-mono text-xs text-muted/25 mt-1">
                    {t("landing.pricing.equivPerMonth", { price: formatPrice((plan.price_annual ?? 0) / 12) })}
                  </p>
                )}

                {/* Honest savings badge on the annual variant. Only
                    when the plan also has a monthly price to compare
                    against \u2014 Endurance B\u00E1sico doesn't qualify. */}
                {effectivelyAnnual(plan) && plan.price_monthly && plan.price_annual && (
                  (() => {
                    const fullYear = plan.price_monthly * 12;
                    const savePct = Math.round((1 - plan.price_annual / fullYear) * 100);
                    if (savePct <= 0) return null;
                    return (
                      <span className="inline-block mt-2 rounded-full bg-accent/15 border border-accent/30 px-2.5 py-0.5 text-[10px] font-semibold text-accent">
                        {t("landing.pricing.savingsBadge", { pct: savePct })}
                      </span>
                    );
                  })()
                )}

                {/* User flipped the toggle to "Anual" but this plan
                    only sells monthly. We keep the card visible and
                    explain why instead of vanishing from the grid. */}
                {annual && !plan.is_event && plan.price_annual == null && (
                  <p className="mt-2 text-[11px] text-muted/40">
                    {t("landing.pricing.monthlyOnly")}
                  </p>
                )}
              </div>

              <ul className="space-y-3 mb-8">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-3 text-sm text-neutral-400">
                    <svg
                      className="mt-0.5 h-4 w-4 shrink-0 text-accent/70"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>

              {plan.coming_soon ? (
                <div
                  aria-disabled="true"
                  title={t("landing.pricing.comingSoonTitle")}
                  className="block w-full rounded-xl py-3.5 text-center text-sm font-bold uppercase tracking-wide bg-white/[0.04] border-2 border-border/60 text-muted/40 cursor-not-allowed select-none"
                >
                  {t("landing.pricing.comingSoon")}
                </div>
              ) : (
                <a
                  href={planButtonHref(plan)}
                  onClick={() => {
                    // Funnel: plan click. We don't preventDefault — the
                    // navigation continues. tracker.ts uses sendBeacon on
                    // pagehide so the event survives the page transition.
                    const isAnnual = effectivelyAnnual(plan);
                    const planParam =
                      plan.is_event
                        ? (plan.plan_type_event ?? "event")
                        : (isAnnual ? plan.plan_type_annual : plan.plan_type_monthly)
                            ?? `${plan.base_type}${isAnnual ? "_annual" : "_monthly"}`;
                    trackFunnel("pricing.plan_click", {
                      plan_type: planParam,
                      base_type: plan.base_type,
                      interval: plan.is_event ? "event" : isAnnual ? "annual" : "monthly",
                      is_popular: plan.is_popular,
                    });
                  }}
                  className={`block w-full rounded-xl py-3.5 text-center text-sm font-bold uppercase tracking-wide transition-all duration-200 ${
                    plan.is_popular
                      ? "bg-accent text-black hover:bg-accent-hover shadow-[0_0_20px_rgba(159,229,86,0.15)] hover:shadow-[0_0_30px_rgba(159,229,86,0.3)]"
                      : plan.is_event
                        ? "bg-gradient-to-r from-gold/90 to-yellow-500/90 text-black border border-gold/50 hover:shadow-[0_0_20px_rgba(234,179,8,0.2)]"
                        : "bg-white/[0.06] border-2 border-accent/30 text-accent hover:border-accent/60 hover:bg-accent/10 hover:shadow-[0_0_20px_rgba(159,229,86,0.1)]"
                  }`}
                >
                  {planButtonText(plan)}
                </a>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Extra notes */}
      <div className="mt-14 text-center">
        <p className="text-sm text-muted/30">
          {t("landing.pricing.contactPrefix")}{" "}
          <a
            href="mailto:info@kartingnow.com"
            className="text-accent/70 hover:text-accent hover:underline transition-colors"
          >
            info@kartingnow.com
          </a>{" "}
          {t("landing.pricing.contactSuffix")}
        </p>
      </div>
    </div>
  );
}
