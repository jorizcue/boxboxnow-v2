"use client";

import { create } from "zustand";

/**
 * Minimal global state for the first-run onboarding tour.
 *
 * Not persisted — the "already seen" decision lives in localStorage
 * (per-user, namespaced) and is read/written by OnboardingTour itself.
 * This store only carries the transient run flag so the Sidebar
 * relaunch button can start the tour on demand from anywhere.
 */
interface TourStore {
  running: boolean;
  /** Start (or restart) the tour from step 0. */
  start: () => void;
  /** Stop the tour (skip / finish / esc). */
  stop: () => void;
}

export const useTour = create<TourStore>((set) => ({
  running: false,
  start: () => set({ running: true }),
  stop: () => set({ running: false }),
}));
