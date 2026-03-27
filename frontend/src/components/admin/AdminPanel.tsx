"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";

interface UserRow {
  id: number;
  username: string;
  is_admin: boolean;
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
      <div className="flex gap-2">
        <button
          onClick={() => setTab("users")}
          className={`px-4 py-2 rounded text-sm font-medium ${
            tab === "users" ? "bg-accent text-white" : "bg-surface text-gray-400"
          }`}
        >
          Usuarios
        </button>
        <button
          onClick={() => setTab("circuits")}
          className={`px-4 py-2 rounded text-sm font-medium ${
            tab === "circuits" ? "bg-accent text-white" : "bg-surface text-gray-400"
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
    try {
      const data = await api.getUsers();
      setUsers(data);
    } catch {}
  };

  const createUser = async () => {
    if (!newUsername || !newPassword) return;
    try {
      await api.createUser({ username: newUsername, password: newPassword, is_admin: newIsAdmin });
      setNewUsername("");
      setNewPassword("");
      setNewIsAdmin(false);
      loadUsers();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const deleteUser = async (id: number) => {
    if (!confirm("Eliminar usuario?")) return;
    try {
      await api.deleteUser(id);
      loadUsers();
      if (selectedUser === id) setSelectedUser(null);
    } catch (e: any) {
      alert(e.message);
    }
  };

  const loadAccess = async (userId: number) => {
    setSelectedUser(userId);
    try {
      const data = await api.getUserAccess(userId);
      setAccess(data);
    } catch {}
  };

  const grantAccess = async () => {
    if (!selectedUser || !newCircuitId || !newValidFrom || !newValidUntil) return;
    try {
      await api.grantAccess({
        user_id: selectedUser,
        circuit_id: newCircuitId,
        valid_from: new Date(newValidFrom).toISOString(),
        valid_until: new Date(newValidUntil).toISOString(),
      });
      loadAccess(selectedUser);
      setNewCircuitId(0);
    } catch (e: any) {
      alert(e.message);
    }
  };

  const revokeAccess = async (accessId: number) => {
    try {
      await api.revokeAccess(accessId);
      if (selectedUser) loadAccess(selectedUser);
    } catch {}
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Users list */}
      <div className="bg-card rounded-lg p-4">
        <h3 className="text-sm text-gray-400 mb-3">USUARIOS</h3>

        {/* Create form */}
        <div className="flex gap-2 mb-4">
          <input
            placeholder="Usuario"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            className="flex-1 bg-surface border border-gray-700 rounded px-2 py-1.5 text-sm"
          />
          <input
            placeholder="Password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="flex-1 bg-surface border border-gray-700 rounded px-2 py-1.5 text-sm"
          />
          <label className="flex items-center gap-1 text-xs text-gray-400">
            <input type="checkbox" checked={newIsAdmin} onChange={(e) => setNewIsAdmin(e.target.checked)} />
            Admin
          </label>
          <button onClick={createUser} className="bg-accent text-white px-3 py-1.5 rounded text-sm">
            Crear
          </button>
        </div>

        <table className="w-full text-sm">
          <thead className="text-gray-500">
            <tr>
              <th className="text-left px-2 py-1">Usuario</th>
              <th className="text-center px-2 py-1">Admin</th>
              <th className="text-right px-2 py-1">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr
                key={u.id}
                className={`border-t border-gray-800/50 cursor-pointer hover:bg-surface/50 ${
                  selectedUser === u.id ? "bg-surface" : ""
                }`}
                onClick={() => loadAccess(u.id)}
              >
                <td className="px-2 py-1.5">{u.username}</td>
                <td className="px-2 py-1.5 text-center">
                  {u.is_admin ? <span className="text-accent">Si</span> : "-"}
                </td>
                <td className="px-2 py-1.5 text-right">
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteUser(u.id); }}
                    className="text-red-500 hover:text-red-400 text-xs"
                  >
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Circuit access for selected user */}
      <div className="bg-card rounded-lg p-4">
        <h3 className="text-sm text-gray-400 mb-3">
          ACCESO A CIRCUITOS
          {selectedUser && ` - ${users.find((u) => u.id === selectedUser)?.username}`}
        </h3>

        {selectedUser ? (
          <>
            {/* Grant access form */}
            <div className="flex gap-2 mb-4 flex-wrap">
              <select
                value={newCircuitId}
                onChange={(e) => setNewCircuitId(Number(e.target.value))}
                className="bg-surface border border-gray-700 rounded px-2 py-1.5 text-sm"
              >
                <option value={0}>Circuito...</option>
                {circuits.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <input
                type="date"
                value={newValidFrom}
                onChange={(e) => setNewValidFrom(e.target.value)}
                className="bg-surface border border-gray-700 rounded px-2 py-1.5 text-sm"
              />
              <input
                type="date"
                value={newValidUntil}
                onChange={(e) => setNewValidUntil(e.target.value)}
                className="bg-surface border border-gray-700 rounded px-2 py-1.5 text-sm"
              />
              <button onClick={grantAccess} className="bg-accent text-white px-3 py-1.5 rounded text-sm">
                Dar acceso
              </button>
            </div>

            <table className="w-full text-sm">
              <thead className="text-gray-500">
                <tr>
                  <th className="text-left px-2 py-1">Circuito</th>
                  <th className="text-left px-2 py-1">Desde</th>
                  <th className="text-left px-2 py-1">Hasta</th>
                  <th className="text-right px-2 py-1"></th>
                </tr>
              </thead>
              <tbody>
                {access.map((a) => (
                  <tr key={a.id} className="border-t border-gray-800/50">
                    <td className="px-2 py-1.5">{a.circuit_name}</td>
                    <td className="px-2 py-1.5 text-gray-400">{new Date(a.valid_from).toLocaleDateString()}</td>
                    <td className="px-2 py-1.5 text-gray-400">{new Date(a.valid_until).toLocaleDateString()}</td>
                    <td className="px-2 py-1.5 text-right">
                      <button
                        onClick={() => revokeAccess(a.id)}
                        className="text-red-500 hover:text-red-400 text-xs"
                      >
                        Revocar
                      </button>
                    </td>
                  </tr>
                ))}
                {access.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-2 py-4 text-center text-gray-600">
                      Sin acceso a circuitos
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </>
        ) : (
          <p className="text-gray-600 text-sm">Selecciona un usuario para gestionar su acceso</p>
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
    <div className="bg-card rounded-lg p-4">
      <h3 className="text-sm text-gray-400 mb-3">CATALOGO DE CIRCUITOS</h3>
      <table className="w-full text-sm">
        <thead className="text-gray-500">
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
            <tr key={c.id} className="border-t border-gray-800/50">
              <td className="px-2 py-1.5 text-gray-500">{c.id}</td>
              <td className="px-2 py-1.5 font-medium">{c.name}</td>
              <td className="px-2 py-1.5 text-right">{c.length_m ? `${c.length_m}m` : "-"}</td>
              <td className="px-2 py-1.5 text-right font-mono">{c.ws_port}</td>
              <td className="px-2 py-1.5 text-right">{c.pit_time_s || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
