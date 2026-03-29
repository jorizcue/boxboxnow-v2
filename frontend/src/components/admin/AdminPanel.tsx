"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { useRaceStore } from "@/hooks/useRaceState";
import { useT } from "@/lib/i18n";

interface UserRow {
  id: number;
  username: string;
  is_admin: boolean;
  max_devices: number;
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
}

interface AccessRow {
  id: number;
  user_id: number;
  circuit_id: number;
  circuit_name: string;
  valid_from: string;
  valid_until: string;
}

export function AdminPanel() {
  const t = useT();
  const [tab, setTab] = useState<"users" | "circuits" | "hub" | "replay" | "analytics">("users");

  const tabBtn = (key: typeof tab, label: string) => (
    <button
      onClick={() => setTab(key)}
      className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
        tab === key ? "bg-accent text-black" : "bg-surface text-neutral-200 hover:text-neutral-300"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-0.5">
        {tabBtn("users", t("admin.users"))}
        {tabBtn("circuits", t("admin.circuits"))}
        {tabBtn("hub", t("admin.hub"))}
        {tabBtn("replay", t("admin.replay"))}
        {tabBtn("analytics", t("admin.analytics"))}
      </div>

      {tab === "users" && <UsersManager />}
      {tab === "circuits" && <CircuitsManager />}
      {tab === "hub" && <CircuitHubManager />}
      {tab === "replay" && <ReplayControls />}
      {tab === "analytics" && <KartAnalytics />}
    </div>
  );
}

