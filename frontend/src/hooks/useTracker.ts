"use client";

/**
 * React entry-point for the usage analytics tracker.
 *
 * Two responsibilities:
 *
 *   1. **One-time visitor init**: `useTrackerInit()` — call once at the
 *      app root. Generates the visitor_id (if absent), captures
 *      first-touch UTM + referrer from the current URL, and fires a
 *      single `session_start` event. Idempotent — safe to call from
 *      multiple components, only the first call does any work.
 *
 *   2. **Stable event emitters**: `useTracker()` — returns `track*`
 *      helpers bound to memo'd identity so components can use them in
 *      `useEffect` deps without re-triggering. Thin wrappers over the
 *      module-level singleton in `lib/tracker.ts`.
 */

import { useCallback, useEffect, useRef } from "react";

import {
  captureFirstTouch,
  ensureVisitorId,
  isAnalyticsOptedOut,
} from "@/lib/visitor";
import {
  track as _track,
  trackAction as _trackAction,
  trackFunnel as _trackFunnel,
  trackTab as _trackTab,
  type EventType,
} from "@/lib/tracker";

// Module-level guard so even multiple `useTrackerInit` callers across
// independent component subtrees only run the init once per app load.
let inited = false;

/**
 * Initialise the tracker once per app load. Idempotent — multiple
 * callers are harmless (only the first call does work).
 *
 *   1. Generates the visitor_id on first ever landing (UUID stored in
 *      localStorage `bbn_vid`). No-op if already present or if the
 *      user has opted out.
 *
 *   2. Snapshots first-touch UTM + referrer from the current URL.
 *      Only the FIRST call ever for this browser writes the snapshot;
 *      subsequent calls read it back unchanged so attribution stays
 *      loyal to whatever brought the user in originally.
 *
 *   3. Fires a single `session_start` event so the backend has a clear
 *      "this visitor opened the app" signal even when the user
 *      bounces from the landing page without doing anything else.
 *
 * Call it from a top-level layout component (e.g. RootLayout's
 * child), inside a useEffect — never during render.
 */
export function useTrackerInit(): void {
  useEffect(() => {
    if (inited) return;
    inited = true;

    if (typeof window === "undefined") return;
    if (isAnalyticsOptedOut()) return;

    // Capture first-touch BEFORE generating visitor_id so the snapshot
    // and the id row are consistent. ensureVisitorId() is idempotent
    // anyway, so order is just stylistic.
    const url = new URL(window.location.href);
    captureFirstTouch(url.searchParams, document.referrer || null);
    ensureVisitorId();

    _track("session_start", "app_open");
  }, []);
}

/**
 * Stable handle to the tracker primitives. Identity is preserved
 * across renders so callers can list them in `useEffect` deps.
 */
export function useTracker() {
  const ref = useRef({
    track: _track,
    trackTab: _trackTab,
    trackAction: _trackAction,
    trackFunnel: _trackFunnel,
  });

  const track = useCallback(
    (
      eventType: EventType,
      eventKey: string,
      props?: Record<string, unknown>,
      circuitId?: number | null,
    ) => ref.current.track(eventType, eventKey, props, circuitId),
    [],
  );
  const trackTab = useCallback(
    (tab: string) => ref.current.trackTab(tab),
    [],
  );
  const trackAction = useCallback(
    (key: string, props?: Record<string, unknown>) =>
      ref.current.trackAction(key, props),
    [],
  );
  const trackFunnel = useCallback(
    (key: string, props?: Record<string, unknown>) =>
      ref.current.trackFunnel(key, props),
    [],
  );

  return { track, trackTab, trackAction, trackFunnel };
}
