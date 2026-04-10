"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useConfirm } from "@/components/shared/ConfirmDialog";

interface Sub {
  id: number;
  plan_type: string;
  status: string;
  circuit_id: number | null;
  circuit_name: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
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
  const sym = currency === "eur" ? "\u20AC" : currency?.toUpperCase() || "\u20AC";
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
  const [tab, setTab] = useState<"subs" | "invoices">("subs");

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
      message: `¿Cambiar a ${newLabel}? El cambio se aplicará de forma inmediata.`,
      confirmText: `Cambiar a ${newLabel.split(" ").pop()}`,
      cancelText: "Cancelar",
    });
    if (!ok) return;
    setActionLoading(subId);
    try {
      await api.switchPlan(subId, newPlan);
      await loadData();
    } catch {
      alert("Error al cambiar el plan");
    } finally {
      setActionLoading(null);
    }
  };

  const handleOpenPortal = async () => {
    try {
      const data = await api.getCustomerPortal();
      window.location.href = data.url;
    } catch {
      alert("Error al abrir el portal de pagos");
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
        <button
          onClick={handleOpenPortal}
          className="shrink-0 flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl bg-white/[0.06] border border-border text-neutral-200 hover:text-white hover:bg-white/[0.1] hover:border-neutral-500 transition-all"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
          </svg>
          Gestionar métodos de pago
        </button>
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
          onClick={() => setTab("invoices")}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            tab === "invoices"
              ? "bg-surface text-white"
              : "text-neutral-400 hover:text-neutral-200"
          }`}
        >
          Facturas ({invoices.length})
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
                    </div>
                    <div className="shrink-0 flex flex-col gap-1.5">
                      {sub.status === "active" && !sub.cancel_at_period_end && sub.plan_type !== "trial" && (() => {
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
                      {sub.status === "active" && !sub.cancel_at_period_end && sub.plan_type !== "trial" && (
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

      {/* Invoices */}
      {tab === "invoices" && (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          {invoices.length === 0 ? (
            <div className="p-8 text-center text-neutral-400">
              No hay facturas disponibles
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-neutral-400 text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-3 font-medium">Fecha</th>
                  <th className="text-left px-4 py-3 font-medium">Numero</th>
                  <th className="text-right px-4 py-3 font-medium">Importe</th>
                  <th className="text-right px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-border/50 last:border-0 hover:bg-white/[0.02]">
                    <td className="px-4 py-3 text-neutral-300 font-mono text-xs">
                      {formatDate(inv.created)}
                    </td>
                    <td className="px-4 py-3 text-neutral-400 text-xs">
                      {inv.number || "-"}
                    </td>
                    <td className="px-4 py-3 text-right text-white font-mono">
                      {inv.amount_paid.toFixed(2)}{"\u20AC"}
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
                            title="Ver factura"
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
      )}
    </div>
  );
}
