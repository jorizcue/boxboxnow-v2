"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { StyledSelect } from "@/components/shared/StyledSelect";
import { CalendarPicker } from "@/components/shared/CalendarPicker";

interface UserRow {
  id: number;
  username: string;
  is_admin: boolean;
  max_devices: number;
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

const ALL_TAB_OPTIONS: [string, string][] = [
  ["race", "Carrera"],
  ["pit", "Box"],
  ["live", "Live"],
  ["adjusted", "C.Real"],
  ["config", "Config"],
  ["replay", "Replay"],
  ["analytics", "Analytics"],
];

function UsersManager() {
  const t = useT();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newIsAdmin, setNewIsAdmin] = useState(false);
  const [newMaxDevices, setNewMaxDevices] = useState(1);
  const [newTabs, setNewTabs] = useState<string[]>(ALL_TAB_OPTIONS.map(([k]) => k));
  const [selectedUser, setSelectedUser] = useState<number | null>(null);
  const [access, setAccess] = useState<AccessRow[]>([]);
  const [circuits, setCircuits] = useState<CircuitRow[]>([]);
  const [newCircuitId, setNewCircuitId] = useState<number>(0);
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
      // Set tab access for the new user
      const created = (await api.getUsers()).find((u: UserRow) => u.username === newUsername);
      if (created && !newIsAdmin) {
        await api.updateUserTabs(created.id, newTabs);
      }
      setNewUsername(""); setNewPassword(""); setNewIsAdmin(false); setNewMaxDevices(1);
      setNewTabs(ALL_TAB_OPTIONS.map(([k]) => k));
      setShowCreate(false);
      loadUsers();
    } catch (e: any) { alert(e.message); }
  };

  const deleteUser = async (id: number) => {
    if (!confirm(t("admin.deleteUser"))) return;
    try {
      await api.deleteUser(id);
      loadUsers();
      if (selectedUser === id) setSelectedUser(null);
    } catch (e: any) { alert(e.message); }
  };

  const loadAccess = async (userId: number) => {
    setSelectedUser(userId);
    setShowCreate(false);
    try { setAccess(await api.getUserAccess(userId)); } catch {}
  };

  const grantAccess = async () => {
    if (!selectedUser || !newCircuitId || !newValidFrom || !newValidUntil) return;
    try {
      await api.grantAccess({
        user_id: selectedUser, circuit_id: newCircuitId,
        valid_from: new Date(newValidFrom).toISOString(),
        valid_until: new Date(newValidUntil).toISOString(),
      });
      loadAccess(selectedUser);
      setNewCircuitId(0);
    } catch (e: any) { alert(e.message); }
  };

  const revokeAccess = async (accessId: number) => {
    try { await api.revokeAccess(accessId); if (selectedUser) loadAccess(selectedUser); } catch {}
  };

  const toggleNewTab = (tab: string) => {
    setNewTabs((prev) => prev.includes(tab) ? prev.filter((t) => t !== tab) : [...prev, tab]);
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

              {/* Devices */}
              {(() => {
                const su = users.find((u) => u.id === selectedUser);
                if (!su) return null;
                return (
                  <div>
                    <label className="block text-[10px] text-neutral-400 mb-1 uppercase tracking-wider">{t("admin.devicesTitle")}</label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={su.max_devices}
                      onChange={async (e) => {
                        const val = Math.max(1, Math.min(10, Number(e.target.value)));
                        try {
                          await api.updateUser(su.id, { max_devices: val });
                          loadUsers();
                        } catch {}
                      }}
                      className="w-20 bg-black border border-border rounded-lg px-3 py-1.5 text-sm text-center font-mono"
                    />
                  </div>
                );
              })()}

              {/* Circuit access */}
              <div className="border-t border-border pt-4">
                <label className="block text-[10px] text-neutral-400 mb-2 uppercase tracking-wider">{t("admin.circuitAccess")}</label>

                <div className="flex gap-2 mb-3 items-end flex-wrap">
                  <div className="min-w-[140px]">
                    <label className="block text-[9px] text-neutral-500 mb-1 uppercase tracking-wider">{t("config.circuit")}</label>
                    <StyledSelect
                      value={newCircuitId}
                      onChange={(v) => setNewCircuitId(Number(v))}
                      options={circuits.map((c) => ({ value: c.id, label: c.name }))}
                      placeholder={t("admin.selectCircuitPlaceholder")}
                    />
                  </div>
                  <div className="w-[150px]">
                    <label className="block text-[9px] text-neutral-500 mb-1 uppercase tracking-wider">{t("admin.from")}</label>
                    <CalendarPicker value={newValidFrom} onChange={setNewValidFrom} placeholder={t("admin.from")} />
                  </div>
                  <div className="w-[150px]">
                    <label className="block text-[9px] text-neutral-500 mb-1 uppercase tracking-wider">{t("admin.until")}</label>
                    <CalendarPicker value={newValidUntil} onChange={setNewValidUntil} placeholder={t("admin.until")} />
                  </div>
                  <button onClick={grantAccess} className="bg-accent hover:bg-accent-hover text-black font-bold w-8 h-8 rounded-lg text-sm flex items-center justify-center transition-colors flex-shrink-0">
                    +
                  </button>
                </div>

                <div className="space-y-1 max-h-60 overflow-y-auto scrollbar-none">
                  {access.map((a) => (
                    <div key={a.id} className="flex items-center gap-2 bg-black/30 rounded-lg px-3 py-2 text-xs">
                      <button onClick={() => revokeAccess(a.id)}
                        className="text-red-500/50 hover:text-red-400 transition-colors flex-shrink-0" title={t("admin.revoke")}>
                        <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <path d="M4 4l8 8M12 4l-8 8" />
                        </svg>
                      </button>
                      <span className="text-white font-medium">{a.circuit_name}</span>
                      <span className="text-neutral-500">
                        {new Date(a.valid_from).toLocaleDateString()} - {new Date(a.valid_until).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                  {access.length === 0 && (
                    <p className="text-neutral-600 text-xs text-center py-2">{t("admin.noAccess")}</p>
                  )}
                </div>
              </div>
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
  };
}

function CircuitsManager() {
  const t = useT();
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
    if (!confirm(t("admin.confirmDeleteCircuit"))) return;
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
      <div className={`bg-white/[0.03] rounded-xl p-4 border border-border transition-all ${panelOpen ? "flex-1 min-w-0" : "w-full"}`}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[11px] text-neutral-200 uppercase tracking-wider">{t("admin.circuitCatalog")}</h3>
          <button onClick={startCreate} className="bg-accent text-black font-semibold px-3 py-1.5 rounded-lg text-sm">
            {t("admin.new")}
          </button>
        </div>

        <div className="space-y-1">
          {circuits.map((c) => (
            <div
              key={c.id}
              onClick={() => startEdit(c)}
              className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                editingId === c.id
                  ? "bg-accent/10 border border-accent/30"
                  : "hover:bg-black/50 border border-transparent"
              }`}
            >
              <div className="min-w-0">
                <div className={`text-sm font-medium truncate ${editingId === c.id ? "text-accent" : "text-white"}`}>
                  {c.name}
                </div>
                <div className="flex gap-3 text-[10px] text-neutral-500 mt-0.5">
                  {c.length_m && <span>{c.length_m}m</span>}
                  <span>WSS:{c.ws_port}</span>
                  {c.pit_time_s && <span>Pit:{c.pit_time_s}s</span>}
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); deleteCircuit(c.id); }}
                className="text-red-400/40 hover:text-red-400 text-xs transition-colors ml-2 flex-shrink-0"
              >
                {t("admin.delete")}
              </button>
            </div>
          ))}
          {circuits.length === 0 && (
            <p className="text-neutral-500 text-sm py-4 text-center">{t("admin.noCircuits")}</p>
          )}
        </div>
      </div>

      {/* Right: slide-in edit/create panel */}
      {panelOpen && (
        <div className="w-80 flex-shrink-0 bg-white/[0.03] rounded-xl border border-border p-4 space-y-3 animate-in slide-in-from-right-4 duration-200">
          <div className="flex items-center justify-between">
            <h4 className="text-xs text-neutral-200 font-medium uppercase tracking-wider">
              {editingId ? t("admin.editCircuit") : t("admin.newCircuit")}
            </h4>
            <button
              onClick={cancelEdit}
              className="text-neutral-500 hover:text-white text-lg leading-none transition-colors"
            >
              &times;
            </button>
          </div>

          <div className="space-y-2.5">
            {fieldInput(t("admin.name"), "name", "text", t("admin.namePlaceholder"))}

            <div className="grid grid-cols-2 gap-2">
              {fieldInput(t("admin.wsPort"), "ws_port", "number", "Puerto WSS")}
              {fieldInput(t("admin.wsPortData"), "ws_port_data", "number", "Puerto WS")}
            </div>

            <div className="grid grid-cols-2 gap-2">
              {fieldInput(t("admin.length"), "length_m", "number", "Metros")}
              {fieldInput(t("admin.pitTime"), "pit_time_s", "number", "Segundos")}
            </div>

            <div className="grid grid-cols-2 gap-2">
              {fieldInput(t("admin.phpApiPort"), "php_api_port", "number", "Puerto")}
              {fieldInput(t("admin.lapsDiscard"), "laps_discard", "number", "2")}
            </div>

            <div className="grid grid-cols-2 gap-2">
              {fieldInput(t("admin.lapDifferential"), "lap_differential", "number", "3000")}
              {fieldInput(t("admin.retentionDays"), "retention_days", "number", "30")}
            </div>

            {fieldInput("PHP API URL", "php_api_url", "text", "http://...")}
            {fieldInput("Live Timing URL", "live_timing_url", "text", "https://...")}
          </div>

          <div className="flex gap-2 pt-1">
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
              className="w-full text-red-400/60 hover:text-red-400 text-xs py-1.5 transition-colors"
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
