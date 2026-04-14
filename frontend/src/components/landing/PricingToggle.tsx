"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";

interface PlanData {
  plan_type: string;
  display_name: string;
  description: string | null;
  features: string[];
  price_amount: number | null;
  billing_interval: string | null;  // "month", "year", "one_time"
  is_popular: boolean;
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
  is_event: boolean;
  sort_order: number;
}

// Hardcoded fallback if API is unavailable
const FALLBACK_PLANS: PlanData[] = [
  { plan_type: "basic_monthly", display_name: "Basico", description: null, features: ["1 circuito incluido", "Posiciones en tiempo real", "Gestion de boxes", "Clasificacion real", "Vista de piloto", "Hasta 2 dispositivos"], price_amount: 49, billing_interval: "month", is_popular: false, sort_order: 1 },
  { plan_type: "basic_annual", display_name: "Basico", description: null, features: ["1 circuito incluido", "Posiciones en tiempo real", "Gestion de boxes", "Clasificacion real", "Vista de piloto", "Hasta 2 dispositivos"], price_amount: 490, billing_interval: "year", is_popular: false, sort_order: 1 },
  { plan_type: "pro_monthly", display_name: "Pro", description: null, features: ["1 circuito incluido", "Todo en Basico +", "Analitica de karts", "GPS Insights", "Replay de carreras", "Hasta 5 dispositivos", "Soporte prioritario"], price_amount: 79, billing_interval: "month", is_popular: true, sort_order: 2 },
  { plan_type: "pro_annual", display_name: "Pro", description: null, features: ["1 circuito incluido", "Todo en Basico +", "Analitica de karts", "GPS Insights", "Replay de carreras", "Hasta 5 dispositivos", "Soporte prioritario"], price_amount: 790, billing_interval: "year", is_popular: true, sort_order: 2 },
  { plan_type: "event", display_name: "Evento", description: null, features: ["Acceso completo 48h", "1 circuito", "Todas las funcionalidades", "Hasta 3 dispositivos", "Sin compromiso"], price_amount: 50, billing_interval: "one_time", is_popular: false, sort_order: 3 },
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
      if (p.features.length > existing.features.length) existing.features = p.features;
    }
  }

  return Array.from(map.values()).sort((a, b) => a.sort_order - b.sort_order);
}

const tierColors: Record<string, string> = {
  basic: "from-muted/30 to-muted/10",
  pro: "from-accent to-accent-hover",
  event: "from-gold to-yellow-500",
};

function getTierGradient(baseType: string): string {
  for (const key of Object.keys(tierColors)) {
    if (baseType.toLowerCase().includes(key)) return tierColors[key];
  }
  return tierColors.basic;
}

export function PricingToggle() {
  const [annual, setAnnual] = useState(false);
  const [plans, setPlans] = useState<GroupedPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [trialDays, setTrialDays] = useState(0);

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

  const planLink = (p: GroupedPlan) => {
    // Use the exact plan_type from the DB so the /register → /dashboard
    // round-trip preserves it (required so per_circuit lookup matches).
    if (p.is_event) {
      const evt = p.plan_type_event ?? "event";
      return `/register?plan=${encodeURIComponent(evt)}`;
    }
    const exact = annual ? p.plan_type_annual : p.plan_type_monthly;
    // Fallback (shouldn't happen with real data): reconstruct from base.
    const planParam = exact ?? `${p.base_type}${annual ? "_annual" : "_monthly"}`;
    return `/register?plan=${encodeURIComponent(planParam)}`;
  };

  const planButtonText = (p: GroupedPlan) => {
    if (p.is_event) return "Comprar evento";
    if (p.is_popular) return trialDays > 0 ? "Empezar ahora" : "Empezar ahora";
    return trialDays > 0 ? `Probar gratis ${trialDays} dias` : "Suscribirse";
  };

  const planButtonHref = (p: GroupedPlan) => {
    if (trialDays > 0 || p.is_event) return planLink(p);
    return planLink(p);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
      </div>
    );
  }

  return (
    <div>
      {/* Toggle */}
      <div className="flex items-center justify-center gap-4 mb-16">
        <span
          className={`text-sm font-medium transition-colors duration-200 ${
            !annual ? "text-white" : "text-muted/30"
          }`}
        >
          Mensual
        </span>
        <button
          onClick={() => setAnnual(!annual)}
          className={`relative h-8 w-16 rounded-full transition-all duration-300 ${
            annual
              ? "bg-accent shadow-[0_0_20px_rgba(159,229,86,0.2)]"
              : "bg-border/60"
          }`}
          aria-label="Cambiar entre mensual y anual"
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
          Anual
        </span>
        {annual && (
          <span className="rounded-full bg-accent/15 border border-accent/20 px-3 py-1 text-xs font-bold text-accent font-mono">
            -17%
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
                  Popular
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
                      ? `${plan.price_event ?? 0}`
                      : annual
                      ? `${plan.price_annual ?? 0}`
                      : `${plan.price_monthly ?? 0}`}
                  </span>
                  <span className="text-lg text-muted/40">&euro;</span>
                  <span className="text-sm text-muted/30 ml-1">
                    {plan.is_event ? "/evento" : annual ? "/a\u00F1o" : "/mes"}
                  </span>
                </div>
                {annual && !plan.is_event && plan.price_monthly && (
                  <p className="font-mono text-xs text-muted/25 mt-1">
                    equiv. {Math.round((plan.price_annual ?? 0) / 12)}&euro;/mes
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

              <a
                href={planButtonHref(plan)}
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
            </div>
          </div>
        ))}
      </div>

      {/* Extra notes */}
      <div className="mt-14 text-center space-y-2">
        <p className="text-sm text-muted/30">
          Circuitos adicionales desde 15{"\u20AC"}/mes
        </p>
        <p className="text-sm text-muted/30">
          &iquest;Eres un circuito?{" "}
          <a
            href="mailto:contacto@boxboxnow.com"
            className="text-accent/70 hover:text-accent hover:underline transition-colors"
          >
            Contacta para planes Enterprise
          </a>
          .
        </p>
      </div>
    </div>
  );
}
