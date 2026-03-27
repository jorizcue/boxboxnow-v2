"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AuthUser {
  id: number;
  username: string;
  is_admin: boolean;
}

interface AuthStore {
  token: string | null;
  user: AuthUser | null;
  setAuth: (token: string, user: AuthUser) => void;
  logout: () => void;
  isLoggedIn: () => boolean;
  isAdmin: () => boolean;
}

export const useAuth = create<AuthStore>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,

      setAuth: (token, user) => set({ token, user }),

      logout: () => set({ token: null, user: null }),

      isLoggedIn: () => !!get().token,

      isAdmin: () => get().user?.is_admin ?? false,
    }),
    {
      name: "boxboxnow-auth",
    }
  )
);
