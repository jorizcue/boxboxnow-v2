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
  ws_port: number;
  pit_time_s: number | null;
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
            tab === "users" ? "bg-accent text-black" : "bg-surface text-neutral-500 hover:text-neutral-300"
          }`}
        >
          Usuarios
        </button>
        <button
          onClick={() => setTab("circuits")}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === "circuits" ? "bg-accent text-black" : "bg-surface text-neutral-500 hover:text-neutral-300"
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
        <h3 className="text-[11px] text-neutral-500 mb-3 uppercase tracking-wider">Usuarios</h3>

        <div className="flex gap-2 mb-4">
          <input placeholder="Usuario" value={newUsername} onChange={(e) => setNewUsername(e.target.value)}
            className="flex-1 bg-black border border-border rounded-lg px-2 py-1.5 text-sm" />
          <input placeholder="Password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
            className="flex-1 bg-black border border-border rounded-lg px-2 py-1.5 text-sm" />
          <input placeholder="Disp." type="number" min="1" max="10" value={newMaxDevices}
            onChange={(e) => setNewMaxDevices(Number(e.target.value))}
            className="w-16 bg-black border border-border rounded-lg px-2 py-1.5 text-sm" title="Max dispositivos" />
          <label className="flex items-center gap-1 text-xs text-neutral-500">
            <input type="checkbox" checked={newIsAdmin} onChange={(e) => setNewIsAdmin(e.target.checked)} className="accent-accent" />
            Admin
          </label>
          <button onClick={createUser} className="bg-accent text-black font-semibold px-3 py-1.5 rounded-lg text-sm">
            Crear
          </button>
        </div>

        <table className="w-full text-sm">
          <thead className="text-[11px] text-neutral-600 uppercase tracking-wider">
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
        <h3 className="text-[11px] text-neutral-500 mb-3 uppercase tracking-wider">
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
              <thead className="text-[11px] text-neutral-600 uppercase tracking-wider">
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
                    <td className="px-2 py-1.5 text-neutral-500">{new Date(a.valid_from).toLocaleDateString()}</td>
                    <td className="px-2 py-1.5 text-neutral-500">{new Date(a.valid_until).toLocaleDateString()}</td>
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

function CircuitsManager() {
  const [circuits, setCircuits] = useState<CircuitRow[]>([]);

  useEffect(() => {
    api.getAllCircuits().then(setCircuits).catch(() => {});
  }, []);

  return (
    <div className="bg-surface rounded-xl p-4 border border-border">
      <h3 className="text-[11px] text-neutral-500 mb-3 uppercase tracking-wider">Catalogo de Circuitos</h3>
      <table className="w-full text-sm">
        <thead className="text-[11px] text-neutral-600 uppercase tracking-wider">
          <tr>
            <th className="text-left px-2 py-1">ID</th>
            <th className="text-left px-2 py-1">Nombre</th>
            <th className="text-right px-2 py-1">Longitud</th>
            <th className="text-right px-2 py-1">WS Port</th>
            <th className="text-right px-2 py-1">Pit (s)</th>
          </tr>
        </thead>
        <tbody>
          {circuits.map((c) => (
            <tr key={c.id} className="border-t border-border">
              <td className="px-2 py-1.5 text-neutral-600">{c.id}</td>
              <td className="px-2 py-1.5 font-medium text-white">{c.name}</td>
              <td className="px-2 py-1.5 text-right text-neutral-400">{c.length_m ? `${c.length_m}m` : "-"}</td>
              <td className="px-2 py-1.5 text-right font-mono text-neutral-400">{c.ws_port}</td>
              <td className="px-2 py-1.5 text-right text-neutral-400">{c.pit_time_s || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
