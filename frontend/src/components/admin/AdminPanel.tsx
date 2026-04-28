"use client";

import { useState, useEffect, lazy, Suspense } from "react";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { CalendarPicker } from "@/components/shared/CalendarPicker";
import { useConfirm } from "@/components/shared/ConfirmDialog";

const FinishLineMap = lazy(() => import("@/components/admin/FinishLineMap"));

interface UserRow {
  id: number;
  username: string;
  is_admin: boolean;
  max_devices: number;
  // Per-user concurrency overrides. When null, the backend falls back to the
  // subscription plan's ProductTabConfig.concurrency_{web,mobile}, then to
  // max_devices. Rendered as editable inputs in the user-detail panel so the
  // admin can pin a specific limit.
  concurrency_web: number | null;
  concurrency_mobile: number | null;
  mfa_enabled: boolean;
  mfa_required: boolean;
  tab_access: string[];
}

interface CircuitRow {
  id: number;
  name: string;
  length_m: number | null;
  pit_time_s: number | null;
  ws_port: number;
  ws_port_data: number | null;
  php_api_port: number;
  laps_discard: number;
  lap_differential: number;
  php_api_url: string | null;
  live_timing_url: string | null;
  retention_days: number;
  finish_lat1: number | null;
  finish_lon1: number | null;
  finish_lat2: number | null;
  finish_lon2: number | null;
  warmup_laps_to_skip: number;
}

interface AccessRow {
  id: number;
  user_id: number;
  circuit_id: number;
  circuit_name: string;
  valid_from: string;
  valid_until: string;
}

export function AdminUsersPanel() {
  return <UsersManager />;
}

export function AdminCircuitsPanel() {
  return <CircuitsManager />;
}

export function AdminHubPanel() {
  return <CircuitHubManager />;
}

export function AdminPlatformPanel() {
  return (
    <>
      <PlatformSettingsManager />
      <ChatbotAdminManager />
    </>
  );
}

export function AdminMarketingPanel() {
  return <WaitlistManager />;
}

// ─── Waitlist Manager ─────────────────────────────────────────────────────────

interface WaitlistRow {
  id: number;
  email: string;
  name: string | null;
  source: string;
  created_at: string | null;
}

