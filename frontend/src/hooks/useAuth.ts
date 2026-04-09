"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AuthUser {
  id: number;
  username: string;
  email?: string;
  is_admin: boolean;
  max_devices: number;
  mfa_enabled: boolean;
  mfa_required: boolean;
  tab_access: string[];
  has_active_subscription?: boolean;
}

interface AuthStore {
  token: string | null;
  sessionToken: string | null;
  user: AuthUser | null;
  _hydrated: boolean;
  setAuth: (token: string, sessionToken: string, user: AuthUser) => void;
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

      logout: () => set({ token: null, sessionToken: null, user: null }),

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
