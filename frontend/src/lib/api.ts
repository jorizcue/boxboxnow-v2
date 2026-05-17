const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Tracking module: backend wire format is snake_case to match the rest
// of the Stripe/auth payloads. This translator returns the camelCase
// `TrackConfig` shape expected by the frontend without dragging a
// dependency like camelcase-keys.
import type { TrackConfig } from "@/types/race";

function _snakeToTrackConfig(raw: any): TrackConfig {
  return {
    trackPolyline: raw?.track_polyline ?? null,
    trackLengthM: raw?.track_length_m ?? null,
    s1DistanceM: raw?.s1_distance_m ?? null,
    s2DistanceM: raw?.s2_distance_m ?? null,
    s3DistanceM: raw?.s3_distance_m ?? null,
    pitEntryDistanceM: raw?.pit_entry_distance_m ?? null,
    pitExitDistanceM: raw?.pit_exit_distance_m ?? null,
    pitEntryLat: raw?.pit_entry_lat ?? null,
    pitEntryLon: raw?.pit_entry_lon ?? null,
    pitExitLat: raw?.pit_exit_lat ?? null,
    pitExitLon: raw?.pit_exit_lon ?? null,
    pitLanePolyline: raw?.pit_lane_polyline ?? null,
    pitLaneLengthM: raw?.pit_lane_length_m ?? null,
    pitBoxDistanceM: raw?.pit_box_distance_m ?? null,
    metaDistanceM: typeof raw?.meta_distance_m === "number" ? raw.meta_distance_m : 0,
    defaultDirection: (raw?.default_direction === "reversed" ? "reversed" : "forward"),
    svgViewbox: typeof raw?.svg_viewbox === "string" && raw.svg_viewbox.trim() ? raw.svg_viewbox : null,
    svgPaths: raw?.svg_paths && typeof raw.svg_paths === "object" ? raw.svg_paths : null,
    svgImageUrl: typeof raw?.svg_image_url === "string" && raw.svg_image_url.trim() ? raw.svg_image_url : null,
  };
}

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
    throw new Error(await extractErrorMessage(res));
  }
  return res.json();
}

/**
 * Pull a human-readable message out of an error response.
 * FastAPI returns `{ "detail": "..." }` (or `[{loc, msg, type}, ...]` for
 * validation errors). We surface just `detail` when present so the UI
 * shows the Spanish message backend authors wrote, instead of the raw
 * JSON wrapper or the unhelpful "Internal Server Error" status text.
 */
