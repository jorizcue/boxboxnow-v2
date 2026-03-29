const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function getToken(): string | null {
  try {
    const stored = localStorage.getItem("boxboxnow-auth");
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed?.state?.token || null;
    }
  } catch {}
  return null;
}

function clearAuth() {
  // Clear persisted zustand state without reloading
  try {
    localStorage.removeItem("boxboxnow-auth");
    // Force zustand to pick up the change
    const { useAuth } = require("@/hooks/useAuth");
    useAuth.getState().logout();
  } catch {}
}

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string>),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (res.status === 401) {
    clearAuth();
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }
  return res.json();
}

/** Fetch that does NOT auto-clear auth on 401 (for login flow). */
async function fetchRaw<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers as Record<string, string>) },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }
  return res.json();
}

export const api = {
  // Auth
  login: (username: string, password: string) =>
    fetchRaw<any>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  getMe: () => fetchApi<any>("/api/auth/me"),
  logout: () => fetchApi<any>("/api/auth/logout", { method: "POST" }).catch(() => {}),

  // Device sessions
  getMySessions: () => fetchApi<any[]>("/api/auth/sessions"),
  killSession: (sessionId: number) =>
    fetchApi<any>(`/api/auth/sessions/${sessionId}`, { method: "DELETE" }),
  killAllOtherSessions: () =>
    fetchApi<any>("/api/auth/sessions", { method: "DELETE" }),
  killSessionUnauthenticated: (username: string, password: string, sessionId: number) =>
    fetchRaw<any>(`/api/auth/kill-session?session_id=${sessionId}`, {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),

  // Admin
  getUsers: () => fetchApi<any[]>("/api/admin/users"),
  createUser: (data: any) =>
    fetchApi<any>("/api/admin/users", { method: "POST", body: JSON.stringify(data) }),
  updateUser: (id: number, data: any) =>
    fetchApi<any>(`/api/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteUser: (id: number) =>
    fetchApi<any>(`/api/admin/users/${id}`, { method: "DELETE" }),

  getAllCircuits: () => fetchApi<any[]>("/api/admin/circuits"),
  createCircuit: (data: any) =>
    fetchApi<any>("/api/admin/circuits", { method: "POST", body: JSON.stringify(data) }),
  updateCircuit: (id: number, data: any) =>
    fetchApi<any>(`/api/admin/circuits/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteCircuit: (id: number) =>
    fetchApi<any>(`/api/admin/circuits/${id}`, { method: "DELETE" }),

  getUserAccess: (userId: number) => fetchApi<any[]>(`/api/admin/access/user/${userId}`),
  grantAccess: (data: any) =>
    fetchApi<any>("/api/admin/access", { method: "POST", body: JSON.stringify(data) }),
  revokeAccess: (id: number) =>
    fetchApi<any>(`/api/admin/access/${id}`, { method: "DELETE" }),

  // Config (user-scoped)
  getMyCircuits: () => fetchApi<any[]>("/api/config/circuits"),
  getActiveSession: () => fetchApi<any>("/api/config/session"),
  createSession: (data: any) =>
    fetchApi<any>("/api/config/session", { method: "POST", body: JSON.stringify(data) }),
  updateSession: (data: any) =>
    fetchApi<any>("/api/config/session", { method: "PATCH", body: JSON.stringify(data) }),
  getTeams: () => fetchApi<any[]>("/api/config/teams"),
  replaceTeams: (teams: any[]) =>
    fetchApi<any[]>("/api/config/teams", { method: "PUT", body: JSON.stringify(teams) }),

  getLiveTimingUrl: () => fetchApi<{ url: string | null }>("/api/config/live-timing-url"),

  // Race
  getSnapshot: () => fetchApi<any>("/api/race/snapshot"),
  getConnectionStatus: () => fetchApi<{
    monitoring: boolean;
    circuit_id: number | null;
    circuit_connected: boolean;
    circuit_messages: number;
    circuit_name: string | null;
    apex_connected: boolean;
    circuit: string | null;
  }>("/api/race/status"),
  getHubStatus: () => fetchApi<{ circuits: any[] }>("/api/race/hub-status"),
  disconnectMonitoring: () => fetchApi<any>("/api/race/disconnect", { method: "POST" }),
  getLiveTeams: () => fetchApi<any>("/api/race/live-teams"),

  // Replay
  getReplayLogs: () => fetchApi<{ logs: Array<{ filename: string; owner_id?: number | null; owner?: string; circuit_dir?: string }> }>("/api/replay/logs"),
  getReplayStatus: () => fetchApi<any>("/api/replay/status"),
  analyzeLog: (filename: string, ownerId?: number | null, circuitDir?: string | null) => {
    const params = new URLSearchParams();
    if (ownerId != null) params.set("owner_id", String(ownerId));
    if (circuitDir) params.set("circuit_dir", circuitDir);
    const qs = params.toString();
    return fetchApi<{ totalBlocks: number; raceStarts: { block: number; progress: number; timestamp: string; title: string }[]; startTime: string | null; endTime: string | null }>(
      `/api/replay/analyze/${encodeURIComponent(filename)}${qs ? `?${qs}` : ""}`
    );
  },
  startReplay: (filename: string, speed: number = 1, startBlock: number = 0, ownerId?: number | null, circuitDir?: string | null) =>
    fetchApi<any>("/api/replay/start", {
      method: "POST",
      body: JSON.stringify({
        filename,
        speed,
        start_block: startBlock,
        ...(ownerId != null ? { owner_id: ownerId } : {}),
        ...(circuitDir ? { circuit_dir: circuitDir } : {}),
      }),
    }),
  stopReplay: () => fetchApi<any>("/api/replay/stop", { method: "POST" }),
  pauseReplay: () => fetchApi<any>("/api/replay/pause", { method: "POST" }),
  seekReplay: (block: number) =>
    fetchApi<any>("/api/replay/seek", { method: "POST", body: JSON.stringify({ block }) }),
  setReplaySpeed: (speed: number) =>
    fetchApi<any>("/api/replay/speed", { method: "POST", body: JSON.stringify({ speed }) }),
};
