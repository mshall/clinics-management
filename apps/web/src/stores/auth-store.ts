import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { AuthUserDto } from "@/lib/api-schema";
import { apiUrl } from "@/lib/api-url";
import { sessionIdFromAccessToken } from "@/lib/session-id";
import { mapApiRole } from "@/lib/roles";
import type { MoneyVisibilityOverrides } from "@/lib/money-visibility-policy";
import type { DemoRole } from "@/lib/roles";
import { rememberSignInOrg } from "@/lib/sign-in-default";

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
  navTabAccessModes?: Record<string, "read" | "write"> | null;
  /** Clinic-scoped privileges mirrored from template employees */
  employeePrivilegeGrants?: import("@/lib/employee-manage-policy").EmployeePrivilegeGrantSummary[];
  /** Legacy email gate: data explorer on Admin, not platform routes */
  platformSuperAdmin?: boolean;
  hasAvatar?: boolean;
  /** Organization base currency (default for clinics that inherit org settings) */
  tenantBaseCurrency?: string | null;
  /** When true, creating an operation requires How did they find us? */
  operationAcquisitionRequired?: boolean;
  /** Organization display name (English) for top-bar identity */
  tenantName?: string | null;
  /** Organization display name (Arabic) for top-bar identity */
  tenantNameAr?: string | null;
  /** Org clinical specialty derived from clinics (for top-bar identity) */
  clinicalSpecialty?: string | null;
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
      operationAcquisitionRequired?: boolean;
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

/** Best-effort server-side revoke so the refresh token dies with the sign-out (never blocks or throws). */
function revokeServerSession(accessToken: string | null): void {
  const sid = sessionIdFromAccessToken(accessToken);
  if (!accessToken || !sid || typeof fetch !== "function") return;
  try {
    void fetch(apiUrl(`/api/v1/auth/sessions/${encodeURIComponent(sid)}`), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    /* offline or blocked: the local sign-out still happens */
  }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      setSession: (accessToken, raw, refreshToken) => {
        // the next visit to the login page asks the API for THIS organisation's default sign-in method
        rememberSignInOrg(raw.tenantId);
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
            navTabAccessModes: raw.navTabAccessModes ?? undefined,
            employeePrivilegeGrants: raw.employeePrivilegeGrants,
            platformSuperAdmin: Boolean(raw.platformSuperAdmin),
            hasAvatar: Boolean(raw.hasAvatar),
            tenantBaseCurrency: raw.tenantBaseCurrency ?? null,
            operationAcquisitionRequired: Boolean(raw.operationAcquisitionRequired),
            tenantName: raw.tenantName ?? null,
            tenantNameAr: raw.tenantNameAr ?? null,
            clinicalSpecialty: raw.clinicalSpecialty ?? null,
            mfaEnabled: Boolean(raw.mfaEnabled),
            moneyVisibilityOverrides: raw.moneyVisibilityOverrides ?? undefined,
            plan: raw.plan ?? undefined,
            entitlements: raw.entitlements ?? undefined,
          },
        });
      },
      signOut: () => {
        revokeServerSession(get().accessToken);
        set({ accessToken: null, refreshToken: null, user: null });
        // A session that started at Kiorex Passport also ends the Passport session (RP-initiated logout with id_token_hint),
        // otherwise "Sign in with Kiorex Passport" would sign the user straight back in and every other Passport app stays signed in.
        try {
          const url = localStorage.getItem("kiorly-passport-logout");
          if (url) { localStorage.removeItem("kiorly-passport-logout"); if (/^https?:\/\//.test(url)) window.location.assign(url); }
        } catch { /* ignore */ }
      },
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
            // keep the extra roles and the owner flag: dropping them made the owner (physician + GROUP_ADMIN) look like a plain doctor after every refresh
            roles: ((me as { roles?: string[] }).roles ?? [me.role]).map((r) => mapApiRole(r)),
            additionalRoles: ((me as { additionalRoles?: string[] }).additionalRoles ?? []).map((r) => mapApiRole(r)),
            isTenantOwner: Boolean((me as { isTenantOwner?: boolean }).isTenantOwner),
            navTabKeys: me.navTabKeys ?? null,
            roleNavTabKeys: me.roleNavTabKeys ?? null,
            navTabAccessModes: me.navTabAccessModes ?? null,
            employeePrivilegeGrants: (me as AuthUserDto).employeePrivilegeGrants,
            platformSuperAdmin: Boolean(me.platformSuperAdmin),
            hasAvatar: Boolean((me as { hasAvatar?: boolean }).hasAvatar),
            tenantBaseCurrency: (me as AuthUserDto).tenantBaseCurrency ?? null,
            operationAcquisitionRequired: Boolean(
              (me as AuthUserDto & { operationAcquisitionRequired?: boolean }).operationAcquisitionRequired,
            ),
            tenantName: (me as AuthUserDto).tenantName ?? null,
            tenantNameAr: (me as AuthUserDto).tenantNameAr ?? null,
            clinicalSpecialty: (me as AuthUserDto).clinicalSpecialty ?? null,
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