async function extractErrorMessage(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed?.detail === "string") return parsed.detail;
    if (Array.isArray(parsed?.detail) && parsed.detail[0]?.msg) {
      return parsed.detail.map((d: { msg: string }) => d.msg).join("; ");
    }
  } catch {
    // Not JSON — fall through.
  }
  return text ? `Error ${res.status}: ${text}` : `Error ${res.status}`;
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
    throw new Error(await extractErrorMessage(res));
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

  // Tracking module — circuit polyline + sectors + pit lane.
  // Backend wire format uses snake_case; the helpers below translate
  // to camelCase TrackConfig for the frontend.
  getTrackConfig: async (circuitId: number) => {
    const raw = await fetchApi<any>(`/api/tracking/circuits/${circuitId}/track-config`);
    return _snakeToTrackConfig(raw);
  },
  adminGetTrackConfig: async (circuitId: number) => {
    const raw = await fetchApi<any>(`/api/admin/circuits/${circuitId}/track-config`);
    return _snakeToTrackConfig(raw);
  },
  adminSaveTrackConfig: async (circuitId: number, payload: Partial<{
    trackPolyline: [number, number][] | null;
    s1DistanceM: number | null;
    s2DistanceM: number | null;
    s3DistanceM: number | null;
    pitEntryDistanceM: number | null;
    pitExitDistanceM: number | null;
    pitEntryLat: number | null;
    pitEntryLon: number | null;
    pitExitLat: number | null;
    pitExitLon: number | null;
    pitLanePolyline: [number, number][] | null;
    pitBoxDistanceM: number | null;
    metaDistanceM: number | null;
    defaultDirection: "forward" | "reversed";
    svgViewbox: string | null;
    svgPaths: Partial<Record<"track" | "s1" | "s2" | "s3" | "in" | "out", string>> | null;
    svgImageUrl: string | null;
  }>) => {
    const body: Record<string, unknown> = {};
    if ("trackPolyline" in payload) body.track_polyline = payload.trackPolyline;
    if ("s1DistanceM" in payload) body.s1_distance_m = payload.s1DistanceM;
    if ("s2DistanceM" in payload) body.s2_distance_m = payload.s2DistanceM;
    if ("s3DistanceM" in payload) body.s3_distance_m = payload.s3DistanceM;
    if ("pitEntryDistanceM" in payload) body.pit_entry_distance_m = payload.pitEntryDistanceM;
    if ("pitExitDistanceM" in payload) body.pit_exit_distance_m = payload.pitExitDistanceM;
    if ("pitEntryLat" in payload) body.pit_entry_lat = payload.pitEntryLat;
    if ("pitEntryLon" in payload) body.pit_entry_lon = payload.pitEntryLon;
    if ("pitExitLat" in payload) body.pit_exit_lat = payload.pitExitLat;
    if ("pitExitLon" in payload) body.pit_exit_lon = payload.pitExitLon;
    if ("pitLanePolyline" in payload) body.pit_lane_polyline = payload.pitLanePolyline;
    if ("pitBoxDistanceM" in payload) body.pit_box_distance_m = payload.pitBoxDistanceM;
    if ("metaDistanceM" in payload) body.meta_distance_m = payload.metaDistanceM;
    if ("defaultDirection" in payload) body.default_direction = payload.defaultDirection;
    if ("svgViewbox" in payload) body.svg_viewbox = payload.svgViewbox;
    if ("svgPaths" in payload) body.svg_paths = payload.svgPaths;
    if ("svgImageUrl" in payload) body.svg_image_url = payload.svgImageUrl;
    const raw = await fetchApi<any>(`/api/admin/circuits/${circuitId}/track-config`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
    return _snakeToTrackConfig(raw);
  },
  adminImportOsm: (circuitId: number) =>
    fetchApi<{ polyline: [number, number][] | null; reason?: string }>(
      `/api/admin/circuits/${circuitId}/import-osm`,
      { method: "POST" },
    ),

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
    fetchApi<{ id: number; name: string; is_beta: boolean }[]>("/api/stripe/circuits"),
  // `circuits` accepts:
  //   * null  → cross-circuit plan, no selection (backend grants all)
  //   * []    → same as null (cross-circuit)
  //   * [id]  → legacy single-circuit purchase (also sends `circuit_id`
  //             for backward compat with older backends)
  //   * [a,b] → multi-circuit purchase, backend grants N
  //             UserCircuitAccess rows in one Stripe payment
  createCheckoutSession: (
    priceId: string,
    circuits: number | number[] | null,
    plan?: string,
    eventDates?: string[],
  ) => {
    const circuitIds: number[] = Array.isArray(circuits)
      ? circuits.filter((c) => typeof c === "number" && c > 0)
      : typeof circuits === "number" && circuits > 0
        ? [circuits]
        : [];
    const primary = circuitIds[0] ?? null;
    return fetchApi<{ client_secret: string; session_id: string }>("/api/stripe/create-checkout-session", {
      method: "POST",
      body: JSON.stringify({
        ...(priceId ? { price_id: priceId } : {}),
        ...(plan ? { plan } : {}),
        ...(primary ? { circuit_id: primary } : {}),
        ...(circuitIds.length ? { circuit_ids: circuitIds } : {}),
        ...(eventDates?.length ? { event_dates: eventDates } : {}),
      }),
    });
  },
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
  getPlans: (lang?: string) =>
    fetchRaw<{
      plan_type: string;
      display_name: string;
      description: string | null;
      features: string[];
      price_amount: number | null;
      billing_interval: string | null;
      is_popular: boolean;
      coming_soon: boolean;
      sort_order: number;
      per_circuit: boolean;
      circuits_to_select: number;
    }[]>(`/api/plans${lang ? "?lang=" + encodeURIComponent(lang) : ""}`),

  // Trial config (public)
  getTrialConfig: () =>
    fetchRaw<{ trial_enabled: boolean; trial_days: number; trial_banner_days: number }>("/api/auth/trial-config"),

  // Usage analytics — admin
  // Returned shape matches the FastAPI endpoints in usage_routes.py.
  usageOverview: () =>
    fetchApi<{
      dau: number;
      wau: number;
      mau: number;
      total_users: number;
      active_now: number;
      platforms: Record<string, number>;
    }>("/api/usage/stats/overview"),
  usageActiveUsers: (days = 30) =>
    fetchApi<{ series: { day: string; active: number }[]; days: number }>(
      `/api/usage/stats/active-users?days=${days}`,
    ),
  usageTopEvents: (params: { days?: number; event_type?: string; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.days) qs.set("days", String(params.days));
    if (params.event_type) qs.set("event_type", params.event_type);
    if (params.limit) qs.set("limit", String(params.limit));
    return fetchApi<{ top: { event_key: string; count: number; users: number }[]; days: number }>(
      `/api/usage/stats/top-events${qs.toString() ? `?${qs}` : ""}`,
    );
  },
  usageFunnel: (params: { days?: number; utm_source?: string; utm_campaign?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.days) qs.set("days", String(params.days));
    if (params.utm_source) qs.set("utm_source", params.utm_source);
    if (params.utm_campaign) qs.set("utm_campaign", params.utm_campaign);
    return fetchApi<{
      stages: {
        event_key: string;
        label: string;
        count: number;
        pct_overall: number | null;
        pct_step: number | null;
      }[];
      days: number;
    }>(`/api/usage/stats/funnel${qs.toString() ? `?${qs}` : ""}`);
  },
  usageHeatmap: (days = 30) =>
    fetchApi<{
      cells: { day_of_week: number; hour: number; count: number }[];
      max_count: number;
      days: number;
    }>(`/api/usage/stats/heatmap?days=${days}`),
  usageAttribution: (days = 30) =>
    fetchApi<{
      days: number;
      by_source: { key: string; visitors: number; registrations: number; payments: number }[];
      by_campaign: { key: string; visitors: number; registrations: number; payments: number }[];
      by_referrer: { key: string; visitors: number; registrations: number; payments: number }[];
    }>(`/api/usage/stats/attribution?days=${days}`),

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

  // Email verification (gates trial start + purchase). Mirrors the
  // password-reset helpers: unauthenticated, raw fetch, backend surfaces
  // its Spanish `detail` on non-2xx (e.g. "Enlace inválido o expirado").
  verifyEmail: (token: string) =>
    fetchRaw<{ ok: boolean; alreadyVerified?: boolean }>("/api/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),
  // Always 200 {ok:true} (anti-enumeration) regardless of whether the
  // email exists / is already verified.
  resendVerification: (email: string) =>
    fetchRaw<{ ok: boolean }>("/api/auth/resend-verification", {
      method: "POST",
      body: JSON.stringify({ email }),
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

  // ── Driver ranking (Glicko-2) ──────────────────────────────────────
  rankingLookup: (names: string[]) =>
    fetchApi<{ results: RankingLookupRow[] }>(
      "/api/ranking/lookup",
      { method: "POST", body: JSON.stringify({ names }) },
    ),
  rankingAdminTop: (limit: number | null = 100, minSessions = 2, circuit: string | null = null) => {
    const qs = new URLSearchParams({ min_sessions: String(minSessions) });
    // limit omitted ⇒ backend returns ALL ranked drivers ("Todos").
    if (limit != null) qs.set("limit", String(limit));
    if (circuit) qs.set("circuit", circuit);
    return fetchApi<{ drivers: RankingTopRow[]; circuit: string | null }>(
      `/api/admin/ranking/top?${qs.toString()}`,
    );
  },
  rankingAdminCircuits: () =>
    fetchApi<{ circuits: RankingCircuitRow[] }>("/api/admin/ranking/circuits"),
  rankingAdminDriverDetail: (driverId: number) =>
    fetchApi<RankingDriverDetail>(`/api/admin/ranking/driver/${driverId}`),
  rankingAdminSearch: (q: string) =>
    fetchApi<{ drivers: RankingSearchRow[] }>(
      `/api/admin/ranking/search?q=${encodeURIComponent(q)}`,
    ),
  rankingAdminMerge: (intoDriverId: number, fromDriverId: number) =>
    fetchApi<{ ok: boolean; into?: number; from?: number; reason?: string }>(
      "/api/admin/ranking/merge",
      { method: "POST", body: JSON.stringify({ into_driver_id: intoDriverId, from_driver_id: fromDriverId }) },
    ),
  rankingAdminReprocess: () =>
    fetchApi<{ processed: number; skipped: number; total_candidates: number }>(
      "/api/admin/ranking/reprocess",
      { method: "POST" },
    ),
  rankingAdminReset: (wipeDrivers = false, reprocess = true) =>
    fetchApi<{ deleted: Record<string, number>; reprocess?: { processed: number; skipped: number; total_candidates: number } }>(
      "/api/admin/ranking/reset",
      { method: "POST", body: JSON.stringify({ wipe_drivers: wipeDrivers, reprocess }) },
    ),

  // Session-type overrides
  rankingAdminSessions: () =>
    fetchApi<RankingSessionRow[]>("/api/admin/ranking/sessions"),
  rankingAdminSetSessionType: (
    circuit_name: string,
    log_date: string,
    session_seq: number,
    forced_type: "race" | "pace",
  ) =>
    fetchApi<{ ok: boolean }>(
      "/api/admin/ranking/session-type",
      { method: "POST", body: JSON.stringify({ circuit_name, log_date, session_seq, forced_type }) },
    ),
  rankingAdminClearSessionType: (
    circuit_name: string,
    log_date: string,
    session_seq: number,
  ) => {
    const qs = new URLSearchParams({
      circuit_name,
      log_date,
      session_seq: String(session_seq),
    });
    return fetchApi<{ ok: boolean }>(
      `/api/admin/ranking/session-type?${qs.toString()}`,
      { method: "DELETE" },
    );
  },
};

// ── Ranking response types ───────────────────────────────────────────
export interface RankingLookupRow {
  name: string;                  // raw input name
  matched: boolean;
  driver_id: number | null;
  canonical_name: string | null;
  rating: number | null;         // null only when matched=false AND we don't auto-default
  rd: number | null;
  sessions: number;
}

export interface RankingTopRow {
  rank: number;
  driver_id: number;
  canonical_name: string;
  rating: number;
  rd: number;
  volatility: number;
  sessions_count: number;
  total_laps: number;
  last_session_at: string | null;
  circuit_name: string | null;
}

export interface RankingSearchRow {
  driver_id: number;
  canonical_name: string;
  normalized_key: string;
  sessions_count: number;
  total_laps: number;
  rating: number;
  rd: number;
}

export interface RankingCircuitRow {
  circuit_name: string;
  drivers_count: number;
  last_session_at: string | null;
}

export interface RankingDriverDetail {
  driver_id: number;
  canonical_name: string;
  normalized_key: string;
  sessions_count: number;
  total_laps: number;
  global_rating: {
    rating: number;
    rd: number;
    volatility: number;
    sessions_count: number;
    last_session_at: string | null;
  };
  circuit_ratings: Array<{
    circuit_name: string;
    rating: number;
    rd: number;
    sessions_count: number;
    last_session_at: string | null;
  }>;
  aliases: string[];
  history: Array<{
    circuit_name: string;
    log_date: string;
    title1: string;
    title2: string;
    rating_before: number;
    rating_after: number;
    rd_after: number;
    delta: number;
  }>;
  recent_sessions: Array<{
    circuit_name: string;
    log_date: string;
    title1: string;
    title2: string;
    kart_number: number | null;
    team_name: string;
    total_laps: number;
    best_lap_ms: number;
    avg_lap_ms: number;
    final_position: number | null;
    // ELO points won/lost that session (null when the session wasn't
    // rateable). field_size = total drivers in that session.
    elo_delta: number | null;
    field_size: number | null;
  }>;
}

export interface RankingSessionRow {
  circuit_name: string;
  log_date: string;
  session_seq: number;
  title1: string;
  title2: string;
  session_type: string;
  team_mode: boolean;
  driver_count: number;
  forced_type: "race" | "pace" | null;
}

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
