"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { api } from "@/lib/api";
import { trackAction } from "@/lib/tracker";
import { useAuth } from "@/hooks/useAuth";
import { useConfirm } from "@/components/shared/ConfirmDialog";
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

const EU_COUNTRIES = [
  ["ES", "España"],["DE", "Alemania"],["FR", "Francia"],["IT", "Italia"],["PT", "Portugal"],
  ["NL", "Países Bajos"],["BE", "Bélgica"],["AT", "Austria"],["PL", "Polonia"],["SE", "Suecia"],
  ["DK", "Dinamarca"],["FI", "Finlandia"],["IE", "Irlanda"],["GR", "Grecia"],["CZ", "Rep. Checa"],
  ["RO", "Rumanía"],["HU", "Hungría"],["SK", "Eslovaquia"],["HR", "Croacia"],["GB", "Reino Unido"],
  ["US", "Estados Unidos"],["MX", "México"],["AR", "Argentina"],["CL", "Chile"],["CO", "Colombia"],
];

const TAX_ID_TYPES = [
  // Personal NIF (DNI) o empresa española → Stripe `eu_vat`: el
  // backend añade el prefijo `ES` automáticamente si el usuario no
  // lo escribe (ej. acepta `46937098D` y lo envía como `ES46937098D`).
  ["eu_vat", "NIF / CIF / VAT-UE"],
  ["es_cif", "CIF antiguo (empresas, sin prefijo ES)"],
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

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("es-ES", {
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

function formatPrice(amount?: number, currency?: string, interval?: string): string | null {
  if (amount == null) return null;
  const sym = currency === "eur" ? "€" : currency?.toUpperCase() || "€";
  const per = interval === "year" ? "/año" : "/mes";
  return `${amount.toFixed(2)}${sym}${per}`;
}

function statusBadge(sub: Sub) {
  if (sub.cancel_at_period_end) {
    return (
      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-orange-500/20 text-orange-400 border border-orange-500/30">
        No renueva
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
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${colors[sub.status] || colors.expired}`}>
      {sub.status === "active" ? "Activa" : sub.status === "trialing" ? "Prueba" : sub.status === "canceled" ? "Cancelada" : sub.status}
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
      title: "Cancelar suscripción",
      message: "Se cancelará la renovación automática. Seguirás teniendo acceso hasta el final del periodo actual.",
      confirmText: "Cancelar suscripción",
      cancelText: "Volver",
      danger: true,
    });
    if (!ok) return;
    setActionLoading(subId);
    try {
      await api.cancelSubscription(subId);
      trackAction("subscription.cancel", { sub_id: subId });
      await loadData();
    } catch {
      alert("Error al cancelar la suscripcion");
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
      alert("Error al reactivar la suscripcion");
    } finally {
      setActionLoading(null);
    }
  };

  const handleSwitchPlan = async (subId: number, newPlan: string, newLabel: string) => {
    const ok = await confirm({
      title: "Cambiar de plan",
      message: `¿Cambiar a ${newLabel}? El cambio se aplicará en la próxima renovación.`,
      confirmText: `Cambiar a ${newLabel.split(" ").pop()}`,
      cancelText: "Cancelar",
    });
    if (!ok) return;
    setActionLoading(subId);
    try {
      await api.switchPlan(subId, newPlan);
      trackAction("subscription.switch_plan", { sub_id: subId, new_plan: newPlan });
      await loadData();
    } catch {
      alert("Error al cambiar el plan");
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
      setBillingError(e?.message || "Error al guardar los datos fiscales");
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
          <h2 className="text-xl font-bold text-white">Mi cuenta</h2>
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
          Nueva suscripción
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
          Suscripciones
        </button>
        <button
          onClick={() => setTab("recibos")}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            tab === "recibos"
              ? "bg-surface text-white"
              : "text-neutral-400 hover:text-neutral-200"
          }`}
        >
          Recibos ({invoices.filter((i) => i.kind === "recibo").length})
        </button>
        <button
          onClick={() => setTab("facturas")}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            tab === "facturas"
              ? "bg-surface text-white"
              : "text-neutral-400 hover:text-neutral-200"
          }`}
        >
          Facturas ({invoices.filter((i) => i.kind === "factura").length})
        </button>
        <button
          onClick={() => setTab("payment")}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            tab === "payment"
              ? "bg-surface text-white"
              : "text-neutral-400 hover:text-neutral-200"
          }`}
        >
          Métodos de pago
        </button>
        <button
          onClick={() => setTab("billing")}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            tab === "billing"
              ? "bg-surface text-white"
              : "text-neutral-400 hover:text-neutral-200"
          }`}
        >
          Facturación
        </button>
        <button
          onClick={() => setTab("privacy")}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            tab === "privacy"
              ? "bg-surface text-white"
              : "text-neutral-400 hover:text-neutral-200"
          }`}
        >
          Privacidad
        </button>
      </div>

      {/* Subscriptions */}
      {tab === "subs" && (
        <div className="space-y-3">
          {subs.length === 0 ? (
            <div className="bg-surface border border-border rounded-xl p-8 text-center">
              <p className="text-neutral-400">No tienes suscripciones activas</p>
              <a href="/#pricing" className="inline-block mt-4 px-4 py-2 bg-accent text-black rounded-lg text-sm font-semibold hover:bg-accent-hover transition-colors">
                Ver planes
              </a>
            </div>
          ) : (
            subs.map((sub) => {
              const price = formatPrice(sub.amount, sub.currency, sub.interval);
              return (
                <div key={sub.id} className="bg-surface border border-border rounded-xl p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-white">{planLabel(sub.plan_type)}</span>
                        {statusBadge(sub)}
                        {price && (
                          <span className="text-sm font-mono text-accent">{price}</span>
                        )}
                      </div>
                      {sub.circuit_name && (
                        <p className="text-sm text-neutral-400 mt-1">Circuito: {sub.circuit_name}</p>
                      )}
                      <div className="flex gap-4 mt-2 text-xs text-neutral-500">
                        <span>Inicio: {formatDate(sub.current_period_start)}</span>
                        <span>Fin periodo: {formatDate(sub.current_period_end)}</span>
                      </div>
                      {sub.cancel_at_period_end && (
                        <p className="text-xs text-orange-400 mt-2">
                          No se renovará. Acceso hasta {formatDate(sub.current_period_end)}.
                        </p>
                      )}
                      {sub.pending_plan && (
                        <p className="text-xs text-blue-400 mt-2">
                          Cambio a {planLabel(sub.pending_plan)} programado para la próxima renovación.
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
                            {actionLoading === sub.id ? "..." : `Cambiar a ${alt.label.split(" ").pop()}`}
                          </button>
                        ) : null;
                      })()}
                      {sub.status === "active" && !sub.cancel_at_period_end && sub.plan_type !== "trial" && sub.plan_type !== "event" && (
                        <button
                          onClick={() => handleCancel(sub.id)}
                          disabled={actionLoading === sub.id}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                        >
                          {actionLoading === sub.id ? "..." : "Cancelar"}
                        </button>
                      )}
                      {sub.cancel_at_period_end && sub.status === "active" && (
                        <button
                          onClick={() => handleReactivate(sub.id)}
                          disabled={actionLoading === sub.id}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-accent/30 text-accent hover:bg-accent/10 transition-colors disabled:opacity-50"
                        >
                          {actionLoading === sub.id ? "..." : "Reactivar"}
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
            <h3 className="text-sm font-semibold text-white mb-0.5">Datos fiscales</h3>
            <p className="text-xs text-neutral-500">
              Estos datos se asocian a tu cliente en Stripe y aparecerán en las facturas generadas a partir de ahora.
            </p>
          </div>

          {/* Nombre fiscal */}
          <div>
            <label className="block text-xs text-neutral-400 mb-1 uppercase tracking-wider">
              Nombre / razón social
            </label>
            <input
              type="text"
              placeholder="Ej: Empresa S.L. o Juan García"
              value={billingForm.name}
              onChange={(e) => setBillingForm((p) => ({ ...p, name: e.target.value }))}
              className="w-full bg-black border border-border rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-accent/50"
            />
          </div>

          {/* NIF / CIF */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-neutral-400 mb-1 uppercase tracking-wider">
                Tipo de ID fiscal
              </label>
              <select
                value={billingTaxType}
                onChange={(e) => setBillingTaxType(e.target.value)}
                className="w-full bg-black border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent/50"
              >
                <option value="">— Sin ID fiscal —</option>
                {TAX_ID_TYPES.map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-neutral-400 mb-1 uppercase tracking-wider">
                Número NIF / CIF / VAT
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
                  Para España puedes escribir solo el NIF/CIF (sin prefijo
                  &quot;ES&quot;) — lo añadimos automáticamente al enviarlo a Stripe.
                </p>
              )}
            </div>
          </div>

          {/* Dirección */}
          <div className="space-y-3">
            <p className="text-xs text-neutral-400 uppercase tracking-wider">Dirección de facturación</p>
            <input
              type="text"
              placeholder="Calle y número"
              value={billingForm.address.line1}
              onChange={(e) => setBillingForm((p) => ({ ...p, address: { ...p.address, line1: e.target.value } }))}
              className="w-full bg-black border border-border rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-accent/50"
            />
            <input
              type="text"
              placeholder="Piso, puerta, etc. (opcional)"
              value={billingForm.address.line2}
              onChange={(e) => setBillingForm((p) => ({ ...p, address: { ...p.address, line2: e.target.value } }))}
              className="w-full bg-black border border-border rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-accent/50"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="Ciudad"
                value={billingForm.address.city}
                onChange={(e) => setBillingForm((p) => ({ ...p, address: { ...p.address, city: e.target.value } }))}
                className="w-full bg-black border border-border rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-accent/50"
              />
              <input
                type="text"
                placeholder="Código postal"
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
              {EU_COUNTRIES.map(([code, name]) => (
                <option key={code} value={code}>{name}</option>
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
              {billingSaving ? "Guardando..." : "Guardar datos fiscales"}
            </button>
            {billingSaved && (
              <span className="text-xs text-green-400">✓ Datos actualizados en Stripe</span>
            )}
            {billingError && (
              <span className="text-xs text-red-400">{billingError}</span>
            )}
          </div>

          {/* Current saved tax IDs info */}
          {billing.tax_ids.length > 0 && (
            <div className="border-t border-border pt-4">
              <p className="text-xs text-neutral-500 mb-2">ID fiscal registrado en Stripe:</p>
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
              No hay recibos disponibles.
              <br />
              <span className="text-xs text-neutral-500">
                Los recibos se generan automáticamente con cada cobro. Si necesitas factura con datos fiscales,
                puedes <button onClick={() => setTab("billing")} className="underline hover:text-white">
                  añadir tu información fiscal
                </button> y se aplicará a los próximos cobros.
              </span>
            </>
          }
          openLabel="Ver recibo"
        />
      )}

      {/* Facturas — facturas legales (con NIF + dirección fiscal) */}
      {tab === "facturas" && (
        <InvoicesTable
          items={invoices.filter((i) => i.kind === "factura")}
          emptyMessage={
            <>
              No hay facturas disponibles.
              <br />
              <span className="text-xs text-neutral-500">
                Para recibir factura legal en tu próxima renovación, añade tu nombre fiscal,
                NIF y dirección en <button onClick={() => setTab("billing")} className="underline hover:text-white">
                  Facturación
                </button>.
              </span>
            </>
          }
          openLabel="Ver factura"
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
  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      {items.length === 0 ? (
        <div className="p-8 text-center text-neutral-400">{emptyMessage}</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-neutral-400 text-xs uppercase tracking-wider">
              <th className="text-left px-4 py-3 font-medium">Fecha</th>
              <th className="text-left px-4 py-3 font-medium">Número</th>
              <th className="text-right px-4 py-3 font-medium">Importe</th>
              <th className="text-right px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((inv) => (
              <tr key={inv.id} className="border-b border-border/50 last:border-0 hover:bg-white/[0.02]">
                <td className="px-4 py-3 text-neutral-300 font-mono text-xs">
                  {formatDate(inv.created)}
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
                        title="Descargar PDF"
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
                        Ver
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
          Analítica interna
        </h3>
        <p className="text-xs text-neutral-500 leading-relaxed">
          Usamos analítica propia y agregada (sin terceros) para entender
          cómo se usa la plataforma y mejorar el producto. Puedes
          desactivarla aquí. Si lo haces, dejaremos de registrar eventos
          de tu navegador inmediatamente.
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
            Permitir analítica interna agregada
          </div>
          <div className="text-xs text-neutral-500 mt-0.5">
            Activado por defecto. No se comparte con terceros.{" "}
            <a href="/cookies" className="text-accent hover:underline">
              Más información
            </a>
            .
          </div>
        </div>
      </label>
    </div>
  );
}


