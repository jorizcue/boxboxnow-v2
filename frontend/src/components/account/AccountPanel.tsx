"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { api } from "@/lib/api";
import { trackAction } from "@/lib/tracker";
import { useAuth } from "@/hooks/useAuth";
import { useConfirm } from "@/components/shared/ConfirmDialog";
import { useT, useLangStore } from "@/lib/i18n";
import { PaymentMethodsPanel } from "./PaymentMethodsPanel";

// BoxBoxNow opera como club deportivo exento de IVA (art. 20.1.13º
// LIVA), así que no emitimos facturas con datos fiscales — solo
// recibos simplificados. La antigua pestaña "Facturación" para que
// el usuario rellenase NIF + dirección, la pestaña "Facturas", el
// tipo BillingInfo, las constantes COUNTRY_CODES y TAX_ID_TYPES y
// todos los handlers asociados se eliminaron. El panel queda con
// 4 pestañas: Suscripciones, Recibos, Métodos de pago, Privacidad.

interface Sub {
  id: number;
  plan_type: string;
  status: string;
  circuit_id: number | null;
  circuit_name: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  pending_plan?: string | null;
  created_at: string | null;
  amount?: number;
  currency?: string;
  interval?: string;
}

interface Invoice {
  id: string;
  number: string | null;
  amount_paid: number;
  currency: string;
  status: string;
  created: string;
  // PDF descargable del recibo. Stripe lo genera para cada cobro de
  // subscription. El antiguo `hosted_invoice_url` (página alojada en
  // Stripe) y el campo `kind` (factura vs recibo) se quitaron — ahora
  // todos los documentos son recibos simplificados.
  invoice_pdf: string | null;
}

/** Map the i18n language code to the BCP-47 locale we hand to
 *  `toLocaleDateString`. `es-ES` style — Spanish dates look like
 *  "13 may 2026", English "13 May 2026", etc. */
const DATE_LOCALE: Record<string, string> = {
  es: "es-ES", en: "en-GB", it: "it-IT", de: "de-DE", fr: "fr-FR",
};

function formatDate(iso: string | null, lang: string = "es"): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString(DATE_LOCALE[lang] ?? "es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function planLabel(planType: string): string {
  const labels: Record<string, string> = {
    // Current catalog (Individual / Endurance Básico / Endurance Pro)
    individual_monthly: "Individual Mensual",
    individual_annual: "Individual Anual",
    endurance_basic_monthly: "Endurance Básico",
    endurance_pro_monthly: "Endurance Pro Mensual",
    endurance_pro_annual: "Endurance Pro Anual",
    // Legacy plan_types kept so existing subscriptions created before the
    // catalog rename still render with a readable label instead of the
    // raw plan_type string.
    basic_monthly: "Basico Mensual",
    basic_annual: "Basico Anual",
    pro_monthly: "Pro Mensual",
    pro_annual: "Pro Anual",
    event: "Evento",
    trial: "Prueba gratuita",
  };
  return labels[planType] || planType;
}

/** Map interval → localized "/month" / "/year" suffix. Defaults are
 *  Spanish so existing behaviour is preserved when no lang is passed. */
const INTERVAL_SUFFIX: Record<string, { month: string; year: string }> = {
  es: { month: "/mes",   year: "/año"   },
  en: { month: "/month", year: "/year"  },
  it: { month: "/mese",  year: "/anno"  },
  de: { month: "/Monat", year: "/Jahr"  },
  fr: { month: "/mois",  year: "/an"    },
};

function formatPrice(
  amount?: number,
  currency?: string,
  interval?: string,
  lang: string = "es",
): string | null {
  if (amount == null) return null;
  const sym = currency === "eur" ? "€" : currency?.toUpperCase() || "€";
  const suffix = INTERVAL_SUFFIX[lang] ?? INTERVAL_SUFFIX.es;
  const per = interval === "year" ? suffix.year : suffix.month;
  return `${amount.toFixed(2)}${sym}${per}`;
}