function WaitlistManager() {
  const [entries, setEntries] = useState<WaitlistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setLoading(true);
    fetch("/api/admin/waitlist", {
      headers: {
        Authorization: `Bearer ${(() => {
          try {
            const s = localStorage.getItem("boxboxnow-auth");
            return s ? JSON.parse(s)?.state?.token : "";
          } catch { return ""; }
        })()}`,
      },
    })
      .then((r) => r.json())
      .then((data) => { setEntries(data); setLoading(false); })
      .catch(() => { setError("Error al cargar la lista."); setLoading(false); });
  }, []);

  const filtered = entries.filter((e) => {
    const q = search.toLowerCase();
    return (
      e.email.toLowerCase().includes(q) ||
      (e.name || "").toLowerCase().includes(q)
    );
  });

  const copyEmails = () => {
    const text = filtered.map((e) => e.email).join(", ");
    navigator.clipboard.writeText(text).catch(() => {});
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("es-ES", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  };

  return (
    <div className="p-4 sm:p-6 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-lg font-semibold text-white">Waitlist — Pre-lanzamiento</h2>
          <p className="text-sm text-neutral-400 mt-0.5">
            {loading ? "..." : `${entries.length} persona${entries.length !== 1 ? "s" : ""} registrada${entries.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Buscar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-surface border border-border rounded-lg px-3 py-1.5 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-accent w-48"
          />
          <button
            onClick={copyEmails}
            title="Copiar emails al portapapeles"
            className="flex items-center gap-1.5 border border-border rounded-lg px-3 py-1.5 text-sm text-neutral-300 hover:text-white hover:border-accent transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
            </svg>
            Copiar emails
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-neutral-400 text-sm py-12 text-center">Cargando...</div>
      ) : error ? (
        <div className="text-red-400 text-sm py-12 text-center">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="text-neutral-500 text-sm py-12 text-center">
          {search ? "Sin resultados para esa búsqueda." : "Nadie en la lista todavía."}
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-white/[0.02]">
                <th className="text-left px-4 py-2.5 text-neutral-400 font-medium">#</th>
                <th className="text-left px-4 py-2.5 text-neutral-400 font-medium">Email</th>
                <th className="text-left px-4 py-2.5 text-neutral-400 font-medium hidden sm:table-cell">Nombre</th>
                <th className="text-left px-4 py-2.5 text-neutral-400 font-medium hidden md:table-cell">Fuente</th>
                <th className="text-left px-4 py-2.5 text-neutral-400 font-medium hidden lg:table-cell">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e, i) => (
                <tr
                  key={e.id}
                  className="border-b border-border/50 hover:bg-white/[0.02] transition-colors"
                >
                  <td className="px-4 py-2.5 text-neutral-500 tabular-nums">{i + 1}</td>
                  <td className="px-4 py-2.5 text-white font-mono text-xs">{e.email}</td>
                  <td className="px-4 py-2.5 text-neutral-300 hidden sm:table-cell">{e.name || <span className="text-neutral-600">—</span>}</td>
                  <td className="px-4 py-2.5 hidden md:table-cell">
                    <span className="text-xs px-2 py-0.5 rounded bg-white/[0.06] text-neutral-400">{e.source}</span>
                  </td>
                  <td className="px-4 py-2.5 text-neutral-500 text-xs hidden lg:table-cell tabular-nums">{formatDate(e.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const STANDARD_TAB_OPTIONS: [string, string][] = [
  ["race", "Carrera"],
  ["pit", "Box"],
  ["live", "Live"],
  ["config", "Config"],
  ["adjusted", "Clasif. Real"],
  ["adjusted-beta", "Real Beta"],
  ["driver", "Vista en vivo"],
  ["driver-config", "Config Piloto"],
  ["replay", "Replay"],
  ["analytics", "Karts"],
  ["insights", "GPS Insights"],
  // iOS app config sections
  ["app-config-carrera", "App: Carrera"],
  ["app-config-box", "App: Box"],
  ["app-config-visualizacion", "App: Visualizacion"],
  ["app-config-plantillas", "App: Plantillas"],
  ["app-config-gps-racebox", "App: GPS RaceBox"],
  // Support chatbot widget on /dashboard
  ["chat", "Asistente"],
];

const ADMIN_TAB_OPTIONS: [string, string][] = [
  ["admin-users", "Usuarios"],
  ["admin-circuits", "Circuitos"],
  ["admin-hub", "Circuit Hub"],
];

// All options for new user defaults (standard tabs only, no admin tabs)
const ALL_TAB_OPTIONS = STANDARD_TAB_OPTIONS;

function UsersManager() {
  const t = useT();
  const confirm = useConfirm();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  // Per-user password reset state (admin action on the user detail panel).
  const [resetPassword, setResetPassword] = useState("");
  const [resetPasswordSaving, setResetPasswordSaving] = useState(false);
  const [resetPasswordFeedback, setResetPasswordFeedback] = useState<string | null>(null);
  const [newIsAdmin, setNewIsAdmin] = useState(false);
  const [newMaxDevices, setNewMaxDevices] = useState(1);
  const [newTabs, setNewTabs] = useState<string[]>(ALL_TAB_OPTIONS.map(([k]) => k));
  const [selectedUser, setSelectedUser] = useState<number | null>(null);
  const [access, setAccess] = useState<AccessRow[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [circuits, setCircuits] = useState<CircuitRow[]>([]);
  const [newCircuitIds, setNewCircuitIds] = useState<number[]>([]);
  const [newValidFrom, setNewValidFrom] = useState("");
  const [newValidUntil, setNewValidUntil] = useState("");

  useEffect(() => {
    loadUsers();
    api.getAllCircuits().then(setCircuits).catch(() => {});
  }, []);

  const loadUsers = async () => {
    try { setUsers(await api.getUsers()); } catch {}
  };

  const createUser = async () => {
    if (!newUsername || !newPassword) return;
    try {
      await api.createUser({ username: newUsername, password: newPassword, is_admin: newIsAdmin, max_devices: newMaxDevices });
      // Set tab access and circuit access for the new user
      const created = (await api.getUsers()).find((u: UserRow) => u.username === newUsername);
      if (created) {
        if (!newIsAdmin) {
          await api.updateUserTabs(created.id, newTabs);
        }
        // Grant circuit access
        if (newCircuitIds.length > 0 && newValidFrom && newValidUntil) {
          for (const cid of newCircuitIds) {
            await api.grantAccess({
              user_id: created.id, circuit_id: cid,
              valid_from: new Date(newValidFrom).toISOString(),
              valid_until: new Date(newValidUntil).toISOString(),
            });
          }
        }
      }
      setNewUsername(""); setNewPassword(""); setNewIsAdmin(false); setNewMaxDevices(1);
      setNewTabs(ALL_TAB_OPTIONS.map(([k]) => k));
      setNewCircuitIds([]);
      setShowCreate(false);
      loadUsers();
    } catch (e: any) { alert(e.message); }
  };

  const deleteUser = async (id: number) => {
    const ok = await confirm({ message: t("admin.deleteUser"), danger: true, confirmText: t("admin.delete") });
    if (!ok) return;
    try {
      await api.deleteUser(id);
      loadUsers();
      if (selectedUser === id) setSelectedUser(null);
    } catch (e: any) { alert(e.message); }
  };

  const loadAccess = async (userId: number) => {
    if (selectedUser === userId) { setSelectedUser(null); return; }
    setSelectedUser(userId);
    setShowCreate(false);
    try { setAccess(await api.getUserAccess(userId)); } catch {}
    try { setSessions(await api.getAdminUserSessions(userId)); } catch { setSessions([]); }
  };

  const killSession = async (userId: number, sessionId: number) => {
    try {
      await api.adminKillSession(userId, sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch {}
  };

  const killAllSessions = async (userId: number) => {
    const ok = await confirm({ message: t("admin.killAllSessionsConfirm"), danger: true, confirmText: t("admin.killAll") });
    if (!ok) return;
    try {
      await api.adminKillAllSessions(userId);
      setSessions([]);
    } catch {}
  };

  const grantAccess = async () => {
    if (!selectedUser || newCircuitIds.length === 0 || !newValidFrom || !newValidUntil) return;
    try {
      for (const cid of newCircuitIds) {
        await api.grantAccess({
          user_id: selectedUser, circuit_id: cid,
          valid_from: new Date(newValidFrom).toISOString(),
          valid_until: new Date(newValidUntil).toISOString(),
        });
      }
      // Reload access to reflect newly granted items and deselect added circuits
      setAccess(await api.getUserAccess(selectedUser));
      setNewCircuitIds([]);
    } catch (e: any) { alert(e.message); }
  };

  const revokeAccess = async (accessId: number) => {
    try {
      await api.revokeAccess(accessId);
      // Reload access list without toggling selection (loadAccess toggles)
      if (selectedUser) {
        setAccess(await api.getUserAccess(selectedUser));
      }
    } catch {}
  };

  const toggleNewTab = (tab: string) => {
    setNewTabs((prev) => prev.includes(tab) ? prev.filter((t) => t !== tab) : [...prev, tab]);
  };

  const toggleCircuit = (cid: number) => {
    setNewCircuitIds((prev) => prev.includes(cid) ? prev.filter((id) => id !== cid) : [...prev, cid]);
  };

  const toggleAllCircuits = () => {
    setNewCircuitIds((prev) => prev.length === circuits.length ? [] : circuits.map((c) => c.id));
  };

  const panelOpen = showCreate || selectedUser !== null;

  return (
    <div className="flex gap-4">
      {/* Left: user list */}
      <div className={`bg-white/[0.03] rounded-xl p-4 border border-border transition-all ${panelOpen ? "w-64 flex-shrink-0" : "w-full"}`}>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-[11px] text-neutral-200 uppercase tracking-wider">{t("admin.usersTitle")}</h3>
          <button onClick={() => { setShowCreate(true); setSelectedUser(null); }} className="bg-accent hover:bg-accent-hover text-black font-bold w-6 h-6 rounded-md text-sm flex items-center justify-center transition-colors" title={t("admin.newUser")}>
            +
          </button>
        </div>

        <div className="space-y-2">
          {users.map((u) => (
            <div
              key={u.id}
              onClick={() => loadAccess(u.id)}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer transition-all ${
                selectedUser === u.id
                  ? "bg-accent/10 border border-accent/40 shadow-[0_0_8px_rgba(var(--accent-rgb),0.15)]"
                  : "bg-white/[0.05] hover:bg-white/[0.08] border border-neutral-600/50 hover:border-accent/40"
              }`}
            >
              <button
                onClick={(e) => { e.stopPropagation(); deleteUser(u.id); }}
                className="text-red-500/50 hover:text-red-400 transition-colors flex-shrink-0"
                title={t("admin.delete")}
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </button>
              <div className="min-w-0 flex-1">
                <div className={`text-sm font-medium truncate ${selectedUser === u.id ? "text-accent" : "text-white"}`}>
                  {u.username}
                  {u.is_admin && <span className="ml-1.5 text-[9px] bg-accent/20 text-accent px-1.5 py-0.5 rounded font-semibold uppercase">Admin</span>}
                  {u.mfa_enabled && <span className="ml-1 text-[9px] bg-green-500/15 text-green-400 px-1.5 py-0.5 rounded font-semibold uppercase">MFA</span>}
                  {u.mfa_required && !u.mfa_enabled && <span className="ml-1 text-[9px] bg-yellow-500/15 text-yellow-400 px-1.5 py-0.5 rounded font-semibold uppercase">MFA pendiente</span>}
                </div>
                <div className="flex gap-2 text-[10px] text-neutral-400 mt-0.5">
                  <span>{t("admin.devicesShort")} {u.max_devices}</span>
                  <span>{t("admin.tabs")}: {u.is_admin ? t("admin.allTabs") : (u.tab_access?.length || 0)}</span>
                </div>
              </div>
            </div>
          ))}
          {users.length === 0 && (
            <p className="text-neutral-500 text-sm py-4 text-center">{t("admin.noUsers")}</p>
          )}
        </div>
      </div>

      {/* Right: detail panel */}
      {panelOpen && (
        <div className="flex-1 min-w-0 bg-white/[0.03] rounded-xl border border-border p-5 space-y-4 animate-in slide-in-from-right-4 duration-200">
          {showCreate ? (
            /* === Create user form === */
            <>
              <div className="flex items-center justify-between">
                <h4 className="text-sm text-neutral-200 font-medium uppercase tracking-wider">{t("admin.newUser")}</h4>
                <button onClick={() => setShowCreate(false)} className="text-neutral-500 hover:text-white text-lg leading-none transition-colors">&times;</button>
              </div>

              <div className="space-y-4 max-w-xl">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] text-neutral-400 mb-1 uppercase tracking-wider">{t("admin.userPlaceholder")}</label>
                    <input
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      placeholder={t("admin.userPlaceholder")}
                      className="w-full bg-black border border-border rounded-lg px-3 py-2 text-sm"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-neutral-400 mb-1 uppercase tracking-wider">{t("login.password")}</label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder={t("login.password")}
                      className="w-full bg-black border border-border rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 max-w-xs">
                  <div>
                    <label className="block text-[10px] text-neutral-400 mb-1 uppercase tracking-wider">{t("admin.devicesTitle")}</label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={newMaxDevices}
                      onChange={(e) => setNewMaxDevices(Number(e.target.value))}
                      className="w-full bg-black border border-border rounded-lg px-3 py-2 text-sm text-center font-mono"
                    />
                  </div>
                  <div className="flex items-end pb-1">
                    <label className="flex items-center gap-2 text-sm text-neutral-200 cursor-pointer">
                      <input type="checkbox" checked={newIsAdmin} onChange={(e) => setNewIsAdmin(e.target.checked)} className="accent-accent w-4 h-4" />
                      Admin
                    </label>
                  </div>
                </div>

                {!newIsAdmin && (
                  <div>
                    <label className="block text-[10px] text-neutral-400 mb-2 uppercase tracking-wider">{t("admin.tabs")}</label>
                    <div className="flex flex-wrap gap-1.5">
                      {ALL_TAB_OPTIONS.map(([tab, label]) => (
                        <label key={tab} className="flex items-center gap-1.5 text-xs text-neutral-300 cursor-pointer bg-black/30 rounded-lg px-3 py-2 border border-border hover:border-neutral-600 transition-colors">
                          <input
                            type="checkbox"
                            checked={newTabs.includes(tab)}
                            onChange={() => toggleNewTab(tab)}
                            className="accent-accent"
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Circuit access (create) */}
              <div>
                <label className="block text-[10px] text-neutral-400 mb-2 uppercase tracking-wider">{t("admin.circuits")}</label>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  <label className="flex items-center gap-1.5 text-xs text-accent cursor-pointer bg-accent/10 rounded-lg px-3 py-2 border border-accent/30 hover:border-accent/50 transition-colors">
                    <input
                      type="checkbox"
                      checked={newCircuitIds.length === circuits.length && circuits.length > 0}
                      onChange={toggleAllCircuits}
                      className="accent-accent"
                    />
                    {t("admin.selectAll")}
                  </label>
                  {circuits.map((c) => (
                    <label key={c.id} className="flex items-center gap-1.5 text-xs text-neutral-300 cursor-pointer bg-black/30 rounded-lg px-3 py-2 border border-border hover:border-neutral-600 transition-colors">
                      <input
                        type="checkbox"
                        checked={newCircuitIds.includes(c.id)}
                        onChange={() => toggleCircuit(c.id)}
                        className="accent-accent"
                      />
                      {c.name}
                    </label>
                  ))}
                </div>
                {newCircuitIds.length > 0 && (
                  <div className="flex gap-2 items-end mb-2">
                    <div className="w-[150px]">
                      <label className="block text-[9px] text-neutral-500 mb-1 uppercase tracking-wider">{t("admin.from")}</label>
                      <CalendarPicker value={newValidFrom} onChange={setNewValidFrom} placeholder={t("admin.from")} />
                    </div>
                    <div className="w-[150px]">
                      <label className="block text-[9px] text-neutral-500 mb-1 uppercase tracking-wider">{t("admin.until")}</label>
                      <CalendarPicker value={newValidUntil} onChange={setNewValidUntil} placeholder={t("admin.until")} />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-1 max-w-xs">
                <button
                  onClick={createUser}
                  disabled={!newUsername || !newPassword}
                  className="flex-1 bg-accent hover:bg-accent-hover disabled:opacity-40 text-black font-semibold py-2 rounded-lg text-sm transition-colors"
                >
                  {t("admin.create")}
                </button>
                <button onClick={() => setShowCreate(false)} className="bg-surface text-neutral-300 px-4 py-2 rounded-lg text-sm border border-border hover:text-white transition-colors">
                  {t("admin.cancel")}
                </button>
              </div>
            </>
          ) : selectedUser ? (
            /* === User detail: tabs + circuit access === */
            <>
              <div className="flex items-center justify-between">
                <h4 className="text-sm text-neutral-200 font-medium uppercase tracking-wider">
                  {users.find((u) => u.id === selectedUser)?.username}
                </h4>
                <button onClick={() => setSelectedUser(null)} className="text-neutral-500 hover:text-white text-lg leading-none transition-colors">&times;</button>
              </div>

              {/* Reset password — admin-only action, mirrors the backend
                  PATCH /admin/users/{id} with {password}. Validates the
                  new password matches the server's UserUpdate rules
                  (>=8 chars, 1 uppercase, 1 number) before sending. */}
              {(() => {
                const su = users.find((u) => u.id === selectedUser);
                if (!su) return null;
                const valid =
                  resetPassword.length >= 8 &&
                  /[A-Z]/.test(resetPassword) &&
                  /[0-9]/.test(resetPassword);
                return (
                  <div>
                    <label className="block text-[10px] text-neutral-400 mb-1 uppercase tracking-wider">
                      Resetear contraseña
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={resetPassword}
                        onChange={(e) => {
                          setResetPassword(e.target.value);
                          setResetPasswordFeedback(null);
                        }}
                        placeholder="Nueva contraseña (min 8 car, 1 mayus, 1 numero)"
                        className="flex-1 bg-black border border-border rounded-lg px-3 py-1.5 text-sm"
                      />
                      <button
                        disabled={!valid || resetPasswordSaving}
                        onClick={async () => {
                          setResetPasswordSaving(true);
                          setResetPasswordFeedback(null);
                          try {
                            await api.updateUser(su.id, { password: resetPassword });
                            setResetPassword("");
                            setResetPasswordFeedback("Contraseña actualizada");
                            setTimeout(() => setResetPasswordFeedback(null), 3000);
                          } catch (e: any) {
                            setResetPasswordFeedback(
                              e?.message || "Error al resetear contraseña"
                            );
                          } finally {
                            setResetPasswordSaving(false);
                          }
                        }}
                        className="bg-accent hover:bg-accent-hover disabled:opacity-40 text-black font-semibold px-3 py-1.5 rounded-lg text-sm"
                      >
                        {resetPasswordSaving ? "..." : "Guardar"}
                      </button>
                    </div>
                    {resetPasswordFeedback && (
                      <p className={`text-[11px] mt-1 ${resetPasswordFeedback === "Contraseña actualizada" ? "text-accent" : "text-red-400"}`}>
                        {resetPasswordFeedback}
                      </p>
                    )}
                  </div>
                );
              })()}

              {/* Tab access for selected user */}
              {(() => {
                const su = users.find((u) => u.id === selectedUser);
                if (!su || su.is_admin) return (
                  <p className="text-[10px] text-neutral-500">{su?.is_admin ? t("admin.allTabs") : ""}</p>
                );
                return (
                  <div>
                    <label className="block text-[10px] text-neutral-400 mb-2 uppercase tracking-wider">{t("admin.tabs")}</label>
                    <div className="flex flex-wrap gap-1.5">
                      {ALL_TAB_OPTIONS.map(([tab, label]) => (
                        <label key={tab} className="flex items-center gap-1.5 text-xs text-neutral-300 cursor-pointer bg-black/30 rounded-lg px-3 py-2 border border-border hover:border-neutral-600 transition-colors">
                          <input
                            type="checkbox"
                            checked={su.tab_access?.includes(tab)}
                            onChange={async (e) => {
                              const updated = e.target.checked
                                ? [...(su.tab_access || []), tab]
                                : (su.tab_access || []).filter((t) => t !== tab);
                              try {
                                await api.updateUserTabs(su.id, updated);
                                loadUsers();
                              } catch {}
                            }}
                            className="accent-accent"
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Devices — max total (legacy) + per-kind concurrency
                  overrides (web / mobile). Per-kind values win over max
                  when set; an empty input clears the override. */}
              {(() => {
                const su = users.find((u) => u.id === selectedUser);
                if (!su) return null;
                return (
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[10px] text-neutral-400 mb-1 uppercase tracking-wider">
                        {t("admin.devicesTitle")}
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={1000}
                        value={su.max_devices}
                        onChange={async (e) => {
                          const val = Math.max(1, Math.min(1000, Number(e.target.value)));
                          try {
                            await api.updateUser(su.id, { max_devices: val });
                            loadUsers();
                          } catch {}
                        }}
                        className="w-full bg-black border border-border rounded-lg px-3 py-1.5 text-sm text-center font-mono"
                      />
                      <p className="text-[9px] text-neutral-600 mt-1 leading-tight">
                        Fallback si no hay override. Máx 1000 (load tests).
                      </p>
                    </div>

                    <div>
                      <label className="block text-[10px] text-neutral-400 mb-1 uppercase tracking-wider">
                        Concurrencia web
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={20}
                        value={su.concurrency_web ?? ""}
                        placeholder="—"
                        onChange={async (e) => {
                          const raw = e.target.value.trim();
                          const val = raw === "" ? null : Math.max(0, Math.min(20, Number(raw)));
                          try {
                            await api.updateUser(su.id, { concurrency_web: val });
                            loadUsers();
                          } catch {}
                        }}
                        className="w-full bg-black border border-border rounded-lg px-3 py-1.5 text-sm text-center font-mono"
                      />
                      <p className="text-[9px] text-neutral-600 mt-1 leading-tight">
                        Vacio = plan o fallback.
                      </p>
                    </div>

                    <div>
                      <label className="block text-[10px] text-neutral-400 mb-1 uppercase tracking-wider">
                        Concurrencia app
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={20}
                        value={su.concurrency_mobile ?? ""}
                        placeholder="—"
                        onChange={async (e) => {
                          const raw = e.target.value.trim();
                          const val = raw === "" ? null : Math.max(0, Math.min(20, Number(raw)));
                          try {
                            await api.updateUser(su.id, { concurrency_mobile: val });
                            loadUsers();
                          } catch {}
                        }}
                        className="w-full bg-black border border-border rounded-lg px-3 py-1.5 text-sm text-center font-mono"
                      />
                      <p className="text-[9px] text-neutral-600 mt-1 leading-tight">
                        Vacio = plan o fallback.
                      </p>
                    </div>
                  </div>
                );
              })()}

              {/* Circuit access */}
              <div className="border-t border-border pt-4">
                <label className="block text-[10px] text-neutral-400 mb-2 uppercase tracking-wider">{t("admin.circuitAccess")}</label>

                {/* Circuit checkboxes — checked = already has access, unchecked = can grant */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  <label className="flex items-center gap-1.5 text-xs text-accent cursor-pointer bg-accent/10 rounded-lg px-3 py-2 border border-accent/30 hover:border-accent/50 transition-colors">
                    <input
                      type="checkbox"
                      checked={newCircuitIds.length === circuits.filter((c) => !access.some((a) => a.circuit_id === c.id)).length && circuits.filter((c) => !access.some((a) => a.circuit_id === c.id)).length > 0}
                      onChange={() => {
                        const ungranted = circuits.filter((c) => !access.some((a) => a.circuit_id === c.id)).map((c) => c.id);
                        setNewCircuitIds((prev) => prev.length === ungranted.length ? [] : ungranted);
                      }}
                      className="accent-accent"
                    />
                    {t("admin.selectAll")}
                  </label>
                  {circuits.map((c) => {
                    const hasAccess = access.some((a) => a.circuit_id === c.id);
                    return (
                      <label key={c.id} className={`flex items-center gap-1.5 text-xs cursor-pointer rounded-lg px-3 py-2 border transition-colors ${
                        hasAccess
                          ? "text-green-400 bg-green-900/20 border-green-800/40"
                          : newCircuitIds.includes(c.id)
                            ? "text-accent bg-accent/10 border-accent/30"
                            : "text-neutral-300 bg-black/30 border-border hover:border-neutral-600"
                      }`}>
                        <input
                          type="checkbox"
                          checked={hasAccess || newCircuitIds.includes(c.id)}
                          onChange={() => {
                            if (hasAccess) {
                              // Revoke: find the access entry and revoke it
                              const a = access.find((a) => a.circuit_id === c.id);
                              if (a) revokeAccess(a.id);
                            } else {
                              toggleCircuit(c.id);
                            }
                          }}
                          className="accent-accent"
                        />
                        {c.name}
                      </label>
                    );
                  })}
                </div>

                {/* Date range + grant button for newly selected circuits */}
                {newCircuitIds.length > 0 && (
                  <div className="flex gap-2 mb-3 items-end flex-wrap">
                    <div className="w-[150px]">
                      <label className="block text-[9px] text-neutral-500 mb-1 uppercase tracking-wider">{t("admin.from")}</label>
                      <CalendarPicker value={newValidFrom} onChange={setNewValidFrom} placeholder={t("admin.from")} />
                    </div>
                    <div className="w-[150px]">
                      <label className="block text-[9px] text-neutral-500 mb-1 uppercase tracking-wider">{t("admin.until")}</label>
                      <CalendarPicker value={newValidUntil} onChange={setNewValidUntil} placeholder={t("admin.until")} />
                    </div>
                    <button onClick={grantAccess} disabled={!newValidFrom || !newValidUntil}
                      className="bg-accent hover:bg-accent-hover disabled:opacity-40 text-black font-bold px-4 h-8 rounded-lg text-sm flex items-center justify-center transition-colors flex-shrink-0">
                      + {newCircuitIds.length}
                    </button>
                  </div>
                )}

                {/* Existing access list with dates */}
                {access.length > 0 && (
                  <div className="space-y-1 max-h-40 overflow-y-auto scrollbar-none">
                    {access.map((a) => (
                      <div key={a.id} className="flex items-center gap-2 text-[10px] text-neutral-500">
                        <span className="text-neutral-300 font-medium">{a.circuit_name}</span>
                        <span>{new Date(a.valid_from).toLocaleDateString()} - {new Date(a.valid_until).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Active sessions */}
              <div className="border-t border-border pt-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] text-neutral-400 uppercase tracking-wider">
                    {t("admin.activeSessions")} <span className="text-accent font-semibold">{sessions.length}</span>
                  </label>
                  {sessions.length > 0 && (
                    <button
                      onClick={() => selectedUser && killAllSessions(selectedUser)}
                      className="text-red-400/60 hover:text-red-400 text-[10px] transition-colors"
                    >
                      {t("admin.killAll")}
                    </button>
                  )}
                </div>
                <div className="space-y-1 max-h-40 overflow-y-auto scrollbar-none">
                  {sessions.map((s: any) => (
                    <div key={s.id} className="flex items-center gap-2 bg-black/30 rounded-lg px-3 py-2 text-xs">
                      <button
                        onClick={() => selectedUser && killSession(selectedUser, s.id)}
                        className="text-red-500/50 hover:text-red-400 transition-colors flex-shrink-0"
                        title={t("admin.killSession")}
                      >
                        <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <path d="M4 4l8 8M12 4l-8 8" />
                        </svg>
                      </button>
                      <div className="min-w-0 flex-1">
                        <span className="text-white font-medium">{s.device_name}</span>
                        <span className="text-neutral-500 ml-2">IP: {s.ip_address}</span>
                        {/* Mobile-app version badge — populated from the
                            `X-App-Version` header on every authenticated
                            request, so it reflects the build currently
                            talking to the API. Hidden for web sessions
                            (empty string). */}
                        {s.app_version && (
                          <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-accent/10 text-accent text-[10px] font-mono">
                            {s.app_platform ? `${s.app_platform}` : "app"} v{s.app_version}
                          </span>
                        )}
                      </div>
                      <span className="text-neutral-600 text-[10px] flex-shrink-0">
                        {s.last_active ? new Date(s.last_active).toLocaleString() : ""}
                      </span>
                    </div>
                  ))}
                  {sessions.length === 0 && (
                    <p className="text-neutral-600 text-xs text-center py-2">{t("admin.noSessions")}</p>
                  )}
                </div>
              </div>

              {/* MFA Management */}
              {selectedUser && (() => {
                const u = users.find((u) => u.id === selectedUser);
                if (!u) return null;
                return (
                  <div className="border-t border-border pt-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] text-neutral-400 uppercase tracking-wider">MFA obligatorio</label>
                      </div>
                      <button
                        onClick={async () => {
                          const newVal = !u.mfa_required;
                          // Optimistic update
                          setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, mfa_required: newVal } : x));
                          try {
                            await api.updateUser(u.id, { mfa_required: newVal });
                          } catch {
                            // Revert on error
                            setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, mfa_required: !newVal } : x));
                          }
                        }}
                        className={`relative w-9 h-5 rounded-full transition-colors ${
                          u.mfa_required ? "bg-accent" : "bg-neutral-700"
                        }`}
                      >
                        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                          u.mfa_required ? "translate-x-4" : ""
                        }`} />
                      </button>
                    </div>
                    {u.mfa_required && !u.mfa_enabled && (
                      <p className="text-[10px] text-yellow-400/80">⚠ MFA obligatorio pero el usuario aún no lo ha configurado. Se le pedirá al iniciar sesión.</p>
                    )}
                    {u.mfa_enabled && (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] bg-green-500/15 text-green-400 px-1.5 py-0.5 rounded uppercase tracking-wider font-medium">
                            {t("mfa.enabled")}
                          </span>
                        </div>
                        <button
                          onClick={async () => {
                            const ok = await confirm({ message: t("mfa.adminResetConfirm"), danger: true, confirmText: t("mfa.adminReset") });
                            if (!ok) return;
                            try {
                              await api.adminResetMfa(selectedUser);
                              loadUsers();
                            } catch {}
                          }}
                          className="text-red-400/60 hover:text-red-400 text-[10px] transition-colors"
                        >
                          {t("mfa.adminReset")}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

interface CircuitForm {
  name: string;
  length_m: string;
  pit_time_s: string;
  ws_port: string;
  ws_port_data: string;
  php_api_port: string;
  laps_discard: string;
  lap_differential: string;
  php_api_url: string;
  live_timing_url: string;
  retention_days: string;
  finish_lat1: string;
  finish_lon1: string;
  finish_lat2: string;
  finish_lon2: string;
  warmup_laps_to_skip: string;
}

const emptyForm: CircuitForm = {
  name: "",
  length_m: "",
  pit_time_s: "",
  ws_port: "",
  ws_port_data: "",
  php_api_port: "0",
  laps_discard: "2",
  lap_differential: "3000",
  php_api_url: "",
  live_timing_url: "",
  retention_days: "30",
  finish_lat1: "",
  finish_lon1: "",
  finish_lat2: "",
  finish_lon2: "",
  warmup_laps_to_skip: "3",
};

function circuitToForm(c: CircuitRow): CircuitForm {
  return {
    name: c.name,
    length_m: c.length_m?.toString() ?? "",
    pit_time_s: c.pit_time_s?.toString() ?? "",
    ws_port: c.ws_port.toString(),
    ws_port_data: c.ws_port_data?.toString() ?? "",
    php_api_port: c.php_api_port.toString(),
    laps_discard: c.laps_discard.toString(),
    lap_differential: c.lap_differential.toString(),
    php_api_url: c.php_api_url ?? "",
    live_timing_url: c.live_timing_url ?? "",
    retention_days: (c.retention_days ?? 30).toString(),
    finish_lat1: c.finish_lat1?.toString() ?? "",
    finish_lon1: c.finish_lon1?.toString() ?? "",
    finish_lat2: c.finish_lat2?.toString() ?? "",
    finish_lon2: c.finish_lon2?.toString() ?? "",
    warmup_laps_to_skip: (c.warmup_laps_to_skip ?? 3).toString(),
  };
}

function formToPayload(f: CircuitForm) {
  return {
    name: f.name,
    length_m: f.length_m ? Number(f.length_m) : null,
    pit_time_s: f.pit_time_s ? Number(f.pit_time_s) : null,
    ws_port: Number(f.ws_port),
    ws_port_data: f.ws_port_data ? Number(f.ws_port_data) : null,
    php_api_port: Number(f.php_api_port) || 0,
    laps_discard: Number(f.laps_discard) || 2,
    lap_differential: Number(f.lap_differential) || 3000,
    php_api_url: f.php_api_url || null,
    live_timing_url: f.live_timing_url || null,
    retention_days: Number(f.retention_days) || 30,
    finish_lat1: f.finish_lat1 ? Number(f.finish_lat1) : null,
    finish_lon1: f.finish_lon1 ? Number(f.finish_lon1) : null,
    finish_lat2: f.finish_lat2 ? Number(f.finish_lat2) : null,
    finish_lon2: f.finish_lon2 ? Number(f.finish_lon2) : null,
    warmup_laps_to_skip: Number(f.warmup_laps_to_skip ?? 3) || 3,
  };
}

function CircuitsManager() {
  const t = useT();
  const confirm = useConfirm();
  const [circuits, setCircuits] = useState<CircuitRow[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CircuitForm>(emptyForm);

  useEffect(() => {
    loadCircuits();
  }, []);

  const loadCircuits = async () => {
    try { setCircuits(await api.getAllCircuits()); } catch {}
  };

  const startEdit = (c: CircuitRow) => {
    if (editingId === c.id) { cancelEdit(); return; }
    setEditingId(c.id);
    setForm(circuitToForm(c));
    setShowCreate(false);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setShowCreate(false);
    setForm(emptyForm);
  };

  const startCreate = () => {
    setShowCreate(true);
    setEditingId(null);
    setForm(emptyForm);
  };

  const saveCircuit = async () => {
    if (!form.name || !form.ws_port) return;
    try {
      if (editingId) {
        await api.updateCircuit(editingId, formToPayload(form));
      } else {
        await api.createCircuit(formToPayload(form));
      }
      cancelEdit();
      loadCircuits();
    } catch (e: any) { alert(e.message); }
  };

  const deleteCircuit = async (id: number) => {
    const ok = await confirm({ message: t("admin.confirmDeleteCircuit"), danger: true, confirmText: t("admin.delete") });
    if (!ok) return;
    try {
      await api.deleteCircuit(id);
      loadCircuits();
      if (editingId === id) cancelEdit();
    } catch (e: any) { alert(e.message); }
  };

  const setField = (key: keyof CircuitForm, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const fieldInput = (label: string, key: keyof CircuitForm, type: string = "text", placeholder?: string) => (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] text-neutral-400 uppercase tracking-wider">{label}</label>
      <input
        type={type}
        value={form[key]}
        onChange={(e) => setField(key, e.target.value)}
        placeholder={placeholder}
        className="bg-black border border-border rounded-lg px-2 py-1.5 text-sm w-full"
      />
    </div>
  );

  const panelOpen = showCreate || editingId !== null;

  return (
    <div className="flex gap-4">
      {/* Left: circuit list */}
      <div className={`bg-white/[0.03] rounded-xl p-4 border border-border transition-all ${panelOpen ? "w-64 flex-shrink-0" : "w-full"}`}>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-[11px] text-neutral-200 uppercase tracking-wider">{t("admin.circuitCatalog")}</h3>
          <button onClick={startCreate} className="bg-accent hover:bg-accent-hover text-black font-bold w-6 h-6 rounded-md text-sm flex items-center justify-center transition-colors" title={t("admin.newCircuit")}>
            +
          </button>
        </div>

        <div className="space-y-2">
          {circuits.map((c) => (
            <div
              key={c.id}
              onClick={() => startEdit(c)}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer transition-all ${
                editingId === c.id
                  ? "bg-accent/10 border border-accent/40 shadow-[0_0_8px_rgba(var(--accent-rgb),0.15)]"
                  : "bg-white/[0.05] hover:bg-white/[0.08] border border-neutral-600/50 hover:border-accent/40"
              }`}
            >
              <button
                onClick={(e) => { e.stopPropagation(); deleteCircuit(c.id); }}
                className="text-red-500/50 hover:text-red-400 transition-colors flex-shrink-0"
                title={t("admin.delete")}
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </button>
              <div className="min-w-0 flex-1">
                <div className={`text-sm font-medium truncate ${editingId === c.id ? "text-accent" : "text-white"}`}>
                  {c.name}
                </div>
                <div className="flex gap-3 text-[10px] text-neutral-400 mt-0.5">
                  {c.length_m && <span>{c.length_m}m</span>}
                  <span>WSS:{c.ws_port}</span>
                  {c.pit_time_s && <span>Pit:{c.pit_time_s}s</span>}
                </div>
              </div>
            </div>
          ))}
          {circuits.length === 0 && (
            <p className="text-neutral-500 text-sm py-4 text-center">{t("admin.noCircuits")}</p>
          )}
        </div>
      </div>

      {/* Right: detail panel */}
      {panelOpen && (
        <div className="flex-1 min-w-0 bg-white/[0.03] rounded-xl border border-border p-5 space-y-4 animate-in slide-in-from-right-4 duration-200">
          <div className="flex items-center justify-between">
            <h4 className="text-sm text-neutral-200 font-medium uppercase tracking-wider">
              {editingId ? t("admin.editCircuit") : t("admin.newCircuit")}
            </h4>
            <button
              onClick={cancelEdit}
              className="text-neutral-500 hover:text-white text-lg leading-none transition-colors"
            >
              &times;
            </button>
          </div>

          <div className="space-y-3 max-w-xl">
            {fieldInput(t("admin.name"), "name", "text", t("admin.namePlaceholder"))}

            <div className="grid grid-cols-2 gap-3">
              {fieldInput(t("admin.wsPort"), "ws_port", "number", "Puerto WSS")}
              {fieldInput(t("admin.wsPortData"), "ws_port_data", "number", "Puerto WS")}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {fieldInput(t("admin.length"), "length_m", "number", "Metros")}
              {fieldInput(t("admin.pitTime"), "pit_time_s", "number", "Segundos")}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {fieldInput(t("admin.phpApiPort"), "php_api_port", "number", "Puerto")}
              {fieldInput(t("admin.lapsDiscard"), "laps_discard", "number", "2")}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {fieldInput(t("admin.lapDifferential"), "lap_differential", "number", "3000")}
              {fieldInput(t("admin.retentionDays"), "retention_days", "number", "30")}
            </div>

            <div className="grid grid-cols-1 gap-3">
              {fieldInput(t("admin.warmupLapsToSkip"), "warmup_laps_to_skip", "number", "3")}
            </div>

            {fieldInput("PHP API URL", "php_api_url", "text", "http://...")}
            {fieldInput("Live Timing URL", "live_timing_url", "text", "https://...")}

            {/* Finish Line Map */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-neutral-400 uppercase tracking-wider">Finish Line (GPS)</label>
              <Suspense fallback={<div className="h-[300px] bg-white/5 rounded-lg animate-pulse" />}>
                <FinishLineMap
                  p1={form.finish_lat1 && form.finish_lon1 ? { lat: Number(form.finish_lat1), lng: Number(form.finish_lon1) } : null}
                  p2={form.finish_lat2 && form.finish_lon2 ? { lat: Number(form.finish_lat2), lng: Number(form.finish_lon2) } : null}
                  onChange={(p1, p2) => {
                    setForm((prev) => ({
                      ...prev,
                      finish_lat1: p1 ? p1.lat.toFixed(7) : "",
                      finish_lon1: p1 ? p1.lng.toFixed(7) : "",
                      finish_lat2: p2 ? p2.lat.toFixed(7) : "",
                      finish_lon2: p2 ? p2.lng.toFixed(7) : "",
                    }));
                  }}
                />
              </Suspense>
              {form.finish_lat1 && form.finish_lon1 && form.finish_lat2 && form.finish_lon2 && (
                <div className="text-[10px] text-neutral-500 mt-1">
                  P1: {Number(form.finish_lat1).toFixed(6)}, {Number(form.finish_lon1).toFixed(6)} &mdash; P2: {Number(form.finish_lat2).toFixed(6)}, {Number(form.finish_lon2).toFixed(6)}
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-2 pt-1 max-w-xs">
            <button onClick={saveCircuit} className="flex-1 bg-accent hover:bg-accent-hover text-black font-semibold py-2 rounded-lg text-sm transition-colors">
              {editingId ? t("admin.save") : t("admin.create")}
            </button>
            <button onClick={cancelEdit} className="bg-surface text-neutral-300 px-4 py-2 rounded-lg text-sm border border-border hover:text-white transition-colors">
              {t("admin.cancel")}
            </button>
          </div>

          {editingId && (
            <button
              onClick={() => deleteCircuit(editingId)}
              className="w-full max-w-xs text-red-400/60 hover:text-red-400 text-xs py-1.5 transition-colors"
            >
              {t("admin.deleteCircuit")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}


// --- CircuitHub Manager ---

interface HubCircuit {
  circuit_id: number;
  circuit_name: string;
  connected: boolean;
  subscribers: number;
  messages: number;
  ws_url: string;
  connected_users?: { id: number; username: string }[];
}

function CircuitHubManager() {
  const t = useT();
  const [circuits, setCircuits] = useState<HubCircuit[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<number | null>(null);

  const refresh = async () => {
    try {
      const data = await api.getAdminHubStatus();
      setCircuits(data.circuits || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleStart = async (circuitId: number) => {
    setActionId(circuitId);
    try {
      await api.hubStartCircuit(circuitId);
      await refresh();
    } catch (e: any) {
      alert(e.message);
    }
    setActionId(null);
  };

  const handleStop = async (circuitId: number) => {
    setActionId(circuitId);
    try {
      await api.hubStopCircuit(circuitId);
      await refresh();
    } catch (e: any) {
      alert(e.message);
    }
    setActionId(null);
  };

  const connectedCount = circuits.filter((c) => c.connected).length;
  const totalMessages = circuits.reduce((acc, c) => acc + c.messages, 0);
  const totalSubscribers = circuits.reduce((acc, c) => acc + (c.connected_users?.length || 0), 0);

  return (
    <div className="bg-white/[0.03] rounded-xl p-4 border border-border">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[11px] text-neutral-200 uppercase tracking-wider">{t("hub.title")}</h3>
        <div className="flex items-center gap-4 text-[10px] text-neutral-400">
          <span>
            <span className="text-accent font-semibold">{connectedCount}</span>/{circuits.length} {t("hub.connected")}
          </span>
          <span>{totalMessages.toLocaleString()} msgs</span>
          <span>{totalSubscribers} {t("hub.subscribers")}</span>
        </div>
      </div>

      {loading ? (
        <p className="text-neutral-500 text-sm py-4 text-center">{t("hub.loading")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] text-neutral-400 uppercase tracking-wider">
              <tr>
                <th className="text-left px-2 py-1.5">{t("hub.status")}</th>
                <th className="text-left px-2 py-1.5">{t("hub.circuit")}</th>
                <th className="text-left px-2 py-1.5">URL</th>
                <th className="text-right px-2 py-1.5">{t("hub.messages")}</th>
                <th className="text-right px-2 py-1.5">{t("hub.usersCol")}</th>
                <th className="text-right px-2 py-1.5">{t("hub.action")}</th>
              </tr>
            </thead>
            <tbody>
              {circuits.map((c) => (
                <tr key={c.circuit_id} className="border-t border-border hover:bg-black/30 transition-colors">
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        c.connected ? "bg-accent" : "bg-red-500"
                      }`} />
                      <span className={`text-[10px] font-medium ${
                        c.connected ? "text-accent" : "text-red-400"
                      }`}>
                        {c.connected ? "ON" : "OFF"}
                      </span>
                    </div>
                  </td>
                  <td className="px-2 py-2 font-medium text-white">{c.circuit_name}</td>
                  <td className="px-2 py-2 text-[11px] font-mono text-neutral-500">{c.ws_url}</td>
                  <td className="px-2 py-2 text-right font-mono text-neutral-400">
                    {c.messages.toLocaleString()}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {c.connected_users && c.connected_users.length > 0 ? (
                      <span className="text-accent font-medium" title={c.connected_users.map(u => u.username).join(", ")}>
                        {c.connected_users.map(u => u.username).join(", ")}
                      </span>
                    ) : (
                      <span className="text-neutral-700">0</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {c.connected ? (
                      <button
                        onClick={() => handleStop(c.circuit_id)}
                        disabled={actionId === c.circuit_id}
                        className="text-red-400/70 hover:text-red-400 disabled:opacity-40 text-xs font-medium transition-colors"
                      >
                        {actionId === c.circuit_id ? "..." : t("hub.stop")}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleStart(c.circuit_id)}
                        disabled={actionId === c.circuit_id}
                        className="text-accent/70 hover:text-accent disabled:opacity-40 text-xs font-medium transition-colors"
                      >
                        {actionId === c.circuit_id ? "..." : t("hub.start")}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════
//  Platform Settings Manager
// ═══════════════════════════════════════════════════

function PlatformSettingsManager() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Product configs
  const [configs, setConfigs] = useState<any[]>([]);
  const [stripeProducts, setStripeProducts] = useState<any[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [editingConfig, setEditingConfig] = useState<any | null>(null);
  const [showConfigForm, setShowConfigForm] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const confirm = useConfirm();

  // Collapsible sections
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    registration: true,
    trial: true,
    mobile: true,
    products: true,
  });

  const toggleSection = (key: string) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    try {
      const [settingsData, configsData] = await Promise.all([
        api.getPlatformSettings(),
        api.getProductConfigs(),
      ]);
      setSettings(settingsData);
      setConfigs(configsData);
    } catch (e) {
      console.error("Failed to load platform settings", e);
    }
    setLoading(false);
  };

  const loadStripeProducts = async () => {
    if (stripeProducts.length > 0) return;
    try {
      const data = await api.getStripeProducts();
      setStripeProducts(data);
    } catch (e) {
      console.error("Failed to load Stripe products", e);
    }
  };

  const handleChange = (key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleTabToggle = (settingKey: string, tab: string) => {
    const current: string[] = (() => {
      try { return JSON.parse(settings[settingKey] || "[]"); } catch { return []; }
    })();
    const updated = current.includes(tab)
      ? current.filter((t) => t !== tab)
      : [...current, tab];
    handleChange(settingKey, JSON.stringify(updated));
  };

  const getTabsFromSetting = (key: string): string[] => {
    try { return JSON.parse(settings[key] || "[]"); } catch { return []; }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updatePlatformSettings(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      console.error("Failed to save platform settings", e);
    }
    setSaving(false);
  };

  // --- Product config form ---
  const emptyConfig = {
    stripe_product_id: "",
    plan_type: "",
    tabs: [] as string[],
    max_devices: 1,
    concurrency_web: null as number | null,
    concurrency_mobile: null as number | null,
    per_circuit: true,
    display_name: "",
    description: "",
    features: [] as string[],
    stripe_price_id: "",
    price_amount: null as number | null,
    billing_interval: "" as string,
    is_popular: false,
    is_visible: true,
    sort_order: 0,
    email_template: "",
  };

  const [configForm, setConfigForm] = useState(emptyConfig);
  const [featuresText, setFeaturesText] = useState("");

  const openNewConfig = () => {
    setEditingConfig(null);
    setConfigForm(emptyConfig);
    setFeaturesText("");
    setSelectedProduct(null);
    setShowConfigForm(true);
    loadStripeProducts();
  };

  const openEditConfig = (c: any) => {
    setEditingConfig(c);
    setConfigForm({
      stripe_product_id: c.stripe_product_id,
      plan_type: c.plan_type,
      tabs: c.tabs || [],
      max_devices: c.max_devices,
      concurrency_web: c.concurrency_web ?? null,
      concurrency_mobile: c.concurrency_mobile ?? null,
      per_circuit: c.per_circuit !== false,
      display_name: c.display_name || "",
      description: c.description || "",
      features: c.features || [],
      stripe_price_id: c.stripe_price_id || "",
      price_amount: c.price_amount ?? null,
      billing_interval: c.billing_interval || "",
      is_popular: c.is_popular,
      is_visible: c.is_visible,
      sort_order: c.sort_order,
      email_template: c.email_template || "",
    });
    setFeaturesText((c.features || []).join("\n"));
    setSelectedProduct(null);
    setShowConfigForm(true);
    loadStripeProducts();
  };

  const handleConfigTabToggle = (tab: string) => {
    setConfigForm((prev) => ({
      ...prev,
      tabs: prev.tabs.includes(tab)
        ? prev.tabs.filter((t) => t !== tab)
        : [...prev.tabs, tab],
    }));
  };

  const saveConfig = async () => {
    setConfigSaving(true);
    const data = {
      ...configForm,
      features: featuresText.split("\n").map((f) => f.trim()).filter(Boolean),
    };
    try {
      if (editingConfig) {
        await api.updateProductConfig(editingConfig.id, data);
      } else {
        await api.createProductConfig(data);
      }
      setShowConfigForm(false);
      const refreshed = await api.getProductConfigs();
      setConfigs(refreshed);
    } catch (e: any) {
      console.error("Failed to save product config", e);
      alert(e.message || "Error saving config");
    }
    setConfigSaving(false);
  };

  const deleteConfig = async (id: number) => {
    const ok = await confirm({ message: "Eliminar esta configuracion de producto?" });
    if (!ok) return;
    try {
      await api.deleteProductConfig(id);
      setConfigs((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      console.error("Failed to delete config", e);
    }
  };

  const trialEnabled = parseInt(settings.trial_days || "0") > 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-accent" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h2 className="text-lg font-bold text-white mb-2">Configuracion de Plataforma</h2>

      {/* Section: Registration Defaults */}
      <div className="bg-surface rounded-xl border border-border">
        <button
          onClick={() => toggleSection("registration")}
          className="w-full flex items-center justify-between p-5 text-left"
        >
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
            Registro — Tabs por Defecto
          </h3>
          <span className="text-neutral-500 text-xs">{openSections.registration ? "\u25B2" : "\u25BC"}</span>
        </button>
        {openSections.registration && (
          <div className="px-5 pb-5 space-y-4">
            <div>
              <label className="block text-xs text-neutral-400 mb-2 uppercase tracking-wider">
                Tabs para nuevos usuarios (sin compra)
              </label>
              <div className="flex flex-wrap gap-2">
                {STANDARD_TAB_OPTIONS.map(([key, label]) => {
                  const active = getTabsFromSetting("default_tabs").includes(key);
                  return (
                    <button
                      key={key}
                      onClick={() => handleTabToggle("default_tabs", key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        active
                          ? "bg-accent/20 border-accent/50 text-accent"
                          : "bg-black border-border text-neutral-500 hover:border-neutral-600"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="block text-xs text-neutral-400 mb-1.5 uppercase tracking-wider">
                Max dispositivos (registro)
              </label>
              <input
                type="number"
                min="1"
                max="50"
                value={settings.default_max_devices || "2"}
                onChange={(e) => handleChange("default_max_devices", e.target.value)}
                className="w-24 bg-black border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent/50 transition-colors"
              />
            </div>
          </div>
        )}
      </div>

      {/* Section: Trial */}
      <div className="bg-surface rounded-xl border border-border">
        <button
          onClick={() => toggleSection("trial")}
          className="w-full flex items-center justify-between p-5 text-left"
        >
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
            Prueba Gratuita (Trial)
          </h3>
          <span className="text-neutral-500 text-xs">{openSections.trial ? "\u25B2" : "\u25BC"}</span>
        </button>
        {openSections.trial && (
          <div className="px-5 pb-5 space-y-4">
            <div>
              <label className="block text-xs text-neutral-400 mb-1.5 uppercase tracking-wider">
                Dias de prueba gratuita
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min="0"
                  max="365"
                  value={settings.trial_days || "0"}
                  onChange={(e) => handleChange("trial_days", e.target.value)}
                  className="w-24 bg-black border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent/50 transition-colors"
                />
                <span className="text-xs text-neutral-500">
                  {trialEnabled
                    ? `Los nuevos usuarios tendran ${settings.trial_days} dias de acceso completo`
                    : "Trial desactivado"}
                </span>
              </div>
            </div>

            <div className={!trialEnabled ? "opacity-40 pointer-events-none" : ""}>
              <label className="block text-xs text-neutral-400 mb-2 uppercase tracking-wider">
                Tabs durante el trial
              </label>
              <div className="flex flex-wrap gap-2">
                {STANDARD_TAB_OPTIONS.map(([key, label]) => {
                  const active = getTabsFromSetting("trial_tabs").includes(key);
                  return (
                    <button
                      key={key}
                      onClick={() => handleTabToggle("trial_tabs", key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        active
                          ? "bg-accent/20 border-accent/50 text-accent"
                          : "bg-black border-border text-neutral-500 hover:border-neutral-600"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={!trialEnabled ? "opacity-40 pointer-events-none" : ""}>
              <label className="block text-xs text-neutral-400 mb-1.5 uppercase tracking-wider">
                Max dispositivos (trial)
              </label>
              <input
                type="number"
                min="1"
                max="50"
                value={settings.trial_max_devices || "2"}
                onChange={(e) => handleChange("trial_max_devices", e.target.value)}
                className="w-24 bg-black border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent/50 transition-colors"
              />
            </div>

            <div className={!trialEnabled ? "opacity-40 pointer-events-none" : ""}>
              <label className="block text-xs text-neutral-400 mb-1.5 uppercase tracking-wider">
                Mostrar banner de trial
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min="0"
                  max="365"
                  value={settings.trial_banner_days || "0"}
                  onChange={(e) => handleChange("trial_banner_days", e.target.value)}
                  className="w-24 bg-black border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent/50 transition-colors"
                />
                <span className="text-xs text-neutral-500">dias antes de expirar</span>
              </div>
            </div>

            <div className={!trialEnabled ? "opacity-40 pointer-events-none" : ""}>
              <label className="block text-xs text-neutral-400 mb-1.5 uppercase tracking-wider">
                Email de aviso
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min="0"
                  max="365"
                  value={settings.trial_email_days || "0"}
                  onChange={(e) => handleChange("trial_email_days", e.target.value)}
                  className="w-24 bg-black border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent/50 transition-colors"
                />
                <span className="text-xs text-neutral-500">dias antes de expirar</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Section: Mobile app versions */}
      <div className="bg-surface rounded-xl border border-border">
        <button
          onClick={() => toggleSection("mobile")}
          className="w-full flex items-center justify-between p-5 text-left"
        >
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
            Apps móviles — versión mínima
          </h3>
          <span className="text-neutral-500 text-xs">{openSections.mobile ? "\u25B2" : "\u25BC"}</span>
        </button>
        {openSections.mobile && (
          <div className="px-5 pb-5 space-y-4">
            <p className="text-xs text-neutral-500 leading-relaxed">
              Cuando la app de iOS o Android intenta hacer login, envía su versión
              en una cabecera <code className="text-accent">X-App-Version</code>. Si es
              inferior a la mínima configurada aquí, el backend devuelve un error
              controlado y la app muestra la pantalla de &quot;actualiza para continuar&quot;.
              Deja el campo vacío para desactivar la comprobación en esa plataforma.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-neutral-400 mb-1.5 uppercase tracking-wider">
                  iOS — versión mínima
                </label>
                <input
                  type="text"
                  placeholder="1.4.0"
                  value={settings.min_ios_version || ""}
                  onChange={(e) => handleChange("min_ios_version", e.target.value)}
                  className="w-full bg-black border border-border rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-accent/50 transition-colors"
                />
                <label className="block text-xs text-neutral-400 mt-3 mb-1.5 uppercase tracking-wider">
                  iOS — última versión (informativa)
                </label>
                <input
                  type="text"
                  placeholder="1.5.2"
                  value={settings.latest_ios_version || ""}
                  onChange={(e) => handleChange("latest_ios_version", e.target.value)}
                  className="w-full bg-black border border-border rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-accent/50 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs text-neutral-400 mb-1.5 uppercase tracking-wider">
                  Android — versión mínima
                </label>
                <input
                  type="text"
                  placeholder="1.4.0"
                  value={settings.min_android_version || ""}
                  onChange={(e) => handleChange("min_android_version", e.target.value)}
                  className="w-full bg-black border border-border rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-accent/50 transition-colors"
                />
                <label className="block text-xs text-neutral-400 mt-3 mb-1.5 uppercase tracking-wider">
                  Android — última versión (informativa)
                </label>
                <input
                  type="text"
                  placeholder="1.5.2"
                  value={settings.latest_android_version || ""}
                  onChange={(e) => handleChange("latest_android_version", e.target.value)}
                  className="w-full bg-black border border-border rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-accent/50 transition-colors"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Save Settings */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-accent hover:bg-accent-hover disabled:opacity-40 text-black font-semibold px-6 py-2.5 rounded-lg transition-colors text-sm"
        >
          {saving ? "Guardando..." : "Guardar configuracion"}
        </button>
        {saved && (
          <span className="text-accent text-sm animate-fade-in">Guardado</span>
        )}
      </div>

      {/* Section: Products / Plans */}
      <div className="bg-surface rounded-xl border border-border">
        <button
          onClick={() => toggleSection("products")}
          className="w-full flex items-center justify-between p-5 text-left"
        >
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
            Productos / Planes (Stripe)
          </h3>
          <span className="text-neutral-500 text-xs">{openSections.products ? "\u25B2" : "\u25BC"}</span>
        </button>
        {openSections.products && (
          <div className="px-5 pb-5">
            {configs.length === 0 ? (
              <p className="text-sm text-neutral-500 mb-4">
                No hay productos configurados. Agrega uno para activar los planes dinamicos.
              </p>
            ) : (
              <div className="overflow-x-auto mb-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-neutral-500 text-xs uppercase border-b border-border">
                      <th className="text-left py-2 pr-4">Nombre</th>
                      <th className="text-left py-2 pr-4">Tipo</th>
                      <th className="text-left py-2 pr-4">Price ID</th>
                      <th className="text-right py-2 pr-4">Precio</th>
                      <th className="text-left py-2 pr-4">Intervalo</th>
                      <th className="text-center py-2 pr-4">Disp.</th>
                      <th className="text-center py-2 pr-4">Visible</th>
                      <th className="text-right py-2">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {configs.map((c) => (
                      <tr key={c.id} className="border-b border-border/50">
                        <td className="py-2.5 pr-4 text-white font-medium">{c.display_name || c.plan_type}</td>
                        <td className="py-2.5 pr-4 text-neutral-400">{c.plan_type}</td>
                        <td className="py-2.5 pr-4 text-neutral-500 font-mono text-[11px]">
                          {c.stripe_price_id
                            ? `...${c.stripe_price_id.slice(-8)}`
                            : <span className="text-neutral-700">—</span>}
                        </td>
                        <td className="py-2.5 pr-4 text-right text-neutral-300">
                          {c.price_amount != null ? `${c.price_amount.toFixed(2)}€` : <span className="text-neutral-700">—</span>}
                        </td>
                        <td className="py-2.5 pr-4 text-neutral-400">{c.billing_interval || <span className="text-neutral-700">—</span>}</td>
                        <td className="py-2.5 pr-4 text-center text-neutral-400">
                          <span title="Web / Movil">
                            {c.concurrency_web ?? c.max_devices}
                            <span className="text-neutral-600"> / </span>
                            {c.concurrency_mobile ?? c.max_devices}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4 text-center">
                          <span className={c.is_visible ? "text-accent" : "text-neutral-600"}>
                            {c.is_visible ? "Si" : "No"}
                          </span>
                        </td>
                        <td className="py-2.5 text-right space-x-2">
                          <button onClick={() => openEditConfig(c)} className="text-accent hover:underline text-xs">
                            Editar
                          </button>
                          <button onClick={() => deleteConfig(c.id)} className="text-red-400 hover:underline text-xs">
                            Eliminar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <button
              onClick={openNewConfig}
              className="bg-accent/10 hover:bg-accent/20 text-accent border border-accent/30 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              + Agregar producto
            </button>

            {showConfigForm && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
                <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
                  <h3 className="text-white font-bold mb-4">
                    {editingConfig ? "Editar producto" : "Nuevo producto"}
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs text-neutral-400 mb-1 uppercase">Producto Stripe</label>
                      {stripeProducts.length > 0 ? (
                        <select
                          value={configForm.stripe_product_id}
                          onChange={(e) => {
                            const prod = stripeProducts.find((sp) => sp.id === e.target.value) || null;
                            setSelectedProduct(prod);
                            setConfigForm((p) => ({
                              ...p,
                              stripe_product_id: e.target.value,
                              stripe_price_id: "",
                              price_amount: null,
                              billing_interval: "",
                            }));
                          }}
                          className="w-full bg-black border border-border rounded-lg px-3 py-2 text-sm text-white"
                        >
                          <option value="">Seleccionar...</option>
                          {stripeProducts.map((sp) => (
                            <option key={sp.id} value={sp.id}>
                              {sp.name} ({sp.id})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          value={configForm.stripe_product_id}
                          onChange={(e) => setConfigForm((p) => ({ ...p, stripe_product_id: e.target.value }))}
                          placeholder="prod_xxx"
                          className="w-full bg-black border border-border rounded-lg px-3 py-2 text-sm text-white"
                        />
                      )}
                    </div>

                    {(selectedProduct || configForm.stripe_price_id) && (
                      <div>
                        <label className="block text-xs text-neutral-400 mb-1 uppercase">Precio</label>
                        <select
                          value={configForm.stripe_price_id}
                          onChange={(e) => {
                            const prices: any[] = selectedProduct?.prices || [];
                            const price = prices.find((pr: any) => pr.id === e.target.value);
                            setConfigForm((p) => ({
                              ...p,
                              stripe_price_id: e.target.value,
                              price_amount: price ? price.unit_amount / 100 : p.price_amount,
                              billing_interval: price
                                ? price.recurring?.interval || "one_time"
                                : p.billing_interval,
                            }));
                          }}
                          className="w-full bg-black border border-border rounded-lg px-3 py-2 text-sm text-white"
                        >
                          <option value="">Seleccionar precio...</option>
                          {(selectedProduct?.prices || []).map((pr: any) => (
                            <option key={pr.id} value={pr.id}>
                              {(pr.unit_amount / 100).toFixed(2)} {pr.currency?.toUpperCase()} /{" "}
                              {pr.recurring?.interval || "one_time"} ({pr.id})
                            </option>
                          ))}
                        </select>
                        {configForm.stripe_price_id && !selectedProduct && (
                          <p className="text-[11px] text-neutral-500 mt-1">
                            Price ID actual: {configForm.stripe_price_id}
                          </p>
                        )}
                      </div>
                    )}

                    <div>
                      <label className="block text-xs text-neutral-400 mb-1 uppercase">Tipo de plan</label>
                      <input
                        type="text"
                        value={configForm.plan_type}
                        onChange={(e) => setConfigForm((p) => ({ ...p, plan_type: e.target.value }))}
                        placeholder="ej: pro_monthly"
                        className="w-full bg-black border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-neutral-600"
                      />
                      <p className="text-[11px] text-neutral-500 mt-1">
                        Etiqueta interna. Puede repetirse entre productos.
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs text-neutral-400 mb-2 uppercase">Tabs que otorga</label>
                      <div className="flex flex-wrap gap-2">
                        {STANDARD_TAB_OPTIONS.map(([key, label]) => {
                          const active = configForm.tabs.includes(key);
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => handleConfigTabToggle(key)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                                active
                                  ? "bg-accent/20 border-accent/50 text-accent"
                                  : "bg-black border-border text-neutral-500 hover:border-neutral-600"
                              }`}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-neutral-400 mb-1 uppercase">
                          Concurrencia Web
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="100"
                          value={configForm.concurrency_web ?? ""}
                          onChange={(e) =>
                            setConfigForm((p) => ({
                              ...p,
                              concurrency_web: e.target.value ? parseInt(e.target.value) : null,
                            }))
                          }
                          placeholder={`fallback: ${configForm.max_devices}`}
                          className="w-full bg-black border border-border rounded-lg px-3 py-2 text-sm text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-neutral-400 mb-1 uppercase">
                          Concurrencia App movil
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="100"
                          value={configForm.concurrency_mobile ?? ""}
                          onChange={(e) =>
                            setConfigForm((p) => ({
                              ...p,
                              concurrency_mobile: e.target.value ? parseInt(e.target.value) : null,
                            }))
                          }
                          placeholder={`fallback: ${configForm.max_devices}`}
                          className="w-full bg-black border border-border rounded-lg px-3 py-2 text-sm text-white"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs text-neutral-400 mb-1 uppercase">
                        Max dispositivos (fallback)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={configForm.max_devices}
                        onChange={(e) => setConfigForm((p) => ({ ...p, max_devices: parseInt(e.target.value) || 1 }))}
                        className="w-24 bg-black border border-border rounded-lg px-3 py-2 text-sm text-white"
                      />
                      <p className="text-xs text-neutral-500 mt-1">
                        Se usa si no se especifican concurrencias por tipo de dispositivo.
                      </p>
                    </div>

                    <div>
                      <label className="flex items-center gap-2 text-sm text-neutral-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={configForm.per_circuit}
                          onChange={(e) => setConfigForm((p) => ({ ...p, per_circuit: e.target.checked }))}
                          className="accent-accent"
                        />
                        Venta por circuito
                      </label>
                      <p className="text-xs text-neutral-500 mt-1 ml-6">
                        Si esta activo, el usuario elige el circuito en la compra.
                        Si no, el plan concede acceso a todos los circuitos.
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs text-neutral-400 mb-1 uppercase">Nombre (pricing)</label>
                      <input
                        value={configForm.display_name}
                        onChange={(e) => setConfigForm((p) => ({ ...p, display_name: e.target.value }))}
                        placeholder="Plan Basico"
                        className="w-full bg-black border border-border rounded-lg px-3 py-2 text-sm text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-neutral-400 mb-1 uppercase">Descripcion</label>
                      <input
                        value={configForm.description}
                        onChange={(e) => setConfigForm((p) => ({ ...p, description: e.target.value }))}
                        placeholder="Para equipos pequenos"
                        className="w-full bg-black border border-border rounded-lg px-3 py-2 text-sm text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-neutral-400 mb-1 uppercase">
                        Caracteristicas (una por linea)
                      </label>
                      <textarea
                        value={featuresText}
                        onChange={(e) => setFeaturesText(e.target.value)}
                        rows={4}
                        placeholder={"1 circuito incluido\nHasta 2 dispositivos\nSoporte basico"}
                        className="w-full bg-black border border-border rounded-lg px-3 py-2 text-sm text-white resize-none"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-neutral-400 mb-1 uppercase">Precio (EUR)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={configForm.price_amount ?? ""}
                          onChange={(e) => setConfigForm((p) => ({ ...p, price_amount: e.target.value ? parseFloat(e.target.value) : null }))}
                          placeholder="49.00"
                          className="w-full bg-black border border-border rounded-lg px-3 py-2 text-sm text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-neutral-400 mb-1 uppercase">Intervalo</label>
                        <input
                          value={configForm.billing_interval}
                          onChange={(e) => setConfigForm((p) => ({ ...p, billing_interval: e.target.value }))}
                          placeholder="month / year / one_time"
                          className="w-full bg-black border border-border rounded-lg px-3 py-2 text-sm text-white"
                        />
                      </div>
                    </div>

                    <div className="flex gap-6">
                      <label className="flex items-center gap-2 text-sm text-neutral-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={configForm.is_popular}
                          onChange={(e) => setConfigForm((p) => ({ ...p, is_popular: e.target.checked }))}
                          className="accent-accent"
                        />
                        Popular
                      </label>
                      <label className="flex items-center gap-2 text-sm text-neutral-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={configForm.is_visible}
                          onChange={(e) => setConfigForm((p) => ({ ...p, is_visible: e.target.checked }))}
                          className="accent-accent"
                        />
                        Visible en pricing
                      </label>
                    </div>

                    <div>
                      <label className="block text-xs text-neutral-400 mb-1 uppercase">Orden</label>
                      <input
                        type="number"
                        min="0"
                        value={configForm.sort_order}
                        onChange={(e) => setConfigForm((p) => ({ ...p, sort_order: parseInt(e.target.value) || 0 }))}
                        className="w-24 bg-black border border-border rounded-lg px-3 py-2 text-sm text-white"
                      />
                    </div>

                    {/* Email template editor */}
                    <div>
                      <label className="block text-xs text-neutral-400 mb-1 uppercase tracking-wider">
                        Plantilla de email (HTML)
                      </label>
                      <p className="text-[11px] text-neutral-600 mb-2">
                        Cuerpo del email de confirmación de compra. Soporta <code className="text-neutral-400">{"{username}"}</code>, <code className="text-neutral-400">{"{plan_name}"}</code>, <code className="text-neutral-400">{"{circuit_name}"}</code>. Si está vacío se usa la plantilla por defecto.
                      </p>
                      <textarea
                        value={configForm.email_template}
                        onChange={(e) => setConfigForm((p) => ({ ...p, email_template: e.target.value }))}
                        rows={10}
                        spellCheck={false}
                        placeholder={`<h2 style="color:#fff;">Gracias, {username}!</h2>\n<p style="color:#e5e5e5;">Tu plan <strong style="color:#9fe556;">{plan_name}</strong> en <strong>{circuit_name}</strong> está activo.</p>`}
                        className="w-full bg-black border border-border rounded-lg px-3 py-2 text-xs text-neutral-200 font-mono resize-y min-h-[120px]"
                      />
                    </div>
                  </div>

                  <div className="flex gap-3 mt-6">
                    <button
                      onClick={saveConfig}
                      disabled={configSaving || !configForm.stripe_product_id || !configForm.stripe_price_id || !configForm.plan_type}
                      className="bg-accent hover:bg-accent-hover disabled:opacity-40 text-black font-semibold px-5 py-2 rounded-lg text-sm transition-colors"
                    >
                      {configSaving ? "Guardando..." : editingConfig ? "Actualizar" : "Crear"}
                    </button>
                    <button
                      onClick={() => setShowConfigForm(false)}
                      className="border border-border text-neutral-400 hover:text-white px-5 py-2 rounded-lg text-sm transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Chatbot Admin Manager ─────────────────────────────────────────────────────
//
// Stats + recent questions + reindex button for the support chatbot.
// Lives inside Plataforma so admins have a single page for backend ops.

interface ChatbotStats {
  messages_24h: number;
  messages_7d: number;
  messages_30d: number;
  input_tokens_30d: number;
  output_tokens_30d: number;
  estimated_cost_usd_30d: number;
  indexed_chunks: number;
  top_users_30d: {
    user_id: number;
    username: string;
    message_count: number;
    input_tokens: number;
    output_tokens: number;
  }[];
  recent_questions: {
    user_id: number;
    username: string;
    content: string;
    created_at: string;
  }[];
  daily_message_limit: number;
}

function ChatbotAdminManager() {
  const [stats, setStats] = useState<ChatbotStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reindexing, setReindexing] = useState(false);
  const [reindexMsg, setReindexMsg] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    api
      .chatAdminStats()
      .then((s) => { setStats(s); setLoading(false); })
      .catch((e) => { setError(e?.message || "Error al cargar"); setLoading(false); });
  };

  useEffect(() => { load(); }, []);

  const reindex = async () => {
    if (reindexing) return;
    setReindexing(true);
    setReindexMsg(null);
    try {
      const res = await api.chatAdminReindex();
      setReindexMsg(`Reindexado: ${res.indexed_chunks} chunks en ${res.duration_s}s`);
      load();
    } catch (e: any) {
      setReindexMsg(e?.message || "Error al reindexar");
    } finally {
      setReindexing(false);
    }
  };

  const fmtNum = (n: number) => n.toLocaleString("es-ES");
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString("es-ES", {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    });

  return (
    <div className="p-4 sm:p-6 max-w-5xl border-t border-border mt-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-lg font-semibold text-white">Asistente — Soporte</h2>
          <p className="text-sm text-neutral-400 mt-0.5">
            Uso del chatbot, coste estimado y reindexado de la documentación.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="border border-border text-neutral-400 hover:text-white hover:border-accent rounded-lg px-3 py-1.5 text-sm transition-colors"
          >
            Refrescar
          </button>
          <button
            onClick={reindex}
            disabled={reindexing}
            className="bg-accent hover:bg-accent-hover disabled:opacity-40 text-black font-semibold px-4 py-1.5 rounded-lg text-sm transition-colors"
          >
            {reindexing ? "Reindexando…" : "Reindexar docs"}
          </button>
        </div>
      </div>

      {reindexMsg && (
        <div className="mb-4 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-xs text-accent">
          {reindexMsg}
        </div>
      )}

      {loading ? (
        <div className="text-neutral-400 text-sm py-12 text-center">Cargando…</div>
      ) : error ? (
        <div className="text-red-400 text-sm py-12 text-center">{error}</div>
      ) : stats ? (
        <>
          {/* Stat tiles */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Tile label="Mensajes 24h" value={fmtNum(stats.messages_24h)} />
            <Tile label="Mensajes 7d" value={fmtNum(stats.messages_7d)} />
            <Tile label="Mensajes 30d" value={fmtNum(stats.messages_30d)} />
            <Tile
              label="Coste estimado 30d"
              value={`$${stats.estimated_cost_usd_30d.toFixed(3)}`}
              hint="OpenAI emb. + Groq paid"
            />
            <Tile label="Tokens IN 30d" value={fmtNum(stats.input_tokens_30d)} />
            <Tile label="Tokens OUT 30d" value={fmtNum(stats.output_tokens_30d)} />
            <Tile label="Chunks indexados" value={fmtNum(stats.indexed_chunks)} />
            <Tile
              label="Cap diario / usuario"
              value={fmtNum(stats.daily_message_limit)}
              hint="CHATBOT_DAILY_MESSAGE_LIMIT"
            />
          </div>

          {/* Top users */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-white mb-2">Top usuarios (30d)</h3>
            {stats.top_users_30d.length === 0 ? (
              <div className="text-neutral-500 text-xs py-4">Sin actividad en los últimos 30 días.</div>
            ) : (
              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-white/[0.02]">
                      <th className="text-left px-4 py-2 text-neutral-400 font-medium">Usuario</th>
                      <th className="text-right px-4 py-2 text-neutral-400 font-medium">Mensajes</th>
                      <th className="text-right px-4 py-2 text-neutral-400 font-medium hidden sm:table-cell">Tokens IN</th>
                      <th className="text-right px-4 py-2 text-neutral-400 font-medium hidden sm:table-cell">Tokens OUT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.top_users_30d.map((u) => (
                      <tr key={u.user_id} className="border-b border-border/50 hover:bg-white/[0.02]">
                        <td className="px-4 py-2 text-white">{u.username}</td>
                        <td className="px-4 py-2 text-neutral-200 text-right tabular-nums">{fmtNum(u.message_count)}</td>
                        <td className="px-4 py-2 text-neutral-400 text-right tabular-nums hidden sm:table-cell">{fmtNum(u.input_tokens)}</td>
                        <td className="px-4 py-2 text-neutral-400 text-right tabular-nums hidden sm:table-cell">{fmtNum(u.output_tokens)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Recent questions */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-2">Preguntas recientes</h3>
            <p className="text-xs text-neutral-500 mb-2">
              Últimas 30 preguntas. Útil para detectar qué falta documentar.
            </p>
            {stats.recent_questions.length === 0 ? (
              <div className="text-neutral-500 text-xs py-4">Sin preguntas registradas todavía.</div>
            ) : (
              <div className="border border-border rounded-lg divide-y divide-border">
                {stats.recent_questions.map((q, i) => (
                  <div key={i} className="px-4 py-2.5 hover:bg-white/[0.02]">
                    <div className="flex items-baseline justify-between gap-3 mb-0.5">
                      <span className="text-xs text-accent font-medium">{q.username}</span>
                      <span className="text-[10px] text-neutral-600 tabular-nums">{fmtDate(q.created_at)}</span>
                    </div>
                    <div className="text-sm text-neutral-200">{q.content}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="border border-border rounded-lg bg-card px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-widest text-neutral-500">{label}</div>
      <div className="text-xl font-semibold text-white tabular-nums mt-0.5">{value}</div>
      {hint && <div className="text-[10px] text-neutral-600 mt-0.5">{hint}</div>}
    </div>
  );
}

