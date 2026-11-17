import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { AuthUserDto } from "@/lib/api-schema";
import { apiUrl } from "@/lib/api-url";
import { mapApiRole } from "@/lib/roles";
import type { MoneyVisibilityOverrides } from "@/lib/money-visibility-policy";
import type { DemoRole } from "@/lib/roles";

export type { DemoRole } from "@/lib/roles";

export interface AuthUser {
  id: string;
  tenantId: string | null;
  email: string;
  displayName: string;
  role: DemoRole;
  roles?: DemoRole[];
  additionalRoles?: DemoRole[];
  isTenantOwner?: boolean;
  /** Subset of tabs from clinic/group admin; undefined/null = full role menu */
  navTabKeys?: string[] | null;
  /** Organization override for this user's role; undefined/null = platform role defaults */
  roleNavTabKeys?: string[] | null;
  /** Clinic-scoped privileges mirrored from template employees */
  employeePrivilegeGrants?: import("@/lib/employee-manage-policy").EmployeePrivilegeGrantSummary[];
  /** Legacy email gate: data explorer on Admin, not platform routes */
  platformSuperAdmin?: boolean;
  hasAvatar?: boolean;
  /** Organization base currency (default for clinics that inherit org settings) */
  tenantBaseCurrency?: string | null;
  mfaEnabled?: boolean;
  moneyVisibilityOverrides?: MoneyVisibilityOverrides | null;
  plan?: { key: string; status: string } | null;
  entitlements?: Record<string, unknown> | null;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  setSession: (
    accessToken: string,
    user: Omit<AuthUser, "role"> & {
      role: string;
      roles?: string[];
      additionalRoles?: string[];
      isTenantOwner?: boolean;
      navTabKeys?: string[] | null;
      roleNavTabKeys?: string[] | null;
      employeePrivilegeGrants?: AuthUser["employeePrivilegeGrants"];
      platformSuperAdmin?: boolean;
      hasAvatar?: boolean;
      mfaEnabled?: boolean;
      tenantBaseCurrency?: string | null;
      moneyVisibilityOverrides?: MoneyVisibilityOverrides | null;
      plan?: { key: string; status: string } | null;
      entitlements?: Record<string, unknown> | null;
    },
    refreshToken?: string | null,
  ) => void;
  signOut: () => void;
  refreshSessionFromServer: () => Promise<void>;
  setHasAvatar: (hasAvatar: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      setSession: (accessToken, raw, refreshToken) =>
        set({
          accessToken,
          refreshToken: refreshToken ?? null,
          user: {
            id: raw.id,
            tenantId: raw.tenantId,
            email: raw.email,
            displayName: raw.displayName,
            role: mapApiRole(raw.role),
            roles: raw.roles?.map((r) => mapApiRole(r)) ?? [mapApiRole(raw.role)],
            additionalRoles: raw.additionalRoles?.map((r) => mapApiRole(r)) ?? [],
            isTenantOwner: Boolean(raw.isTenantOwner),
            navTabKeys: raw.navTabKeys !== undefined ? raw.navTabKeys : undefined,
            roleNavTabKeys: raw.roleNavTabKeys !== undefined ? raw.roleNavTabKeys : undefined,
            employeePrivilegeGrants: raw.employeePrivilegeGrants,
            platformSuperAdmin: Boolean(raw.platformSuperAdmin),
            hasAvatar: Boolean(raw.hasAvatar),
            tenantBaseCurrency: raw.tenantBaseCurrency ?? null,
            mfaEnabled: Boolean(raw.mfaEnabled),
            moneyVisibilityOverrides: raw.moneyVisibilityOverrides ?? undefined,
            plan: raw.plan ?? undefined,
            entitlements: raw.entitlements ?? undefined,
          },
        }),
      signOut: () => set({ accessToken: null, refreshToken: null, user: null }),
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
            employeePrivilegeGrants: (me as AuthUserDto).employeePrivilegeGrants,
            platformSuperAdmin: Boolean(me.platformSuperAdmin),
            hasAvatar: Boolean((me as { hasAvatar?: boolean }).hasAvatar),
            tenantBaseCurrency: (me as AuthUserDto).tenantBaseCurrency ?? null,
            mfaEnabled: Boolean((me as AuthUserDto).mfaEnabled),
            moneyVisibilityOverrides: (me as AuthUserDto & { moneyVisibilityOverrides?: MoneyVisibilityOverrides | null })
              .moneyVisibilityOverrides ?? undefined,
            plan: (me as AuthUserDto).plan ?? undefined,
            entitlements: (me as AuthUserDto).entitlements ?? undefined,
          },
        });
      },
    }),
    {
      name: "cms-auth",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ accessToken: s.accessToken, refreshToken: s.refreshToken, user: s.user }),
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
