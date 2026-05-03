import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { mapApiRole } from "@/lib/roles";
import type { DemoRole } from "@/lib/roles";

export type { DemoRole } from "@/lib/roles";

export interface AuthUser {
  id: string;
  tenantId: string;
  email: string;
  displayName: string;
  role: DemoRole;
}

interface AuthState {
  accessToken: string | null;
  user: AuthUser | null;
  setSession: (accessToken: string, user: Omit<AuthUser, "role"> & { role: string }) => void;
  signOut: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      user: null,
      setSession: (accessToken, raw) =>
        set({
          accessToken,
          user: {
            id: raw.id,
            tenantId: raw.tenantId,
            email: raw.email,
            displayName: raw.displayName,
            role: mapApiRole(raw.role),
          },
        }),
      signOut: () => set({ accessToken: null, user: null }),
    }),
    {
      name: "cms-auth",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ accessToken: s.accessToken, user: s.user }),
    }
  )
);
