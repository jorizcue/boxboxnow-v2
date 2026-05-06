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
  // Waitlist (public)
  joinWaitlist: (email: string, name?: string) =>
    fetchRaw<{ ok: boolean; already: boolean }>("/api/auth/waitlist", {
      method: "POST",
      body: JSON.stringify({ email, name: name || null }),
    }),

  // Site status (public — countdown / launch / maintenance toggles).
  // No auth required. Used by `useSiteStatus` to switch the homepage.
  getSiteStatus: () =>
    fetch(`${API_URL}/api/public/site-status`).then(async (r) => {
      if (!r.ok) throw new Error(`API error ${r.status}`);
      return r.json() as Promise<{
        launch_at: string | null;
        maintenance: boolean;
        now: string;
      }>;
    }),

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
  // No silent .catch — callers must handle failure so we never end up
  // believing the server-side session was killed when it wasn't.
  logout: () => fetchApi<any>("/api/auth/logout", { method: "POST" }),

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
  /** Update an existing circuit-access window. Both dates optional —
   *  send only what's changing. Backend already accepts partial PATCH. */
  updateAccess: (id: number, data: { valid_from?: string; valid_until?: string }) =>
    fetchApi<any>(`/api/admin/access/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
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

  // Driver view preferences (user-scoped, persisted in DB)
  getPreferences: () => fetchApi<{ visible_cards: Record<string, boolean>; card_order: string[] }>("/api/config/preferences"),
  updatePreferences: (data: { visible_cards?: Record<string, boolean>; card_order?: string[] }) =>
    fetchApi<any>("/api/config/preferences", { method: "PATCH", body: JSON.stringify(data) }),

  // Driver config presets
  getPresets: () => fetchApi<{ id: number; name: string; visible_cards: Record<string, boolean>; card_order: string[]; is_default: boolean }[]>("/api/config/presets"),
  createPreset: (data: { name: string; visible_cards: Record<string, boolean>; card_order: string[]; is_default?: boolean }) =>
    fetchApi<{ id: number; name: string; visible_cards: Record<string, boolean>; card_order: string[]; is_default: boolean }>("/api/config/presets", { method: "POST", body: JSON.stringify(data) }),
  updatePreset: (id: number, data: { name?: string; visible_cards?: Record<string, boolean>; card_order?: string[]; is_default?: boolean }) =>
    fetchApi<{ id: number; name: string; visible_cards: Record<string, boolean>; card_order: string[]; is_default: boolean }>(`/api/config/presets/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deletePreset: (id: number) =>
    fetchApi<void>(`/api/config/presets/${id}`, { method: "DELETE" }),

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
  /** Jump the replay to an absolute clock time. Accepts "HH:MM:SS",
   *  "HH:MM", or full ISO datetime. Resolves to the nearest preceding
   *  block server-side and seeks instantly. */
  seekReplayTime: (time: string) =>
    fetchApi<any>("/api/replay/seek_time", { method: "POST", body: JSON.stringify({ time }) }),
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
  getKartStats: (circuitId: number, dateFrom?: string, dateTo?: string, filterOutliers: boolean = true, raceLogIds?: number[]) => {
    const params = new URLSearchParams({ circuit_id: String(circuitId) });
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    params.set("filter_outliers", String(filterOutliers));
    if (raceLogIds && raceLogIds.length > 0) params.set("race_log_ids", raceLogIds.join(","));
    return fetchApi<any[]>(`/api/analytics/kart-stats?${params}`);
  },
  getKartBestLaps: (circuitId: number, kartNumber: number, dateFrom?: string, dateTo?: string, filterOutliers: boolean = true, raceLogIds?: number[]) => {
    const params = new URLSearchParams({ circuit_id: String(circuitId), kart_number: String(kartNumber) });
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    params.set("filter_outliers", String(filterOutliers));
    if (raceLogIds && raceLogIds.length > 0) params.set("race_log_ids", raceLogIds.join(","));
    return fetchApi<any[]>(`/api/analytics/kart-best-laps?${params}`);
  },
  getKartDrivers: (circuitId: number, kartNumber: number, dateFrom?: string, dateTo?: string, filterOutliers: boolean = true, raceLogIds?: number[]) => {
    const params = new URLSearchParams({ circuit_id: String(circuitId), kart_number: String(kartNumber) });
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    params.set("filter_outliers", String(filterOutliers));
    if (raceLogIds && raceLogIds.length > 0) params.set("race_log_ids", raceLogIds.join(","));
    return fetchApi<any[]>(`/api/analytics/kart-drivers?${params}`);
  },
  getRaceLogs: (circuitId: number, dateFrom?: string, dateTo?: string) => {
    const params = new URLSearchParams({ circuit_id: String(circuitId) });
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    return fetchApi<any[]>(`/api/analytics/race-logs?${params}`);
  },
  reprocessDay: (circuitId: number, date: string) =>
    fetchApi<{ status: string; message: string; sessions: number; laps: number; deleted: number }>(
      "/api/analytics/reprocess-day",
      { method: "POST", body: JSON.stringify({ circuit_id: circuitId, date }) },
    ),

  // Registration
  register: (email: string, username: string, password: string) =>
    fetchRaw<any>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, username, password }),
    }),

  // Stripe
  getCheckoutCircuits: () =>
    fetchApi<{ id: number; name: string }[]>("/api/stripe/circuits"),
  createCheckoutSession: (priceId: string, circuitId: number | null, plan?: string, eventDates?: string[]) =>
    fetchApi<{ client_secret: string; session_id: string }>("/api/stripe/create-checkout-session", {
      method: "POST",
      body: JSON.stringify({
        ...(priceId ? { price_id: priceId } : {}),
        ...(plan ? { plan } : {}),
        ...(circuitId ? { circuit_id: circuitId } : {}),
        ...(eventDates?.length ? { event_dates: eventDates } : {}),
      }),
    }),
  getSubscriptions: () => fetchApi<any[]>("/api/stripe/subscriptions"),
  cancelSubscription: (subId: number) =>
    fetchApi<{ ok: boolean }>(`/api/stripe/subscriptions/${subId}/cancel`, { method: "POST" }),
  reactivateSubscription: (subId: number) =>
    fetchApi<{ ok: boolean }>(`/api/stripe/subscriptions/${subId}/reactivate`, { method: "POST" }),
  switchPlan: (subId: number, plan: string) =>
    fetchApi<{ ok: boolean }>(`/api/stripe/subscriptions/${subId}/switch-plan`, {
      method: "POST",
      body: JSON.stringify({ plan }),
    }),
  getInvoices: () => fetchApi<any[]>("/api/stripe/invoices"),
  getCustomerPortal: () =>
    fetchApi<{ url: string }>("/api/stripe/customer-portal", { method: "POST" }),
  getPaymentMethods: () =>
    fetchApi<{ methods: any[]; default_method: string | null }>("/api/stripe/payment-methods"),
  createSetupIntent: () =>
    fetchApi<{ client_secret: string }>("/api/stripe/setup-intent", { method: "POST" }),
  setDefaultPaymentMethod: (pmId: string) =>
    fetchApi<{ ok: boolean }>(`/api/stripe/payment-methods/${pmId}/default`, { method: "POST" }),
  deletePaymentMethod: (pmId: string) =>
    fetchApi<{ ok: boolean }>(`/api/stripe/payment-methods/${pmId}`, { method: "DELETE" }),
  getBillingInfo: () =>
    fetchApi<{
      name: string;
      address: { line1: string; line2: string; city: string; postal_code: string; country: string };
      tax_ids: { id: string; type: string; value: string }[];
    }>("/api/stripe/billing-info"),
  updateBillingInfo: (data: {
    name?: string;
    address?: { line1: string; line2: string; city: string; postal_code: string; country: string };
    tax_id_type?: string;
    tax_id_value?: string;
  }) =>
    fetchApi<{ ok: boolean }>("/api/stripe/billing-info", {
      method: "PUT",
      body: JSON.stringify(data),
    }),

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
    fetchApi<any[]>("/api/admin/stripe-products"),

  // Public plans (no auth)
  getPlans: () =>
    fetchRaw<{
      plan_type: string;
      display_name: string;
      description: string | null;
      features: string[];
      price_amount: number | null;
      billing_interval: string | null;
      is_popular: boolean;
      sort_order: number;
      per_circuit: boolean;
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

  setPassword: (password: string) =>
    fetchApi<{ ok: boolean; message: string }>("/api/auth/set-password", {
      method: "POST",
      body: JSON.stringify({ password }),
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
  /** Replay-sync endpoint: GPS laps WITH traces, finished within [start, end]
   *  on a given circuit (optionally filtered by kart). The web replay calls
   *  this once when a session loads then animates the marker locally. */
  getGpsLapsWindow: (params: {
    circuit_id: number;
    kart_number?: number;
    start: string;  // ISO timestamp
    end: string;    // ISO timestamp
  }) => {
    const qs = new URLSearchParams();
    qs.set("circuit_id", String(params.circuit_id));
    if (params.kart_number != null) qs.set("kart_number", String(params.kart_number));
    qs.set("start", params.start);
    qs.set("end", params.end);
    return fetchApi(`/api/gps/laps/window?${qs}`);
  },

  // Support chatbot — RAG-based, answers from docs/chatbot/.
  // Streaming endpoint, see `streamChat` below for SSE consumption.
  chatHistory: (sessionId: string, limit = 100) =>
    fetchApi<{
      session_id: string;
      messages: { role: string; content: string; created_at: string }[];
    }>(`/api/chat/history?session_id=${encodeURIComponent(sessionId)}&limit=${limit}`),

  // Admin
  chatAdminStats: () =>
    fetchApi<{
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
    }>("/api/chat/admin/stats"),

  chatAdminReindex: () =>
    fetchApi<{ indexed_chunks: number; duration_s: number }>(
      "/api/chat/admin/reindex",
      { method: "POST" }
    ),
};

/**
 * Stream a chatbot answer over Server-Sent Events.
 *
 * Yields decoded events of three shapes:
 *   { type: "meta", session_id, remaining_today }
 *   { type: "token", content }
 *   { type: "error", message }
 *   { type: "done" }
 *
 * EventSource doesn't support custom Authorization headers, so we use
 * fetch + ReadableStream and parse SSE frames manually.
 */
export async function* streamChat(
  question: string,
  sessionId: string | null,
): AsyncGenerator<
  | { type: "meta"; session_id: string; remaining_today: number }
  | { type: "token"; content: string }
  | { type: "error"; message: string }
  | { type: "done" }
> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}/api/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify({ question, session_id: sessionId }),
  });

  if (res.status === 401) {
    clearAuth();
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }
  if (!res.body) {
    throw new Error("Streaming not supported by this response");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line. Split as we go.
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);

      // Each frame may have multiple lines; we only emit the `data:` payload.
      const dataLine = frame
        .split("\n")
        .find((l) => l.startsWith("data:"));
      if (!dataLine) continue;
      const json = dataLine.slice(5).trimStart();
      try {
        yield JSON.parse(json);
      } catch {
        // ignore malformed frames
      }
    }
  }
}
