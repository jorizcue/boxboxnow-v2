"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";

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
  const [tab, setTab] = useState<"users" | "circuits">("users");

  return (
    <div className="space-y-4">
      <div className="flex gap-0.5">
        <button
          onClick={() => setTab("users")}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === "users" ? "bg-accent text-black" : "bg-surface text-neutral-200 hover:text-neutral-300"
          }`}
        >
          Usuarios
        </button>
        <button
          onClick={() => setTab("circuits")}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === "circuits" ? "bg-accent text-black" : "bg-surface text-neutral-200 hover:text-neutral-300"
          }`}
        >
          Circuitos
        </button>
      </div>

      {tab === "users" && <UsersManager />}
      {tab === "circuits" && <CircuitsManager />}
    </div>
  );
}

function UsersManager() {
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
    if (!confirm("Eliminar usuario?")) return;
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
      <div className="bg-surface rounded-xl p-4 border border-border">
        <h3 className="text-[11px] text-neutral-200 mb-3 uppercase tracking-wider">Usuarios</h3>

        <div className="flex gap-2 mb-4">
          <input placeholder="Usuario" value={newUsername} onChange={(e) => setNewUsername(e.target.value)}
            className="flex-1 bg-black border border-border rounded-lg px-2 py-1.5 text-sm" />
          <input placeholder="Password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
            className="flex-1 bg-black border border-border rounded-lg px-2 py-1.5 text-sm" />
          <input placeholder="Disp." type="number" min="1" max="10" value={newMaxDevices}
            onChange={(e) => setNewMaxDevices(Number(e.target.value))}
            className="w-16 bg-black border border-border rounded-lg px-2 py-1.5 text-sm" title="Max dispositivos" />
          <label className="flex items-center gap-1 text-xs text-neutral-200">
            <input type="checkbox" checked={newIsAdmin} onChange={(e) => setNewIsAdmin(e.target.checked)} className="accent-accent" />
            Admin
          </label>
          <button onClick={createUser} className="bg-accent text-black font-semibold px-3 py-1.5 rounded-lg text-sm">
            Crear
          </button>
        </div>

        <table className="w-full text-sm">
          <thead className="text-[11px] text-neutral-400 uppercase tracking-wider">
            <tr>
              <th className="text-left px-2 py-1">Usuario</th>
              <th className="text-center px-2 py-1">Disp.</th>
              <th className="text-center px-2 py-1">Admin</th>
              <th className="text-right px-2 py-1"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}
                className={`border-t border-border cursor-pointer hover:bg-black/50 transition-colors ${selectedUser === u.id ? "bg-black" : ""}`}
                onClick={() => loadAccess(u.id)}>
                <td className="px-2 py-1.5 text-white">{u.username}</td>
                <td className="px-2 py-1.5 text-center font-mono text-neutral-400">{u.max_devices}</td>
                <td className="px-2 py-1.5 text-center">
                  {u.is_admin ? <span className="text-accent text-xs font-medium">SI</span> : <span className="text-neutral-700">-</span>}
                </td>
                <td className="px-2 py-1.5 text-right">
                  <button onClick={(e) => { e.stopPropagation(); deleteUser(u.id); }}
                    className="text-red-400/60 hover:text-red-400 text-xs transition-colors">Eliminar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-surface rounded-xl p-4 border border-border">
        <h3 className="text-[11px] text-neutral-200 mb-3 uppercase tracking-wider">
          Acceso a Circuitos{selectedUser && ` — ${users.find((u) => u.id === selectedUser)?.username}`}
        </h3>

        {selectedUser ? (
          <>
            <div className="flex gap-2 mb-4 flex-wrap">
              <select value={newCircuitId} onChange={(e) => setNewCircuitId(Number(e.target.value))}
                className="bg-black border border-border rounded-lg px-2 py-1.5 text-sm">
                <option value={0}>Circuito...</option>
                {circuits.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input type="date" value={newValidFrom} onChange={(e) => setNewValidFrom(e.target.value)}
                className="bg-black border border-border rounded-lg px-2 py-1.5 text-sm" />
              <input type="date" value={newValidUntil} onChange={(e) => setNewValidUntil(e.target.value)}
                className="bg-black border border-border rounded-lg px-2 py-1.5 text-sm" />
              <button onClick={grantAccess} className="bg-accent text-black font-semibold px-3 py-1.5 rounded-lg text-sm">
                Dar acceso
              </button>
            </div>

            <table className="w-full text-sm">
              <thead className="text-[11px] text-neutral-400 uppercase tracking-wider">
                <tr>
                  <th className="text-left px-2 py-1">Circuito</th>
                  <th className="text-left px-2 py-1">Desde</th>
                  <th className="text-left px-2 py-1">Hasta</th>
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
                        className="text-red-400/60 hover:text-red-400 text-xs transition-colors">Revocar</button>
                    </td>
                  </tr>
                ))}
                {access.length === 0 && (
                  <tr><td colSpan={4} className="px-2 py-4 text-center text-neutral-700">Sin acceso a circuitos</td></tr>
                )}
              </tbody>
            </table>
          </>
        ) : (
          <p className="text-neutral-700 text-sm">Selecciona un usuario para gestionar su acceso</p>
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
    if (!confirm("Eliminar circuito? Se perderán los accesos asociados.")) return;
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
      <label className="text-[10px] text-neutral-500 uppercase tracking-wider">{label}</label>
      <input
        type={type}
        value={form[key]}
        onChange={(e) => setField(key, e.target.value)}
        placeholder={placeholder}
        className="bg-black border border-border rounded-lg px-2 py-1.5 text-sm w-full"
      />
    </div>
  );

  return (
    <div className="bg-surface rounded-xl p-4 border border-border">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[11px] text-neutral-200 uppercase tracking-wider">Catálogo de Circuitos</h3>
        {!showCreate && !editingId && (
          <button onClick={startCreate} className="bg-accent text-black font-semibold px-3 py-1.5 rounded-lg text-sm">
            Nuevo circuito
          </button>
        )}
      </div>

      {/* Create / Edit form */}
      {(showCreate || editingId) && (
        <div className="mb-4 p-3 bg-black rounded-lg border border-border space-y-3">
          <h4 className="text-xs text-neutral-300 font-medium">
            {editingId ? "Editar circuito" : "Nuevo circuito"}
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {fieldInput("Nombre", "name", "text", "Nombre del circuito")}
            {fieldInput("WS Port (wss)", "ws_port", "number", "Puerto WSS")}
            {fieldInput("WS Data Port (ws)", "ws_port_data", "number", "Puerto WS datos")}
            {fieldInput("PHP API Port", "php_api_port", "number", "Puerto PHP API")}
            {fieldInput("PHP API URL", "php_api_url", "text", "http://...")}
            {fieldInput("Longitud (m)", "length_m", "number", "Metros")}
            {fieldInput("Pit Time (s)", "pit_time_s", "number", "Segundos")}
            {fieldInput("Vueltas descarte", "laps_discard", "number", "2")}
            {fieldInput("Diferencial (ms)", "lap_differential", "number", "3000")}
            {fieldInput("Live Timing URL", "live_timing_url", "text", "https://...")}
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={saveCircuit} className="bg-accent text-black font-semibold px-4 py-1.5 rounded-lg text-sm">
              {editingId ? "Guardar" : "Crear"}
            </button>
            <button onClick={cancelEdit} className="bg-surface text-neutral-200 px-4 py-1.5 rounded-lg text-sm border border-border hover:text-white transition-colors">
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[11px] text-neutral-400 uppercase tracking-wider">
            <tr>
              <th className="text-left px-2 py-1">Nombre</th>
              <th className="text-right px-2 py-1">Longitud</th>
              <th className="text-right px-2 py-1">Pit (s)</th>
              <th className="text-right px-2 py-1">WSS</th>
              <th className="text-right px-2 py-1">WS Data</th>
              <th className="text-right px-2 py-1">PHP</th>
              <th className="text-right px-2 py-1">Desc.</th>
              <th className="text-right px-2 py-1">Dif.</th>
              <th className="text-left px-2 py-1">API URL</th>
              <th className="text-right px-2 py-1"></th>
            </tr>
          </thead>
          <tbody>
            {circuits.map((c) => (
              <tr
                key={c.id}
                className={`border-t border-border cursor-pointer hover:bg-black/50 transition-colors ${editingId === c.id ? "bg-black" : ""}`}
                onClick={() => startEdit(c)}
              >
                <td className="px-2 py-1.5 font-medium text-white">{c.name}</td>
                <td className="px-2 py-1.5 text-right text-neutral-400">{c.length_m ? `${c.length_m}m` : "-"}</td>
                <td className="px-2 py-1.5 text-right text-neutral-400">{c.pit_time_s ?? "-"}</td>
                <td className="px-2 py-1.5 text-right font-mono text-neutral-400">{c.ws_port}</td>
                <td className="px-2 py-1.5 text-right font-mono text-accent">{c.ws_port_data ?? "-"}</td>
                <td className="px-2 py-1.5 text-right font-mono text-neutral-400">{c.php_api_port || "-"}</td>
                <td className="px-2 py-1.5 text-right text-neutral-400">{c.laps_discard}</td>
                <td className="px-2 py-1.5 text-right font-mono text-neutral-400">{c.lap_differential}</td>
                <td className="px-2 py-1.5 text-neutral-500 text-xs truncate max-w-[200px]">{c.php_api_url || "-"}</td>
                <td className="px-2 py-1.5 text-right">
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteCircuit(c.id); }}
                    className="text-red-400/60 hover:text-red-400 text-xs transition-colors"
                  >
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
            {circuits.length === 0 && (
              <tr><td colSpan={9} className="px-2 py-4 text-center text-neutral-700">No hay circuitos</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
