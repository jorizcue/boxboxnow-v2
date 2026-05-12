"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { clearSessionStorage } from "@/lib/storage";

interface AuthUser {
  id: number;
  username: string;
  email?: string;
  is_admin: boolean;
  /** Internal staff/partner accounts that bypass the active-subscription
   *  gate but still need active circuit access to enter. Orthogonal to
   *  `is_admin` — admins already bypass every gate. Optional in the type
   *  for backward-compat with payloads from older backends; treat as
   *  false when missing. */
  is_internal?: boolean;
  max_devices: number;
  mfa_enabled: boolean;
  mfa_required: boolean;
  has_password: boolean;
  tab_access: string[];
  has_active_subscription?: boolean;
  subscription_plan?: string | null;
  trial_ends_at?: string | null;
  /** True iff the user has at least one UserCircuitAccess row whose
   *  window covers "right now". Admins are always true. The dashboard
   *  uses this alongside `has_active_subscription` to decide whether
   *  to render the app or a "no circuits" gate page. */
  has_active_circuit_access?: boolean;
  /** Driver-view card ids the user's active plan exposes. Resolved
   *  on-the-fly by the backend from the active subscription's
   *  `ProductTabConfig.allowed_cards`. Empty / missing => fall back
   *  to the full local catalog (legacy / trial / admin path).
   *  Drives which cards the preset editor renders as selectable. */
  allowed_cards?: string[];
}

interface AuthStore {
  token: string | null;
  sessionToken: string | null;
  user: AuthUser | null;
  _hydrated: boolean;
  setAuth: (token: string, sessionToken: string, user: AuthUser) => void;
  updateUser: (user: AuthUser) => void;
  logout: () => void;
  setHydrated: () => void;
}

export const useAuth = create<AuthStore>()(
  persist(
    (set, get) => ({
      token: null,
      sessionToken: null,
      user: null,
      _hydrated: false,

      setAuth: (token, sessionToken, user) => set({ token, sessionToken, user }),

      updateUser: (user) => set({ user }),

      // Logout wipes the auth state AND every other session-bound
      // localStorage key (chat session id, pending plan, racebox cache).
      // Without this sweep, a second user on the same browser would
      // inherit the previous user's chat history / pending purchase.
      logout: () => {
        set({ token: null, sessionToken: null, user: null });
        clearSessionStorage();
      },

      setHydrated: () => set({ _hydrated: true }),
    }),
    {
      name: "boxboxnow-auth",
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
      },
      partialize: (state) => ({
        token: state.token,
        sessionToken: state.sessionToken,
        user: state.user,
      }),
    }
  )
);
