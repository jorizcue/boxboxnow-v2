"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useConfirm } from "@/components/shared/ConfirmDialog";
import { PaymentMethodsPanel } from "./PaymentMethodsPanel";

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
  const [tab, setTab] = useState<"subs" | "invoices" | "payment">("subs");

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
      message: `¿Cambiar a ${newLabel}? El cambio se aplicará en la próxima renovación.`,
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

      {/* Password section for Google-only users */}
      {user && !user.has_password && <SetPasswordCard />}

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


/* ------------------------------------------------------------------ */
/*  Set Password Card (for Google-only users)                          */
/* ------------------------------------------------------------------ */

function SetPasswordCard() {
  const { user, updateUser } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Minimo 8 caracteres");
      return;
    }
    if (!/[A-Z]/.test(password)) {
      setError("Debe incluir al menos una mayuscula");
      return;
    }
    if (!/[0-9]/.test(password)) {
      setError("Debe incluir al menos un numero");
      return;
    }
    if (password !== confirm) {
      setError("Las contrasenas no coinciden");
      return;
    }

    setSaving(true);
    try {
      await api.setPassword(password);
      setSuccess(true);
      // Update local user state
      if (user) {
        updateUser({ ...user, has_password: true });
      }
    } catch (err: any) {
      setError(err.message || "Error al establecer la contrasena");
    } finally {
      setSaving(false);
    }
  };

  if (success) {
    return (
      <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-green-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <div>
            <p className="text-sm font-medium text-green-400">Contrasena establecida</p>
            <p className="text-xs text-neutral-400 mt-0.5">
              Ahora puedes iniciar sesion con <strong>{user?.email}</strong> y tu contrasena en cualquier navegador.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
      <div className="flex items-start gap-3">
        <svg className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
        <div className="flex-1">
          <p className="text-sm font-medium text-amber-400">Establece una contrasena</p>
          <p className="text-xs text-neutral-400 mt-1">
            Tu cuenta usa inicio de sesion con Google. Configura una contrasena para poder acceder
            tambien con email y contrasena (necesario en navegadores como Bluefy para RaceBox).
          </p>

          <form onSubmit={handleSubmit} className="mt-3 space-y-2">
            <input
              type="password"
              placeholder="Nueva contrasena"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-black border border-border rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 focus:border-accent focus:outline-none"
            />
            <input
              type="password"
              placeholder="Confirmar contrasena"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full bg-black border border-border rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 focus:border-accent focus:outline-none"
            />
            {error && <p className="text-xs text-red-400">{error}</p>}
            <p className="text-[10px] text-neutral-600">Min. 8 caracteres, 1 mayuscula, 1 numero. Tu usuario para login: <strong className="text-neutral-400">{user?.username}</strong></p>
            <button
              type="submit"
              disabled={saving}
              className="bg-accent hover:bg-accent-hover disabled:opacity-40 text-black text-sm font-bold px-4 py-2 rounded-lg transition-colors"
            >
              {saving ? "Guardando..." : "Establecer contrasena"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
