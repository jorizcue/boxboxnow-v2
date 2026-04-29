"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";

import { api } from "@/lib/api";

/**
 * Site-status hook.
 *
 * Reads `/api/public/site-status` once per page load and exposes the two
 * admin-controlled flags that drive the homepage routing:
 *
 *   - `maintenance`: when true, non-admin traffic is sent to /maintenance
 *   - `launchAt`: ISO datetime of the public launch; null = already open
 *
 * The fetch is deduped via a tiny zustand store so several components can
 * use the hook in parallel without each spawning its own request.
 */

interface SiteStatusState {
  loading: boolean;
  loaded: boolean;
  maintenance: boolean;
  launchAt: string | null;     // ISO 8601, null when site is already open
  serverNow: string | null;    // ISO 8601 from the server, used for countdown drift
  fetchedAtMs: number;         // wall clock when we received the snapshot
  error: string | null;
  refresh: () => Promise<void>;
}

const useSiteStatusStore = create<SiteStatusState>((set, get) => ({
  loading: false,
  loaded: false,
  maintenance: false,
  launchAt: null,
  serverNow: null,
  fetchedAtMs: 0,
  error: null,
  refresh: async () => {
    if (get().loading) return;
    set({ loading: true, error: null });
    try {
      const s = await api.getSiteStatus();
      set({
        loading: false,
        loaded: true,
        maintenance: s.maintenance,
        launchAt: s.launch_at,
        serverNow: s.now,
        fetchedAtMs: Date.now(),
        error: null,
      });
    } catch (e: any) {
      // Fail open: if we can't reach the API, behave as if the site is open
      // and not in maintenance. Better than locking the whole site behind a
      // network blip.
      set({
        loading: false,
        loaded: true,
        maintenance: false,
        launchAt: null,
        serverNow: null,
        fetchedAtMs: Date.now(),
        error: e?.message || "Failed to load site status",
      });
    }
  },
}));

export function useSiteStatus() {
  const state = useSiteStatusStore();

  // First mount triggers the fetch.
  useEffect(() => {
    if (!state.loaded && !state.loading) {
      state.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Convenience flags derived from the raw state. These re-evaluate each
  // render against the current wall clock so a countdown that "ends" while
  // the page is open transitions to marketing without a refresh.
  const isPreLaunch = (() => {
    if (!state.launchAt || !state.serverNow) return false;
    const launchMs = Date.parse(state.launchAt);
    if (isNaN(launchMs)) return false;
    const serverNowMs = Date.parse(state.serverNow);
    if (isNaN(serverNowMs)) return false;
    const elapsedSinceFetch = Date.now() - state.fetchedAtMs;
    return launchMs > serverNowMs + elapsedSinceFetch;
  })();

  return {
    loading: state.loading || !state.loaded,
    maintenance: state.maintenance,
    launchAt: state.launchAt,
    serverNow: state.serverNow,
    fetchedAtMs: state.fetchedAtMs,
    isPreLaunch,
    error: state.error,
    refresh: state.refresh,
  };
}

/**
 * Helper: read the *currently* known status without subscribing to it.
 * Used by routing guards that don't need to re-render on changes.
 */
export function readSiteStatus() {
  const s = useSiteStatusStore.getState();
  return {
    loaded: s.loaded,
    maintenance: s.maintenance,
    launchAt: s.launchAt,
  };
}
