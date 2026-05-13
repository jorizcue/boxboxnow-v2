"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { api } from "@/lib/api";
import { trackAction } from "@/lib/tracker";
import { useAuth } from "@/hooks/useAuth";
import { useConfirm } from "@/components/shared/ConfirmDialog";
import { useT, useLangStore } from "@/lib/i18n";
import { PaymentMethodsPanel } from "./PaymentMethodsPanel";

interface BillingAddress {
  line1: string;
  line2: string;
  city: string;
  postal_code: string;
  country: string;
}

interface BillingInfo {
  name: string;
  address: BillingAddress;
  tax_ids: { id: string; type: string; value: string }[];
}

const EMPTY_ADDRESS: BillingAddress = { line1: "", line2: "", city: "", postal_code: "", country: "ES" };
const EMPTY_BILLING: BillingInfo = { name: "", address: EMPTY_ADDRESS, tax_ids: [] };

// ISO codes only — labels come from i18n (`country.<code>` key).
// Order is roughly "most common first" → Spanish-speaking + EU.
const COUNTRY_CODES = [
  "ES", "DE", "FR", "IT", "PT",
  "NL", "BE", "AT", "PL", "SE",
  "DK", "FI", "IE", "GR", "CZ",
  "RO", "HU", "SK", "HR", "GB",
  "US", "MX", "AR", "CL", "CO",
];

