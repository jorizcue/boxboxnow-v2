/**
 * Lightweight first-party usage event collector.
 *
 * Public API:
 *
 *   track(eventType, eventKey, props?)
 *   trackTab(tab)               // shortcut for tab_view events
 *   trackAction(key, props?)    // shortcut for "action" events
 *   trackFunnel(key, props?)    // shortcut for "funnel" events
 *   flushNow()                  // synchronous flush via sendBeacon
 *
 * Design:
 *
 *   * Events go into an in-memory queue and are POSTed in batches of
 *     up to MAX_BATCH every FLUSH_INTERVAL_MS. Flush also runs on
 *     `visibilitychange` (page hidden) and `pagehide` using
 *     `navigator.sendBeacon` so events don't drown when the user
 *     navigates away mid-batch.
 *
 *   * The hook layer (`useTracker` in hooks/useTracker.ts) does NOT
 *     own the queue — this module is module-level singleton state.
 *     That way the same queue services every component without each
 *     hook instance fighting over a timer.
 *
 *   * Server-side rendering is a no-op: every public function early-
 *     returns on `typeof window === "undefined"`.
 *
 *   * If `isAnalyticsOptedOut()` is true, every event is silently
 *     dropped before it enters the queue.
 *
 *   * No third party. No cookie. POSTs to `/api/usage/events` only.
 */

import {
  ensureVisitorId,
  getFirstTouch,
  isAnalyticsOptedOut,
} from "@/lib/visitor";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const EVENTS_PATH = "/api/usage/events";

const FLUSH_INTERVAL_MS = 5_000;
const MAX_BATCH = 20;
const MAX_QUEUE = 200; // drop oldest if exceeded — defence against runaway loops

export type EventType = "session_start" | "tab_view" | "action" | "funnel";

export interface TrackEvent {
  event_type: EventType;
  event_key: string;
  ts: string;                          // ISO 8601, set at enqueue time
  props?: Record<string, unknown>;
  circuit_id?: number | null;
}

type EnqueuedEvent = TrackEvent & {
  visitor_id: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  referrer: string | null;
  client_kind: "web";
  app_platform: "web";
};

let queue: EnqueuedEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let listenersBound = false;

function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem("boxboxnow-auth");
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    return parsed?.state?.token || null;
  } catch {
    return null;
  }
}

function bindLifecycleListeners() {
  if (listenersBound || typeof window === "undefined") return;
  listenersBound = true;
  // pagehide is the most reliable flush moment (fires before unload on
  // mobile Safari, which doesn't fire `beforeunload` reliably). We also
  // bind to visibilitychange so a backgrounded tab flushes before the
  // browser potentially kills it.
  window.addEventListener("pagehide", flushBeacon, { capture: true });
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushBeacon();
  });
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushAsync();
  }, FLUSH_INTERVAL_MS);
}

/**
 * Enqueue an event. Silently drops when:
 *   - we're SSR'd (no window)
 *   - the user opted out of analytics
 *   - the queue is full (oldest event is dropped to make room)
 */
export function track(
  eventType: EventType,
  eventKey: string,
  props?: Record<string, unknown>,
  circuitId?: number | null,
): void {
  if (typeof window === "undefined") return;
  if (isAnalyticsOptedOut()) return;
  if (!eventType || !eventKey) return;

  const visitorId = ensureVisitorId();
  if (!visitorId) return;

  const ft = getFirstTouch();

  const evt: EnqueuedEvent = {
    event_type: eventType,
    event_key: eventKey.slice(0, 80),
    ts: new Date().toISOString(),
    props,
    circuit_id: circuitId ?? undefined,
    visitor_id: visitorId,
    utm_source: ft?.utm_source ?? null,
    utm_medium: ft?.utm_medium ?? null,
    utm_campaign: ft?.utm_campaign ?? null,
    referrer: ft?.referrer ?? null,
    client_kind: "web",
    app_platform: "web",
  };

  if (queue.length >= MAX_QUEUE) {
    queue.shift(); // drop oldest
  }
  queue.push(evt);

  bindLifecycleListeners();

  // Tab views and funnel events are user-facing and worth flushing
  // immediately when the batch fills up; otherwise wait for the timer.
  if (queue.length >= MAX_BATCH) {
    void flushAsync();
  } else {
    scheduleFlush();
  }
}

export function trackTab(tab: string): void {
  track("tab_view", tab);
}

export function trackAction(
  key: string,
  props?: Record<string, unknown>,
): void {
  track("action", key, props);
}

export function trackFunnel(
  key: string,
  props?: Record<string, unknown>,
): void {
  track("funnel", key, props);
}

async function flushAsync(): Promise<void> {
  if (typeof window === "undefined") return;
  if (queue.length === 0) return;

  const batch = queue.splice(0, MAX_BATCH);
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getAuthToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  try {
    await fetch(`${API_URL}${EVENTS_PATH}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ events: batch }),
      keepalive: true,
      credentials: "omit",
    });
  } catch {
    // Network blip — silently drop. Analytics is best-effort. We don't
    // want to retry forever and clog the queue; the user's actions
    // generate fresh events anyway.
  }

  // If more events accumulated during the in-flight POST, schedule
  // another flush so they don't sit forever.
  if (queue.length > 0) scheduleFlush();
}

/**
 * Synchronous best-effort flush on page hide. Uses sendBeacon, which
 * the browser is guaranteed to deliver even after the page is gone —
 * unlike fetch(keepalive) which can be killed by the browser.
 */
export function flushBeacon(): void {
  if (typeof window === "undefined" || queue.length === 0) return;

  const batch = queue.splice(0, MAX_BATCH);
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  try {
    const body = JSON.stringify({ events: batch });
    if (typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon(`${API_URL}${EVENTS_PATH}`, blob);
      return;
    }
    // sendBeacon unavailable — best-effort fetch with keepalive.
    fetch(`${API_URL}${EVENTS_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
      credentials: "omit",
    }).catch(() => {});
  } catch {
    /* swallow — page is going away anyway */
  }
}

/** Manual flush trigger — exposed for tests and edge cases. */
export function flushNow(): void {
  void flushAsync();
}