function StatusBadge({ sub }: { sub: Sub }) {
  const t = useT();
  if (sub.cancel_at_period_end) {
    return (
      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-orange-500/20 text-orange-400 border border-orange-500/30">
        {t("account.subs.status.noRenew")}
      </span>
    );
  }
  const colors: Record<string, string> = {
    active: "bg-green-500/20 text-green-400 border-green-500/30",
    trialing: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    canceled: "bg-red-500/20 text-red-400 border-red-500/30",
    past_due: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    expired: "bg-neutral-500/20 text-neutral-400 border-neutral-500/30",
  };
  const label =
    sub.status === "active"   ? t("account.subs.status.active")
    : sub.status === "trialing" ? t("account.subs.status.trialing")
    : sub.status === "canceled" ? t("account.subs.status.canceled")
    : sub.status;
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${colors[sub.status] || colors.expired}`}>
      {label}
    </span>
  );
}

/** Given a plan_type, return the alternate billing interval plan */
function getAlternatePlan(planType: string): { plan: string; label: string } | null {
  const swaps: Record<string, { plan: string; label: string }> = {
    // Current catalog
    individual_monthly: { plan: "individual_annual", label: "Individual Anual" },
    individual_annual: { plan: "individual_monthly", label: "Individual Mensual" },
    endurance_pro_monthly: { plan: "endurance_pro_annual", label: "Endurance Pro Anual" },
    endurance_pro_annual: { plan: "endurance_pro_monthly", label: "Endurance Pro Mensual" },
    // (endurance_basic only sells monthly — intentionally no entry so the
    //  "Cambiar a anual" button doesn't appear for that plan.)
    // Legacy plan_types — kept so any historical subscription that still
    // carries the old label can offer a swap.
    basic_monthly: { plan: "basic_annual", label: "Basico Anual" },
    basic_annual: { plan: "basic_monthly", label: "Basico Mensual" },
    pro_monthly: { plan: "pro_annual", label: "Pro Anual" },
    pro_annual: { plan: "pro_monthly", label: "Pro Mensual" },
  };
  return swaps[planType] || null;
}

export function AccountPanel() {
  const { user } = useAuth();
  const confirm = useConfirm();
  const t = useT();
  // Subscribing to `lang` here is what makes the whole panel re-render
  // when the user flips language from the toolbar — without it, the
  // sub-components that call `useT()` re-render but cached fields
  // (formatDate / formatPrice outputs) wouldn't update.
  const lang = useLangStore((s) => s.lang);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  // Tabs: subs = Suscripciones · recibos = recibos simplificados
  // del cobro · payment = métodos de pago · privacy = privacidad.
  // Las antiguas pestañas "Facturas" y "Facturación" desaparecieron
  // junto con todo el manejo de datos fiscales (el club está exento
  // de IVA, todos los cobros son recibos simplificados).
  const [tab, setTab] = useState<"subs" | "recibos" | "payment" | "privacy">("subs");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [subsData, invoicesData] = await Promise.all([
        api.getSubscriptions(),
        api.getInvoices(),
      ]);
      setSubs(subsData);
      setInvoices(invoicesData);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleCancel = async (subId: number) => {
    const ok = await confirm({
      title: t("account.subs.confirmCancel.title"),
      message: t("account.subs.confirmCancel.message"),
      confirmText: t("account.subs.confirmCancel.confirm"),
      cancelText: t("account.subs.confirmCancel.back"),
      danger: true,
    });
    if (!ok) return;
    setActionLoading(subId);
    try {
      await api.cancelSubscription(subId);
      trackAction("subscription.cancel", { sub_id: subId });
      await loadData();
    } catch {
      alert(t("account.subs.errors.cancel"));
    } finally {
      setActionLoading(null);
    }
  };

  const handleReactivate = async (subId: number) => {
    setActionLoading(subId);
    try {
      await api.reactivateSubscription(subId);
      trackAction("subscription.reactivate", { sub_id: subId });
      await loadData();
    } catch {
      alert(t("account.subs.errors.reactivate"));
    } finally {
      setActionLoading(null);
    }
  };

  const handleSwitchPlan = async (subId: number, newPlan: string, newLabel: string) => {
    const ok = await confirm({
      title: t("account.subs.confirmSwitch.title"),
      message: t("account.subs.confirmSwitch.message", { plan: newLabel }),
      confirmText: `${t("account.subs.switchToPrefix")} ${newLabel.split(" ").pop() ?? ""}`,
      cancelText: t("account.subs.cancel"),
    });
    if (!ok) return;
    setActionLoading(subId);
    try {
      await api.switchPlan(subId, newPlan);
      trackAction("subscription.switch_plan", { sub_id: subId, new_plan: newPlan });
      await loadData();
    } catch {
      alert(t("account.subs.errors.switch"));
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">{t("account.title")}</h2>
          <p className="text-sm text-neutral-400 mt-1">
            {user?.username} {user?.email ? `· ${user.email}` : ""}
          </p>
        </div>
        <a
          href="/#pricing"
          className="shrink-0 flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl bg-accent hover:bg-accent-hover text-black transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          {t("account.newSubscription")}
        </a>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 bg-black/40 rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab("subs")}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            tab === "subs"
              ? "bg-surface text-white"
              : "text-neutral-400 hover:text-neutral-200"
          }`}
        >
          {t("account.tab.subs")}
        </button>
        <button
          onClick={() => setTab("recibos")}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            tab === "recibos"
              ? "bg-surface text-white"
              : "text-neutral-400 hover:text-neutral-200"
          }`}
        >
          {t("account.tab.recibos")} ({invoices.length})
        </button>
        <button
          onClick={() => setTab("payment")}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            tab === "payment"
              ? "bg-surface text-white"
              : "text-neutral-400 hover:text-neutral-200"
          }`}
        >
          {t("account.tab.payment")}
        </button>
        <button
          onClick={() => setTab("privacy")}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            tab === "privacy"
              ? "bg-surface text-white"
              : "text-neutral-400 hover:text-neutral-200"
          }`}
        >
          {t("account.tab.privacy")}
        </button>
      </div>

      {/* Subscriptions */}
      {tab === "subs" && (
        <div className="space-y-3">
          {subs.length === 0 ? (
            <div className="bg-surface border border-border rounded-xl p-8 text-center">
              <p className="text-neutral-400">{t("account.subs.empty")}</p>
              <a href="/#pricing" className="inline-block mt-4 px-4 py-2 bg-accent text-black rounded-lg text-sm font-semibold hover:bg-accent-hover transition-colors">
                {t("account.subs.viewPlans")}
              </a>
            </div>
          ) : (
            subs.map((sub) => {
              const price = formatPrice(sub.amount, sub.currency, sub.interval, lang);
              return (
                <div key={sub.id} className="bg-surface border border-border rounded-xl p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-white">{planLabel(sub.plan_type)}</span>
                        <StatusBadge sub={sub} />
                        {price && (
                          <span className="text-sm font-mono text-accent">{price}</span>
                        )}
                      </div>
                      {sub.circuit_name && (
                        <p className="text-sm text-neutral-400 mt-1">{t("account.subs.circuit")}: {sub.circuit_name}</p>
                      )}
                      <div className="flex gap-4 mt-2 text-xs text-neutral-500">
                        <span>{t("account.subs.start")}: {formatDate(sub.current_period_start, lang)}</span>
                        <span>{t("account.subs.endPeriod")}: {formatDate(sub.current_period_end, lang)}</span>
                      </div>
                      {sub.cancel_at_period_end && (
                        <p className="text-xs text-orange-400 mt-2">
                          {t("account.subs.willNotRenew", { date: formatDate(sub.current_period_end, lang) })}
                        </p>
                      )}
                      {sub.pending_plan && (
                        <p className="text-xs text-blue-400 mt-2">
                          {t("account.subs.pendingChange", { plan: planLabel(sub.pending_plan) })}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 flex flex-col gap-1.5">
                      {sub.status === "active" && !sub.cancel_at_period_end && !sub.pending_plan && sub.plan_type !== "trial" && (() => {
                        const alt = getAlternatePlan(sub.plan_type);
                        return alt ? (
                          <button
                            onClick={() => handleSwitchPlan(sub.id, alt.plan, alt.label)}
                            disabled={actionLoading === sub.id}
                            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-blue-500/30 text-blue-400 hover:bg-blue-500/10 transition-colors disabled:opacity-50"
                          >
                            {actionLoading === sub.id ? "..." : `${t("account.subs.switchToPrefix")} ${alt.label.split(" ").pop()}`}
                          </button>
                        ) : null;
                      })()}
                      {sub.status === "active" && !sub.cancel_at_period_end && sub.plan_type !== "trial" && sub.plan_type !== "event" && (
                        <button
                          onClick={() => handleCancel(sub.id)}
                          disabled={actionLoading === sub.id}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                        >
                          {actionLoading === sub.id ? "..." : t("account.subs.cancel")}
                        </button>
                      )}
                      {sub.cancel_at_period_end && sub.status === "active" && (
                        <button
                          onClick={() => handleReactivate(sub.id)}
                          disabled={actionLoading === sub.id}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-accent/30 text-accent hover:bg-accent/10 transition-colors disabled:opacity-50"
                        >
                          {actionLoading === sub.id ? "..." : t("account.subs.reactivate")}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Payment methods */}
      {tab === "payment" && <PaymentMethodsPanel />}

      {/* Recibos del cobro — el club está exento de IVA, así que no
          hay distinción factura/recibo: todo lo que cobra Stripe se
          documenta aquí como recibo simplificado descargable en PDF. */}
      {tab === "recibos" && (
        <InvoicesTable
          items={invoices}
          emptyMessage={t("account.recibos.empty")}
        />
      )}

      {tab === "privacy" && <PrivacyTab />}
    </div>
  );
}

/**
 * Tabla de recibos del cobro. Cada fila es una Stripe Invoice; el
 * único enlace que ofrecemos es el PDF descargable (sin el antiguo
 * enlace "Ver en Stripe" hosted_invoice_url, que no aportaba nada
 * para el caso de uso de club deportivo exento de IVA).
 */
function InvoicesTable({
  items,
  emptyMessage,
}: {
  items: Invoice[];
  emptyMessage: ReactNode;
}) {
  const t = useT();
  const lang = useLangStore((s) => s.lang);
  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      {items.length === 0 ? (
        <div className="p-8 text-center text-neutral-400">{emptyMessage}</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-neutral-400 text-xs uppercase tracking-wider">
              <th className="text-left px-4 py-3 font-medium">{t("account.invoices.date")}</th>
              <th className="text-left px-4 py-3 font-medium">{t("account.invoices.number")}</th>
              <th className="text-right px-4 py-3 font-medium">{t("account.invoices.amount")}</th>
              <th className="text-right px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((inv) => (
              <tr key={inv.id} className="border-b border-border/50 last:border-0 hover:bg-white/[0.02]">
                <td className="px-4 py-3 text-neutral-300 font-mono text-xs">
                  {formatDate(inv.created, lang)}
                </td>
                <td className="px-4 py-3 text-neutral-400 text-xs">
                  {inv.number || "-"}
                </td>
                <td className="px-4 py-3 text-right text-white font-mono">
                  {inv.amount_paid.toFixed(2)}{"€"}
                </td>
                <td className="px-4 py-3 text-right">
                  {inv.invoice_pdf && (
                    <a
                      href={inv.invoice_pdf}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-accent hover:text-accent-hover transition-colors font-medium"
                      title={t("account.invoices.downloadPdf")}
                    >
                      PDF
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/**
 * Privacy controls — currently a single toggle for analytics opt-out.
 * Kept as a sub-component because the privacy story is likely to grow
 * (data export, account deletion) and a separate tab keeps things
 * scannable.
 */
function PrivacyTab() {
  const t = useT();
  // We deliberately read the localStorage flag synchronously inside an
  // effect — this is a client-only feature and SSR would otherwise
  // throw. Initial render shows the unchecked state for a frame.
  const [optedOut, setOptedOut] = useState(false);
  useEffect(() => {
    // Lazy import to avoid pulling visitor.ts into the SSR bundle of
    // any code that imports AccountPanel statically.
    import("@/lib/visitor").then((m) => setOptedOut(m.isAnalyticsOptedOut()));
  }, []);

  const handleToggle = (next: boolean) => {
    setOptedOut(next);
    import("@/lib/visitor").then((m) => m.setAnalyticsOptOut(next));
  };

  return (
    <div className="bg-surface border border-border rounded-xl p-6 space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-white mb-0.5">
          {t("account.privacy.title")}
        </h3>
        <p className="text-xs text-neutral-500 leading-relaxed">
          {t("account.privacy.desc")}
        </p>
      </div>
      <label className="flex items-start gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={!optedOut}
          onChange={(e) => handleToggle(!e.target.checked)}
          className="mt-1 w-4 h-4 accent-accent"
        />
        <div>
          <div className="text-sm font-medium text-white">
            {t("account.privacy.allow")}
          </div>
          <div className="text-xs text-neutral-500 mt-0.5">
            {t("account.privacy.allowSub.before")}
            <a href="/cookies" className="text-accent hover:underline">
              {t("account.privacy.allowSub.link")}
            </a>
            .
          </div>
        </div>
      </label>
    </div>
  );
}