// Tax-ID type codes + their i18n label keys. The order is intentional
// (eu_vat first because it covers both personal NIF and company CIF
// after the backend auto-prefixes `ES`).
const TAX_ID_TYPES: { code: string; labelKey: string }[] = [
  { code: "eu_vat", labelKey: "account.billing.taxTypeEuVat" },
  { code: "es_cif", labelKey: "account.billing.taxTypeEsCif" },
];

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
  invoice_pdf: string | null;
  hosted_invoice_url: string | null;
  // `factura` = legal invoice with NIF + dirección fiscal (rellenados
  // por el cliente al pagar). `recibo` = recibo simplificado / ticket
  // (sin datos fiscales). El backend marca cada documento según los
  // datos snapshot que tomó Stripe al emitir la invoice.
  kind: "factura" | "recibo";
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
  // Tabs: subs = Suscripciones · recibos = recibos simplificados (sin
  // datos fiscales) · facturas = facturas legales (con NIF + dirección).
  // Mantenemos pestañas separadas porque legalmente son documentos
  // distintos: el ticket NO sirve para deducir IVA y la factura sí.
  const [tab, setTab] = useState<"subs" | "recibos" | "facturas" | "payment" | "billing" | "privacy">("subs");
  const [billing, setBilling] = useState<BillingInfo>(EMPTY_BILLING);
  const [billingForm, setBillingForm] = useState<BillingInfo>(EMPTY_BILLING);
  const [billingTaxType, setBillingTaxType] = useState("");
  const [billingTaxValue, setBillingTaxValue] = useState("");
  const [billingSaving, setBillingSaving] = useState(false);
  const [billingSaved, setBillingSaved] = useState(false);
  const [billingError, setBillingError] = useState("");

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

  const loadBillingInfo = useCallback(async () => {
    try {
      const data = await api.getBillingInfo();
      setBilling(data);
      setBillingForm(data);
      const firstTaxId = data.tax_ids[0];
      setBillingTaxType(firstTaxId?.type || "");
      setBillingTaxValue(firstTaxId?.value || "");
    } catch {
      // silent — user may not have a Stripe customer yet
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { if (tab === "billing") loadBillingInfo(); }, [tab, loadBillingInfo]);

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

  const handleSaveBilling = async () => {
    setBillingSaving(true);
    setBillingError("");
    setBillingSaved(false);
    try {
      await api.updateBillingInfo({
        name: billingForm.name,
        address: billingForm.address,
        tax_id_type: billingTaxType || undefined,
        tax_id_value: billingTaxValue || undefined,
      });
      setBillingSaved(true);
      await loadBillingInfo();
      setTimeout(() => setBillingSaved(false), 3000);
    } catch (e: any) {
      setBillingError(e?.message || t("account.billing.error"));
    } finally {
      setBillingSaving(false);
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
          {t("account.tab.recibos")} ({invoices.filter((i) => i.kind === "recibo").length})
        </button>
        <button
          onClick={() => setTab("facturas")}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            tab === "facturas"
              ? "bg-surface text-white"
              : "text-neutral-400 hover:text-neutral-200"
          }`}
        >
          {t("account.tab.facturas")} ({invoices.filter((i) => i.kind === "factura").length})
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
          onClick={() => setTab("billing")}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            tab === "billing"
              ? "bg-surface text-white"
              : "text-neutral-400 hover:text-neutral-200"
          }`}
        >
          {t("account.tab.billing")}
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

      {/* Billing / fiscal data */}
      {tab === "billing" && (
        <div className="bg-surface border border-border rounded-xl p-6 space-y-5">
          <div>
            <h3 className="text-sm font-semibold text-white mb-0.5">{t("account.billing.title")}</h3>
            <p className="text-xs text-neutral-500">
              {t("account.billing.desc")}
            </p>
          </div>

          {/* Nombre fiscal */}
          <div>
            <label className="block text-xs text-neutral-400 mb-1 uppercase tracking-wider">
              {t("account.billing.name")}
            </label>
            <input
              type="text"
              placeholder={t("account.billing.namePlaceholder")}
              value={billingForm.name}
              onChange={(e) => setBillingForm((p) => ({ ...p, name: e.target.value }))}
              className="w-full bg-black border border-border rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-accent/50"
            />
          </div>

          {/* NIF / CIF */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-neutral-400 mb-1 uppercase tracking-wider">
                {t("account.billing.taxType")}
              </label>
              <select
                value={billingTaxType}
                onChange={(e) => setBillingTaxType(e.target.value)}
                className="w-full bg-black border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent/50"
              >
                <option value="">{t("account.billing.taxTypeNone")}</option>
                {TAX_ID_TYPES.map(({ code, labelKey }) => (
                  <option key={code} value={code}>{t(labelKey)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-neutral-400 mb-1 uppercase tracking-wider">
                {t("account.billing.taxNumber")}
              </label>
              <input
                type="text"
                placeholder={billingTaxType === "eu_vat" ? "46937098D o ESB12345678" : "B12345678"}
                value={billingTaxValue}
                onChange={(e) => setBillingTaxValue(e.target.value.toUpperCase())}
                disabled={!billingTaxType}
                className="w-full bg-black border border-border rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-accent/50 disabled:opacity-40"
              />
              {billingTaxType === "eu_vat" && (
                <p className="text-[10px] text-neutral-500 mt-1 leading-relaxed">
                  {t("account.billing.taxHelp")}
                </p>
              )}
            </div>
          </div>

          {/* Dirección */}
          <div className="space-y-3">
            <p className="text-xs text-neutral-400 uppercase tracking-wider">{t("account.billing.address")}</p>
            <input
              type="text"
              placeholder={t("account.billing.line1Placeholder")}
              value={billingForm.address.line1}
              onChange={(e) => setBillingForm((p) => ({ ...p, address: { ...p.address, line1: e.target.value } }))}
              className="w-full bg-black border border-border rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-accent/50"
            />
            <input
              type="text"
              placeholder={t("account.billing.line2Placeholder")}
              value={billingForm.address.line2}
              onChange={(e) => setBillingForm((p) => ({ ...p, address: { ...p.address, line2: e.target.value } }))}
              className="w-full bg-black border border-border rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-accent/50"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                placeholder={t("account.billing.cityPlaceholder")}
                value={billingForm.address.city}
                onChange={(e) => setBillingForm((p) => ({ ...p, address: { ...p.address, city: e.target.value } }))}
                className="w-full bg-black border border-border rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-accent/50"
              />
              <input
                type="text"
                placeholder={t("account.billing.postalCode")}
                value={billingForm.address.postal_code}
                onChange={(e) => setBillingForm((p) => ({ ...p, address: { ...p.address, postal_code: e.target.value } }))}
                className="w-full bg-black border border-border rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-accent/50"
              />
            </div>
            <select
              value={billingForm.address.country}
              onChange={(e) => setBillingForm((p) => ({ ...p, address: { ...p.address, country: e.target.value } }))}
              className="w-full bg-black border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent/50"
            >
              {COUNTRY_CODES.map((code) => (
                <option key={code} value={code}>{t(`country.${code}`)}</option>
              ))}
            </select>
          </div>

          {/* Save button */}
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleSaveBilling}
              disabled={billingSaving}
              className="px-5 py-2 bg-accent hover:bg-accent-hover text-black text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              {billingSaving ? t("account.billing.saving") : t("account.billing.save")}
            </button>
            {billingSaved && (
              <span className="text-xs text-green-400">{t("account.billing.saved")}</span>
            )}
            {billingError && (
              <span className="text-xs text-red-400">{billingError}</span>
            )}
          </div>

          {/* Current saved tax IDs info */}
          {billing.tax_ids.length > 0 && (
            <div className="border-t border-border pt-4">
              <p className="text-xs text-neutral-500 mb-2">{t("account.billing.savedTaxId")}</p>
              {billing.tax_ids.map((tid) => (
                <div key={tid.id} className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-accent/10 text-accent border border-accent/20">
                    {tid.type}
                  </span>
                  <span className="text-sm text-white font-mono">{tid.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Recibos — recibos simplificados / tickets (sin NIF) */}
      {tab === "recibos" && (
        <InvoicesTable
          items={invoices.filter((i) => i.kind === "recibo")}
          emptyMessage={
            <>
              {t("account.recibos.empty")}
              <br />
              <span className="text-xs text-neutral-500">
                {t("account.recibos.emptyHint.before")}
                <button onClick={() => setTab("billing")} className="underline hover:text-white">
                  {t("account.recibos.emptyHint.link")}
                </button>
                {t("account.recibos.emptyHint.after")}
              </span>
            </>
          }
          openLabel={t("account.invoices.viewReceipt")}
        />
      )}

      {/* Facturas — facturas legales (con NIF + dirección fiscal) */}
      {tab === "facturas" && (
        <InvoicesTable
          items={invoices.filter((i) => i.kind === "factura")}
          emptyMessage={
            <>
              {t("account.facturas.empty")}
              <br />
              <span className="text-xs text-neutral-500">
                {t("account.facturas.emptyHint.before")}
                <button onClick={() => setTab("billing")} className="underline hover:text-white">
                  {t("account.facturas.emptyHint.link")}
                </button>
                {t("account.facturas.emptyHint.after")}
              </span>
            </>
          }
          openLabel={t("account.invoices.viewInvoice")}
        />
      )}

      {tab === "privacy" && <PrivacyTab />}
    </div>
  );
}

/**
 * Shared table used by both the "Recibos" and "Facturas" tabs. Same
 * Stripe Invoice object underneath — the only thing that changes is
 * the empty-state copy and the link label (recibo vs factura). Keeping
 * it as one component avoids drifting two near-identical tables.
 */
function InvoicesTable({
  items,
  emptyMessage,
  openLabel,
}: {
  items: Invoice[];
  emptyMessage: ReactNode;
  openLabel: string;
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
                  <div className="flex items-center justify-end gap-2">
                    {inv.invoice_pdf && (
                      <a
                        href={inv.invoice_pdf}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-accent hover:text-accent-hover transition-colors"
                        title={t("account.invoices.downloadPdf")}
                      >
                        PDF
                      </a>
                    )}
                    {inv.hosted_invoice_url && (
                      <a
                        href={inv.hosted_invoice_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-neutral-400 hover:text-white transition-colors"
                        title={openLabel}
                      >
                        {t("account.invoices.view")}
                      </a>
                    )}
                  </div>
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


