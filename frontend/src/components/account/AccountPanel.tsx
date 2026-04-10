"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

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

export function AccountPanel() {
  const { user } = useAuth();
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
    if (!confirm("Se cancelara la renovacion automatica. Seguiras teniendo acceso hasta el final del periodo actual. Confirmar?")) return;
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
      <div>
        <h2 className="text-xl font-bold text-white">Mi cuenta</h2>
        <p className="text-sm text-neutral-400 mt-1">
          {user?.username} {user?.email ? `· ${user.email}` : ""}
        </p>
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
            subs.map((sub) => (
              <div key={sub.id} className="bg-surface border border-border rounded-xl p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-white">{planLabel(sub.plan_type)}</span>
                      {statusBadge(sub)}
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
                        No se renovara. Acceso hasta {formatDate(sub.current_period_end)}.
                      </p>
                    )}
                  </div>
                  <div className="shrink-0">
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
            ))
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
