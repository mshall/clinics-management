import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { AuthUserDto } from "@/lib/api-schema";
import { apiUrl } from "@/lib/api-url";
import { mapApiRole } from "@/lib/roles";
import type { DemoRole } from "@/lib/roles";

export type { DemoRole } from "@/lib/roles";

export interface AuthUser {
  id: string;
  tenantId: string | null;
  email: string;
  displayName: string;
  role: DemoRole;
  /** Subset of tabs from clinic/group admin; undefined/null = full role menu */
  navTabKeys?: string[] | null;
  /** Organization override for this user's role; undefined/null = platform role defaults */
  roleNavTabKeys?: string[] | null;
  /** Legacy email gate: data explorer on Admin, not platform routes */
  platformSuperAdmin?: boolean;
  hasAvatar?: boolean;
}

interface AuthState {
  accessToken: string | null;
  user: AuthUser | null;
  setSession: (
    accessToken: string,
    user: Omit<AuthUser, "role"> & { role: string; navTabKeys?: string[] | null; roleNavTabKeys?: string[] | null; platformSuperAdmin?: boolean; hasAvatar?: boolean }
  ) => void;
  signOut: () => void;
  refreshSessionFromServer: () => Promise<void>;
  setHasAvatar: (hasAvatar: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
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
            navTabKeys: raw.navTabKeys !== undefined ? raw.navTabKeys : undefined,
            roleNavTabKeys: raw.roleNavTabKeys !== undefined ? raw.roleNavTabKeys : undefined,
            platformSuperAdmin: Boolean(raw.platformSuperAdmin),
            hasAvatar: Boolean(raw.hasAvatar),
          },
        }),
      signOut: () => set({ accessToken: null, user: null }),
      setHasAvatar: (hasAvatar) =>
        set((state) => (state.user ? { user: { ...state.user, hasAvatar } } : state)),
      refreshSessionFromServer: async () => {
        const token = get().accessToken;
        if (!token) return;
        const res = await fetch(apiUrl("/api/v1/auth/me"), {
          headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        });
        if (res.status === 401) {
          set({ accessToken: null, user: null });
          return;
        }
        if (!res.ok) return;
        const me = (await res.json()) as AuthUserDto;
        set({
          user: {
            id: me.id,
            tenantId: me.tenantId,
            email: me.email,
            displayName: me.displayName,
            role: mapApiRole(me.role),
            navTabKeys: me.navTabKeys ?? null,
            roleNavTabKeys: me.roleNavTabKeys ?? null,
            platformSuperAdmin: Boolean(me.platformSuperAdmin),
            hasAvatar: Boolean((me as { hasAvatar?: boolean }).hasAvatar),
          },
        });
      },
    }),
    {
      name: "cms-auth",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ accessToken: s.accessToken, user: s.user }),
      merge: (persisted, current) => {
        const p = persisted as Partial<AuthState> | undefined;
        if (!p?.user) return { ...current, ...p };
        return {
          ...current,
          ...p,
          user: {
            ...p.user,
            role: mapApiRole(String(p.user.role)),
          },
        };
      },
    },
  )
);