function UsersManager() {
  const t = useT();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newIsAdmin, setNewIsAdmin] = useState(false);
  const [newMaxDevices, setNewMaxDevices] = useState(1);
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
      setNewUsername(""); setNewPassword(""); setNewIsAdmin(false); setNewMaxDevices(1);
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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-white/[0.03] rounded-xl p-4 border border-border">
        <h3 className="text-[11px] text-neutral-200 mb-3 uppercase tracking-wider">{t("admin.usersTitle")}</h3>

        <div className="flex gap-2 mb-4">
          <input placeholder={t("admin.userPlaceholder")} value={newUsername} onChange={(e) => setNewUsername(e.target.value)}
            className="flex-1 bg-black border border-border rounded-lg px-2 py-1.5 text-sm" />
          <input placeholder="Password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
            className="flex-1 bg-black border border-border rounded-lg px-2 py-1.5 text-sm" />
          <input placeholder={t("admin.devicesShort")} type="number" min="1" max="10" value={newMaxDevices}
            onChange={(e) => setNewMaxDevices(Number(e.target.value))}
            className="w-16 bg-black border border-border rounded-lg px-2 py-1.5 text-sm" title={t("admin.devicesTitle")} />
          <label className="flex items-center gap-1 text-xs text-neutral-200">
            <input type="checkbox" checked={newIsAdmin} onChange={(e) => setNewIsAdmin(e.target.checked)} className="accent-accent" />
            Admin
          </label>
          <button onClick={createUser} className="bg-accent text-black font-semibold px-3 py-1.5 rounded-lg text-sm">
            {t("admin.create")}
          </button>
        </div>

        <table className="w-full text-sm">
          <thead className="text-[11px] text-neutral-400 uppercase tracking-wider">
            <tr>
              <th className="text-left px-2 py-1">{t("admin.userPlaceholder")}</th>
              <th className="text-center px-2 py-1">{t("admin.devicesShort")}</th>
              <th className="text-center px-2 py-1">Admin</th>
              <th className="text-right px-2 py-1"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}
                className={`border-t border-border cursor-pointer transition-colors ${selectedUser === u.id ? "bg-accent/10 border-l-2 border-l-accent" : "hover:bg-black/50"}`}
                onClick={() => loadAccess(u.id)}>
                <td className="px-2 py-1.5 text-white">{u.username}</td>
                <td className="px-2 py-1.5 text-center" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={u.max_devices}
                    onChange={async (e) => {
                      const val = Math.max(1, Math.min(10, Number(e.target.value)));
                      try {
                        await api.updateUser(u.id, { max_devices: val });
                        loadUsers();
                      } catch {}
                    }}
                    className="w-12 bg-black border border-border rounded px-1 py-0.5 text-sm text-center font-mono text-neutral-400"
                  />
                </td>
                <td className="px-2 py-1.5 text-center">
                  {u.is_admin ? <span className="text-accent text-xs font-medium">{t("common.yes")}</span> : <span className="text-neutral-700">-</span>}
                </td>
                <td className="px-2 py-1.5 text-right">
                  <button onClick={(e) => { e.stopPropagation(); deleteUser(u.id); }}
                    className="text-red-400/60 hover:text-red-400 text-xs transition-colors">{t("admin.delete")}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white/[0.03] rounded-xl p-4 border border-border">
        <h3 className="text-[11px] text-neutral-200 mb-3 uppercase tracking-wider">
          {t("admin.circuitAccess")}{selectedUser && ` — ${users.find((u) => u.id === selectedUser)?.username}`}
        </h3>

        {selectedUser ? (
          <>
            <div className="flex gap-2 mb-4 flex-wrap">
              <select value={newCircuitId} onChange={(e) => setNewCircuitId(Number(e.target.value))}
                className="bg-black border border-border rounded-lg px-2 py-1.5 text-sm">
                <option value={0}>{t("admin.selectCircuitPlaceholder")}</option>
                {circuits.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input type="date" value={newValidFrom} onChange={(e) => setNewValidFrom(e.target.value)}
                className="bg-black border border-border rounded-lg px-2 py-1.5 text-sm" />
              <input type="date" value={newValidUntil} onChange={(e) => setNewValidUntil(e.target.value)}
                className="bg-black border border-border rounded-lg px-2 py-1.5 text-sm" />
              <button onClick={grantAccess} className="bg-accent text-black font-semibold px-3 py-1.5 rounded-lg text-sm">
                {t("admin.grantAccess")}
              </button>
            </div>

            <table className="w-full text-sm">
              <thead className="text-[11px] text-neutral-400 uppercase tracking-wider">
                <tr>
                  <th className="text-left px-2 py-1">{t("config.circuit")}</th>
                  <th className="text-left px-2 py-1">{t("admin.from")}</th>
                  <th className="text-left px-2 py-1">{t("admin.until")}</th>
                  <th className="text-right px-2 py-1"></th>
                </tr>
              </thead>
              <tbody>
                {access.map((a) => (
                  <tr key={a.id} className="border-t border-border">
                    <td className="px-2 py-1.5 text-white">{a.circuit_name}</td>
                    <td className="px-2 py-1.5 text-neutral-200">{new Date(a.valid_from).toLocaleDateString()}</td>
                    <td className="px-2 py-1.5 text-neutral-200">{new Date(a.valid_until).toLocaleDateString()}</td>
                    <td className="px-2 py-1.5 text-right">
                      <button onClick={() => revokeAccess(a.id)}
                        className="text-red-400/60 hover:text-red-400 text-xs transition-colors">{t("admin.revoke")}</button>
                    </td>
                  </tr>
                ))}
                {access.length === 0 && (
                  <tr><td colSpan={4} className="px-2 py-4 text-center text-neutral-500">{t("admin.noAccess")}</td></tr>
                )}
              </tbody>
            </table>
          </>
        ) : (
          <p className="text-neutral-500 text-sm">{t("admin.selectUserHint")}</p>
        )}
      </div>
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

            {fieldInput(t("admin.lapDifferential"), "lap_differential", "number", "3000")}
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


// --- Replay Controls ---

// Module-level state for replay — survives tab changes (component re-mounts)
let _replaySelectedLog = "";
let _replaySelectedOwnerId: number | null = null;
let _replaySelectedCircuitDir: string | null = null;
let _replaySpeed = 10;

interface RaceStartMarker {
  block: number;
  progress: number;
  timestamp: string;
  title: string;
}

interface LogAnalysis {
  totalBlocks: number;
  raceStarts: RaceStartMarker[];
  startTime: string | null;
  endTime: string | null;
}

interface RecordingCircuit {
  circuit_dir: string;
  circuit_name: string;
  circuit_id: number | null;
  dates: string[];
}

interface LogEntry {
  filename: string;
  owner_id?: number | null;
  owner?: string;
  circuit_dir?: string;
}

function ReplayControls() {
  const t = useT();
  // Recording circuits (circuit+date selector)
  const [recordingCircuits, setRecordingCircuits] = useState<RecordingCircuit[]>([]);
  const [selectedRecCircuit, setSelectedRecCircuitState] = useState(_replaySelectedCircuitDir || "");
  const [selectedDate, setSelectedDateState] = useState("");

  // Legacy logs (flat file list)
  const [legacyLogs, setLegacyLogs] = useState<LogEntry[]>([]);
  const [showLegacy, setShowLegacy] = useState(false);

  // Module-level state for replay params
  const [selectedLog, setSelectedLogState] = useState(_replaySelectedLog);
  const [selectedOwnerId, setSelectedOwnerIdState] = useState<number | null>(_replaySelectedOwnerId);
  const [selectedCircuitDir, setSelectedCircuitDirState] = useState<string | null>(_replaySelectedCircuitDir);
  const [speed, setSpeedState] = useState(_replaySpeed);
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<LogAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const {
    requestWsReconnect,
    replayActive, replayPaused, replayProgress, replayTime, setReplayStatus,
  } = useRaceStore();

  // Setters that persist to module-level
  const setSelectedLog = (v: string, ownerId: number | null = null, circuitDir: string | null = null) => {
    _replaySelectedLog = v;
    _replaySelectedOwnerId = ownerId;
    _replaySelectedCircuitDir = circuitDir;
    setSelectedLogState(v);
    setSelectedOwnerIdState(ownerId);
    setSelectedCircuitDirState(circuitDir);
  };
  const setSpeed = (v: number) => { _replaySpeed = v; setSpeedState(v); };
  const setSelectedRecCircuit = (v: string) => { _replaySelectedCircuitDir = v || null; setSelectedRecCircuitState(v); };

  // Sync replay status
  const syncStatus = async () => {
    try {
      const st = await api.getReplayStatus();
      setReplayStatus(st.active, st.paused, st.filename || "", st.progress || 0, st.currentTime || "");
    } catch {}
  };

  // Load recording circuits + legacy logs on mount
  useEffect(() => {
    api.getRecordings()
      .then((data) => setRecordingCircuits(data.circuits || []))
      .catch(() => {});
    api.getReplayLogs()
      .then((data) => setLegacyLogs((data.logs || []).filter((l: LogEntry) => !l.circuit_dir)))
      .catch(() => {});
    syncStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Get dates for selected circuit
  const selectedCircuitData = recordingCircuits.find((c) => c.circuit_dir === selectedRecCircuit);
  const availableDates = selectedCircuitData?.dates || [];

  // When circuit or date changes, update the replay selection
  useEffect(() => {
    if (selectedRecCircuit && selectedDate) {
      const filename = `${selectedDate}.log`;
      setSelectedLog(filename, null, selectedRecCircuit);
    } else if (!selectedRecCircuit) {
      if (selectedCircuitDir && !selectedOwnerId) {
        setSelectedLog("", null, null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRecCircuit, selectedDate]);

  // Analyze log when selected
  useEffect(() => {
    if (!selectedLog) { setAnalysis(null); return; }
    setAnalyzing(true);
    api.analyzeLog(selectedLog, selectedOwnerId, selectedCircuitDir)
      .then(setAnalysis)
      .catch(() => setAnalysis(null))
      .finally(() => setAnalyzing(false));
  }, [selectedLog, selectedOwnerId, selectedCircuitDir]);

  // Poll status while replay is active
  useEffect(() => {
    if (!replayActive) return;
    const interval = setInterval(syncStatus, 2000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replayActive]);

  const startFromBlock = async (block: number = 0) => {
    if (!selectedLog) return;
    setLoading(true);
    try {
      await api.startReplay(selectedLog, speed, block, selectedOwnerId, selectedCircuitDir);
      requestWsReconnect();
      await syncStatus();
    } catch (e: any) {
      alert("Error: " + e.message);
    }
    setLoading(false);
  };

  const handleSeek = async (block: number) => {
    if (!replayActive) return;
    try {
      await api.seekReplay(block);
      await syncStatus();
    } catch (e: any) {
      alert("Error: " + e.message);
    }
  };

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!analysis || analysis.totalBlocks === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const block = Math.round(pct * analysis.totalBlocks);
    if (replayActive) {
      handleSeek(block);
    } else {
      startFromBlock(block);
    }
  };

  // Legacy log select handler
  const handleLegacySelect = (val: string) => {
    if (!val) { setSelectedLog(""); return; }
    const colonIdx = val.indexOf(":");
    if (colonIdx > 0) {
      const oid = parseInt(val.substring(0, colonIdx), 10);
      setSelectedLog(val.substring(colonIdx + 1), isNaN(oid) ? null : oid, null);
    } else {
      setSelectedLog(val, null, null);
    }
    setSelectedRecCircuit("");
    setSelectedDateState("");
  };

  return (
    <div className="bg-white/[0.03] rounded-xl p-6 border border-border">
      <h2 className="text-[11px] text-neutral-200 mb-4 uppercase tracking-wider">{t("replay.title")}</h2>

      <div className="space-y-3">
        {/* Circuit + Date selectors */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[10px] text-neutral-400 mb-1 uppercase tracking-wider">{t("replay.circuit")}</label>
            <select
              value={selectedRecCircuit}
              onChange={(e) => {
                setSelectedRecCircuit(e.target.value);
                setSelectedDateState("");
                if (!e.target.value) setSelectedLog("", null, null);
              }}
              disabled={replayActive}
              className="w-full bg-black border border-border rounded-lg px-3 py-2 text-sm disabled:opacity-40"
            >
              <option value="">{t("replay.select")}</option>
              {recordingCircuits.map((c) => (
                <option key={c.circuit_dir} value={c.circuit_dir}>
                  {c.circuit_name} ({c.dates.length}d)
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-neutral-400 mb-1 uppercase tracking-wider">{t("replay.date")}</label>
            <select
              value={selectedDate}
              onChange={(e) => setSelectedDateState(e.target.value)}
              disabled={replayActive || !selectedRecCircuit}
              className="w-full bg-black border border-border rounded-lg px-3 py-2 text-sm disabled:opacity-40"
            >
              <option value="">{t("replay.select")}</option>
              {availableDates.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Legacy logs toggle */}
        {legacyLogs.length > 0 && (
          <div>
            <button
              onClick={() => setShowLegacy(!showLegacy)}
              className="text-[10px] text-neutral-500 hover:text-neutral-300 transition-colors"
            >
              {showLegacy ? t("replay.hideLegacy") : t("replay.showLegacy")} {t("replay.oldRecordings")} ({legacyLogs.length})
            </button>
            {showLegacy && (
              <select
                value={selectedOwnerId != null ? `${selectedOwnerId}:${selectedLog}` : selectedLog}
                onChange={(e) => handleLegacySelect(e.target.value)}
                disabled={replayActive}
                className="w-full mt-1 bg-black border border-border rounded-lg px-3 py-2 text-sm disabled:opacity-40"
              >
                <option value="">{t("replay.selectOldLog")}</option>
                {legacyLogs.map((log, idx) => {
                  const val = log.owner_id != null ? `${log.owner_id}:${log.filename}` : log.filename;
                  const label = log.owner ? `[${log.owner}] ${log.filename}` : log.filename;
                  return <option key={`${val}-${idx}`} value={val}>{label}</option>;
                })}
              </select>
            )}
          </div>
        )}

        {/* Timeline bar */}
        {analysis && analysis.totalBlocks > 0 && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-[10px] text-neutral-500">
              <span>{analysis.startTime}</span>
              <span>{analysis.totalBlocks} {t("replay.blocks")}</span>
              <span>{analysis.endTime}</span>
            </div>
            <div
              className="relative w-full h-6 bg-black rounded-lg cursor-pointer border border-border group"
              onClick={handleTimelineClick}
              title={t("replay.clickToSeek")}
            >
              {replayActive && (
                <div
                  className="absolute top-0 left-0 h-full bg-accent/20 rounded-lg transition-all"
                  style={{ width: `${replayProgress * 100}%` }}
                />
              )}
              {replayActive && (
                <div
                  className="absolute top-0 h-full w-0.5 bg-accent transition-all"
                  style={{ left: `${replayProgress * 100}%` }}
                />
              )}
              {analysis.raceStarts.map((rs, idx) => (
                <div
                  key={idx}
                  className="absolute top-0 h-full flex flex-col items-center group/marker"
                  style={{ left: `${rs.progress * 100}%` }}
                >
                  <div className="w-0.5 h-full bg-green-500" />
                  <div className="absolute -top-5 text-[9px] text-green-400 font-mono whitespace-nowrap opacity-0 group-hover/marker:opacity-100 transition-opacity pointer-events-none">
                    {rs.title ? `${rs.title} ${rs.timestamp}` : rs.timestamp}
                  </div>
                </div>
              ))}
            </div>

            {analysis.raceStarts.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {analysis.raceStarts.map((rs, idx) => (
                  <button
                    key={idx}
                    onClick={() => replayActive ? handleSeek(rs.block) : startFromBlock(rs.block)}
                    disabled={loading}
                    className="flex items-center gap-1.5 bg-green-900/30 hover:bg-green-900/50 disabled:opacity-40 text-green-400 text-[10px] font-medium px-2 py-1 rounded border border-green-900/30 transition-colors"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                    <span className="truncate">{rs.title || `${t("replay.raceN")} ${idx + 1}`}</span>
                    <span className="text-green-600 flex-shrink-0">{rs.timestamp}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {analyzing && (
          <p className="text-[10px] text-neutral-500">{t("replay.analyzing")}</p>
        )}

        <div>
          <label className="block text-[10px] text-neutral-400 mb-1 uppercase tracking-wider">
            {t("replay.speed")}: {speed}x
          </label>
          <input
            type="range" min="1" max="100" value={speed}
            onChange={(e) => {
              const v = Number(e.target.value);
              setSpeed(v);
              if (replayActive) api.setReplaySpeed(v);
            }}
            className="w-full accent-accent"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => startFromBlock(0)}
            disabled={!selectedLog || loading || replayActive}
            className="w-10 h-10 flex items-center justify-center bg-accent hover:bg-accent-hover disabled:opacity-40 text-black rounded-lg transition-colors"
            title={t("replay.start")}
          >
            {loading ? (
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="32" strokeLinecap="round"/></svg>
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            )}
          </button>
          <button
            onClick={async () => {
              await api.pauseReplay();
              await syncStatus();
            }}
            disabled={!replayActive}
            className="w-10 h-10 flex items-center justify-center bg-black hover:bg-surface disabled:opacity-40 text-neutral-300 rounded-lg border border-border transition-colors"
            title={replayPaused ? t("replay.resume") : t("replay.pause")}
          >
            {replayPaused ? (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
            )}
          </button>
          <button
            onClick={async () => {
              await api.stopReplay();
              await syncStatus();
              requestWsReconnect();
            }}
            disabled={!replayActive}
            className="w-10 h-10 flex items-center justify-center bg-red-900/50 hover:bg-red-800 disabled:opacity-40 text-red-300 rounded-lg transition-colors"
            title={t("replay.stopBtn")}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h12v12H6z"/></svg>
          </button>

          {replayActive && (
            <div className="flex-1 flex items-center justify-end gap-3 text-[11px] font-mono">
              {replayTime && (
                <span className="text-accent font-semibold">{replayTime}</span>
              )}
              <span className="text-neutral-400">{(replayProgress * 100).toFixed(1)}%</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


// --- Kart Analytics ---

interface KartStat {
  kart_number: number;
  races: number;
  total_laps: number;
  valid_laps: number;
  avg_lap_ms: number;
  best5_avg_ms: number;
  best_lap_ms: number;
  teams: string[];
}

function msToLapTime(ms: number): string {
  if (ms <= 0) return "-";
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = Math.floor(ms % 1000);
  if (minutes > 0) {
    return `${minutes}:${seconds.toString().padStart(2, "0")}.${millis.toString().padStart(3, "0")}`;
  }
  return `${seconds}.${millis.toString().padStart(3, "0")}`;
}

function KartAnalytics() {
  const t = useT();
  const [circuits, setCircuits] = useState<CircuitRow[]>([]);
  const [selectedCircuit, setSelectedCircuit] = useState<number>(0);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0]);
  const [stats, setStats] = useState<KartStat[]>([]);
  const [raceLogs, setRaceLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.getAllCircuits().then(setCircuits).catch(() => {});
  }, []);

  const loadStats = async () => {
    if (!selectedCircuit) return;
    setLoading(true);
    try {
      const [statsData, logsData] = await Promise.all([
        api.getKartStats(selectedCircuit, dateFrom, dateTo),
        api.getRaceLogs(selectedCircuit, dateFrom, dateTo),
      ]);
      setStats(statsData);
      setRaceLogs(logsData);
    } catch (e: any) {
      alert("Error: " + e.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (selectedCircuit) loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCircuit, dateFrom, dateTo]);

  // Find best values for color coding
  const bestBest5 = stats.length > 0 ? Math.min(...stats.map((s) => s.best5_avg_ms)) : 0;
  const worstBest5 = stats.length > 0 ? Math.max(...stats.map((s) => s.best5_avg_ms)) : 0;
  const range = worstBest5 - bestBest5;

  const getSpeedColor = (ms: number): string => {
    if (range === 0) return "text-white";
    const pct = (ms - bestBest5) / range;
    if (pct < 0.15) return "text-green-400";
    if (pct < 0.35) return "text-accent";
    if (pct < 0.65) return "text-white";
    if (pct < 0.85) return "text-orange-400";
    return "text-red-400";
  };

  return (
    <div className="space-y-4">
      <div className="bg-white/[0.03] rounded-xl p-4 border border-border">
        <h3 className="text-[11px] text-neutral-200 mb-3 uppercase tracking-wider">{t("analytics.title")}</h3>

        <div className="flex gap-3 items-end flex-wrap">
          <div>
            <label className="block text-[10px] text-neutral-400 mb-1 uppercase tracking-wider">{t("analytics.circuit")}</label>
            <select
              value={selectedCircuit}
              onChange={(e) => setSelectedCircuit(Number(e.target.value))}
              className="bg-black border border-border rounded-lg px-3 py-2 text-sm"
            >
              <option value={0}>{t("analytics.select")}</option>
              {circuits.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-neutral-400 mb-1 uppercase tracking-wider">{t("analytics.from")}</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="bg-black border border-border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-[10px] text-neutral-400 mb-1 uppercase tracking-wider">{t("analytics.to")}</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="bg-black border border-border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <button
            onClick={loadStats}
            disabled={!selectedCircuit || loading}
            className="bg-accent hover:bg-accent-hover disabled:opacity-40 text-black font-semibold px-4 py-2 rounded-lg text-sm"
          >
            {loading ? t("analytics.loading") : t("analytics.search")}
          </button>
        </div>

        {raceLogs.length > 0 && (
          <div className="mt-3 flex items-center gap-3 text-[10px] text-neutral-400">
            <span className="text-accent font-semibold">{raceLogs.length}</span> {t("analytics.racesFound")}
            <span className="text-neutral-600">|</span>
            <span className="text-accent font-semibold">{stats.length}</span> {t("analytics.karts")}
            <span className="text-neutral-600">|</span>
            <span className="text-accent font-semibold">{stats.reduce((a, s) => a + s.valid_laps, 0).toLocaleString()}</span> {t("analytics.validLaps")}
          </div>
        )}
      </div>

      {stats.length > 0 && (
        <div className="bg-white/[0.03] rounded-xl p-4 border border-border">
          <h3 className="text-[11px] text-neutral-200 mb-3 uppercase tracking-wider">
            {t("analytics.performance")}
            <span className="text-neutral-500 ml-2 normal-case">{t("analytics.sortedByTop5")}</span>
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] text-neutral-400 uppercase tracking-wider">
                <tr>
                  <th className="text-center px-2 py-1.5 w-8">#</th>
                  <th className="text-center px-2 py-1.5">{t("race.kart")}</th>
                  <th className="text-right px-2 py-1.5">{t("analytics.top5Avg")}</th>
                  <th className="text-right px-2 py-1.5">{t("analytics.generalAvg")}</th>
                  <th className="text-right px-2 py-1.5">{t("analytics.bestLap")}</th>
                  <th className="text-right px-2 py-1.5">{t("analytics.races")}</th>
                  <th className="text-right px-2 py-1.5">{t("analytics.lapsCol")}</th>
                  <th className="text-left px-2 py-1.5">{t("analytics.teams")}</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s, idx) => (
                  <tr key={s.kart_number} className="border-t border-border hover:bg-black/30 transition-colors">
                    <td className="px-2 py-1.5 text-center text-neutral-500 text-xs">{idx + 1}</td>
                    <td className="px-2 py-1.5 text-center font-bold text-white text-base">{s.kart_number}</td>
                    <td className={`px-2 py-1.5 text-right font-mono font-semibold ${getSpeedColor(s.best5_avg_ms)}`}>
                      {msToLapTime(s.best5_avg_ms)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-neutral-300">
                      {msToLapTime(s.avg_lap_ms)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-purple-400">
                      {msToLapTime(s.best_lap_ms)}
                    </td>
                    <td className="px-2 py-1.5 text-right text-neutral-400">{s.races}</td>
                    <td className="px-2 py-1.5 text-right text-neutral-400">{s.valid_laps}</td>
                    <td className="px-2 py-1.5 text-left text-[11px] text-neutral-500 truncate max-w-[200px]">
                      {s.teams.join(", ") || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {stats.length > 0 && (
            <div className="mt-3 flex items-center gap-4 text-[10px]">
              <span className="text-green-400">{t("analytics.fast")}</span>
              <span className="text-accent">{t("analytics.goodPace")}</span>
              <span className="text-white">{t("analytics.normal")}</span>
              <span className="text-orange-400">{t("analytics.slow")}</span>
              <span className="text-red-400">{t("analytics.verySlow")}</span>
            </div>
          )}
        </div>
      )}

      {!loading && selectedCircuit > 0 && stats.length === 0 && raceLogs.length === 0 && (
        <div className="bg-white/[0.03] rounded-xl p-8 border border-border text-center">
          <p className="text-neutral-500 text-sm">{t("analytics.noData")}</p>
          <p className="text-neutral-600 text-xs mt-2">{t("analytics.autoSaveHint")}</p>
        </div>
      )}
    </div>
  );
}
