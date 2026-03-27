"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AuthUser {
  id: number;
  username: string;
  is_admin: boolean;
  max_devices: number;
}

interface AuthStore {
  token: string | null;
  sessionToken: string | null;
  user: AuthUser | null;
  setAuth: (token: string, sessionToken: string, user: AuthUser) => void;
  logout: () => void;
  isLoggedIn: () => boolean;
  isAdmin: () => boolean;
}

export const useAuth = create<AuthStore>()(
  persist(
    (set, get) => ({
      token: null,
      sessionToken: null,
      user: null,

      setAuth: (token, sessionToken, user) => set({ token, sessionToken, user }),

      logout: () => set({ token: null, sessionToken: null, user: null }),

      isLoggedIn: () => !!get().token,

      isAdmin: () => get().user?.is_admin ?? false,
    }),
    {
      name: "boxboxnow-auth",
    }
  )
);
