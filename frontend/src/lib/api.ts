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

/** Fetch that does NOT auto-clear auth on 401 (for login flow). Returns raw Response for header inspection. */
async function fetchRawResponse(path: string, options?: RequestInit): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers as Record<string, string>) },
  });
}

/** Fetch that does NOT auto-clear auth on 401 (for login flow). */
async function fetchRaw<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetchRawResponse(path, options);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }
  return res.json();
}

export const api = {
  // Auth
  login: (username: string, password: string, mfaCode?: string) => {
    const body: any = { username, password };
    if (mfaCode) body.mfa_code = mfaCode;
    return fetchRawResponse("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    }).then(async (res) => {
      if (!res.ok) {
        const text = await res.text();
        const err: any = new Error(`API error ${res.status}: ${text}`);
        err.status = res.status;
        err.mfaRequired = res.headers.get("X-MFA-Required") === "true";
        throw err;
      }
      return res.json();
    });
  },
  getMe: () => fetchApi<any>("/api/auth/me"),
  logout: () => fetchApi<any>("/api/auth/logout", { method: "POST" }).catch(() => {}),

  // MFA
  mfaSetup: () => fetchApi<{ secret: string; qr_uri: string }>("/api/auth/mfa/setup", { method: "POST" }),
  mfaGetQr: () => fetchApi<{ qr_base64: string }>("/api/auth/mfa/qr"),
  mfaVerify: (code: string) => fetchApi<{ ok: boolean; message: string }>("/api/auth/mfa/verify", { method: "POST", body: JSON.stringify({ code }) }),
  mfaDisable: (code: string) => fetchApi<{ ok: boolean; message: string }>("/api/auth/mfa/disable", { method: "POST", body: JSON.stringify({ code }) }),
  adminResetMfa: (userId: number) => fetchApi<{ ok: boolean }>(`/api/admin/users/${userId}/mfa/reset`, { method: "POST" }),

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

  // Admin: CircuitHub management
  getAdminHubStatus: () => fetchApi<{ circuits: any[] }>("/api/admin/hub/status"),
  hubStartCircuit: (circuitId: number) =>
    fetchApi<any>(`/api/admin/hub/${circuitId}/start`, { method: "POST" }),
  hubStopCircuit: (circuitId: number) =>
    fetchApi<any>(`/api/admin/hub/${circuitId}/stop`, { method: "POST" }),

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
  getRecordings: () => fetchApi<{ circuits: Array<{ circuit_dir: string; circuit_name: string; circuit_id: number | null; dates: string[] }> }>("/api/replay/recordings"),
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
  restartReplay: (block: number = 0) =>
    fetchApi<any>("/api/replay/seek", { method: "POST", body: JSON.stringify({ block }) }),
  downloadSession: async (filename: string, startBlock: number, endBlock: number, circuitDir?: string | null, sessionTitle?: string) => {
    const params = new URLSearchParams({
      filename,
      start_block: String(startBlock),
      end_block: String(endBlock),
    });
    if (circuitDir) params.set("circuit_dir", circuitDir);
    const token = getToken();
    const resp = await fetch(`${API_URL}/api/replay/download-session?${params}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!resp.ok) throw new Error(`Download failed: ${resp.status}`);
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeName = (sessionTitle || filename.replace(/\.log(\.gz)?$/, ""))
      .replace(/[^a-zA-Z0-9_\-. ]/g, "_").replace(/\s+/g, "_");
    a.href = url;
    a.download = `${safeName}.log`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  // Admin: Settings
  getSetting: (key: string) => fetchApi<{ key: string; value: string }>(`/api/admin/settings/${key}`),
  updateSetting: (key: string, value: string) =>
    fetchApi<{ key: string; value: string }>(`/api/admin/settings/${key}`, {
      method: "PATCH",
      body: JSON.stringify({ value }),
    }),

  // Admin: User tab access
  updateUserTabs: (userId: number, tabs: string[]) =>
    fetchApi<{ tabs: string[] }>(`/api/admin/users/${userId}/tabs`, {
      method: "PUT",
      body: JSON.stringify({ tabs }),
    }),

  // Admin: user device sessions
  getAdminUserSessions: (userId: number) =>
    fetchApi<any[]>(`/api/admin/users/${userId}/sessions`),
  adminKillSession: (userId: number, sessionId: number) =>
    fetchApi<any>(`/api/admin/users/${userId}/sessions/${sessionId}`, { method: "DELETE" }),
  adminKillAllSessions: (userId: number) =>
    fetchApi<any>(`/api/admin/users/${userId}/sessions`, { method: "DELETE" }),

  // Analytics
  getAnalyticsCircuits: () => fetchApi<any[]>("/api/analytics/circuits"),
  getKartStats: (circuitId: number, dateFrom?: string, dateTo?: string, filterOutliers: boolean = true) => {
    const params = new URLSearchParams({ circuit_id: String(circuitId) });
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    params.set("filter_outliers", String(filterOutliers));
    return fetchApi<any[]>(`/api/analytics/kart-stats?${params}`);
  },
  getKartBestLaps: (circuitId: number, kartNumber: number, dateFrom?: string, dateTo?: string, filterOutliers: boolean = true) => {
    const params = new URLSearchParams({ circuit_id: String(circuitId), kart_number: String(kartNumber) });
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    params.set("filter_outliers", String(filterOutliers));
    return fetchApi<any[]>(`/api/analytics/kart-best-laps?${params}`);
  },
  getRaceLogs: (circuitId: number, dateFrom?: string, dateTo?: string) => {
    const params = new URLSearchParams({ circuit_id: String(circuitId) });
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    return fetchApi<any[]>(`/api/analytics/race-logs?${params}`);
  },

  // Registration
  register: (email: string, username: string, password: string) =>
    fetchRaw<any>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, username, password }),
    }),

  // Stripe
  getCheckoutCircuits: () =>
    fetchApi<{ id: number; name: string }[]>("/api/stripe/circuits"),
  createCheckoutSession: (priceId: string, circuitId: number, plan?: string) =>
    fetchApi<{ checkout_url: string; session_id: string }>("/api/stripe/create-checkout-session", {
      method: "POST",
      body: JSON.stringify({
        ...(priceId ? { price_id: priceId } : {}),
        ...(plan ? { plan } : {}),
        circuit_id: circuitId,
      }),
    }),
  getSubscriptions: () => fetchApi<any[]>("/api/stripe/subscriptions"),
  getCustomerPortal: () =>
    fetchApi<{ url: string }>("/api/stripe/customer-portal", { method: "POST" }),

  // Platform settings (admin)
  getPlatformSettings: () =>
    fetchApi<Record<string, string>>("/api/admin/platform-settings"),
  updatePlatformSettings: (data: Record<string, string>) =>
    fetchApi<Record<string, string>>("/api/admin/platform-settings", {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  // Product tab config (admin)
  getProductConfigs: () =>
    fetchApi<any[]>("/api/admin/product-config"),
  createProductConfig: (data: any) =>
    fetchApi<any>("/api/admin/product-config", { method: "POST", body: JSON.stringify(data) }),
  updateProductConfig: (id: number, data: any) =>
    fetchApi<any>(`/api/admin/product-config/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteProductConfig: (id: number) =>
    fetchApi<any>(`/api/admin/product-config/${id}`, { method: "DELETE" }),
  getStripeProducts: () =>
    fetchApi<{ id: string; name: string; description: string | null }[]>("/api/admin/stripe-products"),

  // Public plans (no auth)
  getPlans: () =>
    fetchRaw<{
      plan_type: string;
      display_name: string;
      description: string | null;
      features: string[];
      price_monthly: number | null;
      price_annual: number | null;
      is_popular: boolean;
      sort_order: number;
    }[]>("/api/plans"),

  // Trial config (public)
  getTrialConfig: () =>
    fetchRaw<{ trial_enabled: boolean; trial_days: number; trial_banner_days: number }>("/api/auth/trial-config"),

  // Password reset
  forgotPassword: (email: string) =>
    fetchRaw<{ ok: boolean; message: string }>("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  resetPassword: (token: string, password: string) =>
    fetchRaw<{ ok: boolean; message: string }>("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, password }),
    }),

  // GPS Telemetry
  saveGpsLaps: (laps: any[]) =>
    fetchApi("/api/gps/laps", { method: "POST", body: JSON.stringify({ laps }) }),
  getGpsLaps: (params?: { circuit_id?: number; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.circuit_id) qs.set("circuit_id", String(params.circuit_id));
    if (params?.limit) qs.set("limit", String(params.limit));
    return fetchApi(`/api/gps/laps?${qs}`);
  },
  getGpsLapDetail: (lapId: number) => fetchApi(`/api/gps/laps/${lapId}`),
  deleteGpsLap: (lapId: number) =>
    fetchApi(`/api/gps/laps/${lapId}`, { method: "DELETE" }),
  getGpsStats: (circuitId?: number) => {
    const qs = circuitId ? `?circuit_id=${circuitId}` : "";
    return fetchApi(`/api/gps/stats${qs}`);
  },
};
