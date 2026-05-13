/**
 * Anonymous visitor identity + first-touch attribution capture.
 *
 * This is the foundation of the acquisition funnel: every event the
 * `useTracker` hook emits carries the same `visitor_id` for the lifetime
 * of a browser, so we can stitch anonymous landing visits to the
 * eventual paid subscription even though the visitor wasn't authenticated
 * when they first arrived.
 *
 * Design choices:
 *
 *   * The visitor_id is a UUID v4 in localStorage (`bbn_vid`). First-party,
 *     not a cookie, not shared with any third party. Survives logout (so
 *     the same browser keeps the same id across login sessions); cleared
 *     only if the user manually wipes the browser.
 *
 *   * First-touch UTM + referrer are SNAPSHOTTED once and never
 *     overwritten — first contact wins. Funnel attribution stays loyal
 *     to whatever brought the user in originally, even if they later
 *     come back via a different source.
 *
 *   * If `STORAGE_KEYS.ANALYTICS_OPT_OUT === "1"` the helpers return
 *     null. `useTracker` short-circuits on null, so no events fire and
 *     no localStorage gets written.
 *
 *   * Everything is SSR-safe (`typeof window` guards).
 */

import { STORAGE_KEYS } from "@/lib/storage";

export type FirstTouch = {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  referrer: string | null;
  captured_at: string;
};

function isOptedOut(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(STORAGE_KEYS.ANALYTICS_OPT_OUT) === "1";
  } catch {
    return false;
  }
}

/**
 * Set the analytics opt-out flag. When true, useTracker stops emitting
 * and no new visitor_id / first-touch will be written. Called from the
 * "Permitir analítica interna" toggle in Cuenta → Privacidad.
 */
export function setAnalyticsOptOut(optedOut: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (optedOut) {
      window.localStorage.setItem(STORAGE_KEYS.ANALYTICS_OPT_OUT, "1");
    } else {
      window.localStorage.removeItem(STORAGE_KEYS.ANALYTICS_OPT_OUT);
    }
  } catch {
    /* quota / privacy mode — ignore */
  }
}

export function isAnalyticsOptedOut(): boolean {
  return isOptedOut();
}

function uuidV4(): string {
  // Prefer the native crypto.randomUUID when available (modern browsers
  // + secure contexts). Fallback uses crypto.getRandomValues so we
  // never depend on Math.random for ids that get stored persistently.
  if (typeof crypto !== "undefined") {
    if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
    const buf = new Uint8Array(16);
    crypto.getRandomValues(buf);
    // RFC 4122 v4 — set bits per spec
    buf[6] = (buf[6] & 0x0f) | 0x40;
    buf[8] = (buf[8] & 0x3f) | 0x80;
    const hex = Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  // Worst-case fallback: should never run in a real browser, only in
  // SSR if someone misuses this helper server-side.
  return "00000000-0000-4000-8000-000000000000";
}

/**
 * Returns the visitor_id for this browser, creating it on first call.
 * Returns null when SSR'd or when the user has opted out — callers
 * (the tracker) should treat null as "don't track".
 */
export function ensureVisitorId(): string | null {
  if (typeof window === "undefined") return null;
  if (isOptedOut()) return null;
  try {
    let id = window.localStorage.getItem(STORAGE_KEYS.VISITOR_ID);
    if (id && id.length === 36) return id;
    id = uuidV4();
    window.localStorage.setItem(STORAGE_KEYS.VISITOR_ID, id);
    return id;
  } catch {
    // Quota / private mode — return a non-persistent id so the current
    // page still tracks, but next page load gets a different one. Acceptable
    // degradation; the funnel just loses cross-page stitching for this user.
    return uuidV4();
  }
}

/**
 * First-touch attribution capture. Runs ONCE per browser — the first
 * time we see this visitor on any page. After that, the snapshot is
 * read back unchanged on every subsequent call, even if new UTM params
 * appear on later URLs.
 *
 * Pass the current page's URL search params + referrer; the helper
 * decides whether to write or to leave the existing snapshot alone.
 */
export function captureFirstTouch(
  search: URLSearchParams | string,
  referrer: string | null,
): FirstTouch | null {
  if (typeof window === "undefined") return null;
  if (isOptedOut()) return null;

  try {
    const existing = window.localStorage.getItem(STORAGE_KEYS.FIRST_TOUCH);
    if (existing) {
      try {
        return JSON.parse(existing) as FirstTouch;
      } catch {
        // Corrupted blob — fall through and rewrite below.
      }
    }
    const params =
      typeof search === "string" ? new URLSearchParams(search) : search;
    const ft: FirstTouch = {
      utm_source: params.get("utm_source") || null,
      utm_medium: params.get("utm_medium") || null,
      utm_campaign: params.get("utm_campaign") || null,
      referrer: cleanReferrer(referrer),
      captured_at: new Date().toISOString(),
    };
    window.localStorage.setItem(STORAGE_KEYS.FIRST_TOUCH, JSON.stringify(ft));
    return ft;
  } catch {
    return null;
  }
}

/**
 * Read the first-touch snapshot without writing. Returns null when
 * none has been captured yet (e.g. visitor opened a deep link instead
 * of the landing) or when the visitor is opted out.
 */
export function getFirstTouch(): FirstTouch | null {
  if (typeof window === "undefined") return null;
  if (isOptedOut()) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.FIRST_TOUCH);
    if (!raw) return null;
    return JSON.parse(raw) as FirstTouch;
  } catch {
    return null;
  }
}

/**
 * Strip the path / query off the referrer so we only persist the host.
 * Avoids leaking arbitrary URLs and keeps the column compact. Empty,
 * same-origin, or unparseable referrers return null.
 */
function cleanReferrer(referrer: string | null): string | null {
  if (!referrer) return null;
  try {
    const u = new URL(referrer);
    // Drop same-origin referrers — they're "navigated within our app"
    // and not interesting for attribution.
    if (typeof window !== "undefined" && u.origin === window.location.origin) {
      return null;
    }
    return u.host.slice(0, 255);
  } catch {
    return null;
  }
}
