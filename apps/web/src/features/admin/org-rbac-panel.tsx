import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { SearchablePickList, type PickListItem } from "@/components/searchable-pick-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useUsersQuery } from "@/lib/api-hooks";
import { ApiError, apiGet, apiPut } from "@/lib/http";
import type { NavItemKey } from "@/lib/nav-policy";
import { orderedNavKeysForRole, navKeysForRole, roleNavKeysForRole } from "@/lib/nav-policy";
import { mapApiRole } from "@/lib/roles";
import { formatUserRole } from "@/lib/locale-display";
import type { DemoRole } from "@/lib/roles";
import { useAuthStore } from "@/stores/auth-store";

const NAV_I18N: Record<NavItemKey, string> = {
  platform: "nav.platformOverview",
  platform_organizations: "nav.platformOrganizations",
  platform_users: "nav.platformUsers",
  platform_clinics: "nav.platformClinics",
  dashboard: "nav.dashboard",
  patients: "nav.patients",
  encounters: "nav.encounters",
  appointments: "nav.appointments",
  operations: "nav.operations",
  clinics: "nav.clinics",
  expenses: "nav.expenses",
  revenue: "nav.revenue",
  hr: "nav.hr",
  reports: "nav.reports",
  admin: "nav.admin",
  doctor_revenue: "nav.doctorRevenue",
  profile: "nav.profile",
};

const MANAGEABLE_ROLES: DemoRole[] = [
  "group_admin",
  "group_supervisor",
  "branch_manager",
  "finance_officer",
  "hr_officer",
  "clinic_admin",
  "clinic_assistant",
  "physician",
  "nurse",
  "receptionist",
  "call_center",
];

function apiRoleParam(role: DemoRole): string {
  return role.toUpperCase();
}

function fullRoleTabKeysSorted(role: DemoRole, roleNavTabKeys?: string[] | null): string[] {
  return [...roleNavKeysForRole(role, roleNavTabKeys)].sort((a, b) => a.localeCompare(b));
}

function NavTabChecklist({
  orderedKeys,
  draft,
  onToggle,
  disabled,
}: {
  orderedKeys: NavItemKey[];
  draft: Set<NavItemKey>;
  onToggle: (key: NavItemKey) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {orderedKeys.map((key) => (
        <label key={key} className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
          <input
            type="checkbox"
            className="size-4 rounded border-input"
            checked={draft.has(key)}
            disabled={key === "profile" || disabled}
            onChange={() => onToggle(key)}
          />
          <span>{t(NAV_I18N[key])}</span>
        </label>
      ))}
    </div>
  );
}

export function OrgRbacPanel() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const viewer = useAuthStore((s) => s.user);
  const isGroupAdmin = viewer?.role === "group_admin";

  const [roleTarget, setRoleTarget] = useState<DemoRole | "">("");
  const [roleDraft, setRoleDraft] = useState<Set<NavItemKey>>(() => new Set());
  const [roleErr, setRoleErr] = useState<string | null>(null);

  const roleGrantQ = useQuery({
    queryKey: ["tenant-role-nav-tabs", roleTarget],
    queryFn: () => apiGet<{ tabKeys: string[] | null }>(`/api/v1/admin/role-nav-tabs/${apiRoleParam(roleTarget as DemoRole)}`),
    enabled: isGroupAdmin && Boolean(roleTarget),
  });

  const roleGrantFingerprint = roleGrantQ.data ? JSON.stringify(roleGrantQ.data.tabKeys ?? null) : "";
  /** All tabs this role may have (platform max) — checklist always shows the full set. */
  const rolePlatformOrderedKeys = useMemo(
    () => (roleTarget ? orderedNavKeysForRole(roleTarget, null) : []),
    [roleTarget],
  );
  const roleBaseKeys = useMemo(
    () => (roleTarget ? navKeysForRole(roleTarget) : new Set<NavItemKey>()),
    [roleTarget],
  );

  useEffect(() => {
    if (!roleTarget) {
      setRoleDraft(new Set());
      return;
    }
    if (!roleGrantQ.isSuccess) return;
    const saved = roleGrantQ.data?.tabKeys;
    if (saved == null || saved.length === 0) {
      setRoleDraft(new Set(rolePlatformOrderedKeys));
      return;
    }
    const next = new Set<NavItemKey>();
    for (const k of saved) {
      if (roleBaseKeys.has(k as NavItemKey)) next.add(k as NavItemKey);
    }
    next.add("profile");
    setRoleDraft(next);
  }, [roleTarget, roleGrantFingerprint, roleGrantQ.isSuccess, roleGrantQ.data?.tabKeys, rolePlatformOrderedKeys, roleBaseKeys]);

  const saveRoleMut = useMutation({
    mutationFn: (tabKeys: string[]) =>
      apiPut<{ tabKeys: string[] | null }>(`/api/v1/admin/role-nav-tabs/${apiRoleParam(roleTarget as DemoRole)}`, { tabKeys }),
    onSuccess: async () => {
      setRoleErr(null);
      await qc.invalidateQueries({ queryKey: ["tenant-role-nav-tabs", roleTarget] });
      await useAuthStore.getState().refreshSessionFromServer();
    },
    onError: (e: unknown) => {
      setRoleErr(e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e));
    },
  });

  const usersQ = useUsersQuery({ pageSize: 200 });
  const [userTargetId, setUserTargetId] = useState("");
  const [userDraft, setUserDraft] = useState<Set<NavItemKey>>(() => new Set());
  const [userErr, setUserErr] = useState<string | null>(null);

  const pickableUsers = useMemo(() => {
    const items = usersQ.data?.items ?? [];
    if (viewer?.role !== "clinic_admin") return items;
    return items.filter((u) => u.role !== "CLINIC_ADMIN" && u.role !== "GROUP_ADMIN");
  }, [usersQ.data?.items, viewer?.role]);

  const userTarget = pickableUsers.find((u) => u.id === userTargetId);
  const userTargetRole = userTarget ? mapApiRole(userTarget.role) : undefined;

  const userRoleGrantQ = useQuery({
    queryKey: ["tenant-role-nav-tabs", userTargetRole],
    queryFn: () => apiGet<{ tabKeys: string[] | null }>(`/api/v1/admin/role-nav-tabs/${apiRoleParam(userTargetRole!)}`),
    enabled: isGroupAdmin && Boolean(userTargetRole),
  });

  const userGrantQ = useQuery({
    queryKey: ["user-nav-tabs", userTargetId],
    queryFn: () => apiGet<{ tabKeys: string[] | null }>(`/api/v1/user-nav-tabs/${userTargetId}`),
    enabled: Boolean(userTargetId),
  });

  const userRoleBase = useMemo(
    () => (userTargetRole ? roleNavKeysForRole(userTargetRole, userRoleGrantQ.data?.tabKeys) : new Set<NavItemKey>()),
    [userTargetRole, userRoleGrantQ.data?.tabKeys],
  );
  const userOrderedKeys = useMemo(
    () => (userTargetRole ? orderedNavKeysForRole(userTargetRole, userRoleGrantQ.data?.tabKeys) : []),
    [userTargetRole, userRoleGrantQ.data?.tabKeys],
  );

  const userPickItems: PickListItem[] = useMemo(
    () =>
      pickableUsers.map((u) => ({
        value: u.id,
        label: u.displayName,
        hint: `${u.email} · ${formatUserRole(mapApiRole(u.role), t)}`,
      })),
    [pickableUsers, t],
  );
  const userSelectedItem = useMemo((): PickListItem | null => {
    if (!userTargetId) return null;
    return userPickItems.find((i) => i.value === userTargetId) ?? null;
  }, [userTargetId, userPickItems]);

  const userGrantFingerprint = userGrantQ.data ? JSON.stringify(userGrantQ.data.tabKeys ?? null) : "";

  useEffect(() => {
    if (!userTargetId) {
      setUserDraft(new Set());
      return;
    }
    if (!userTargetRole || !userGrantQ.isSuccess) return;
    const base = roleNavKeysForRole(userTargetRole, userRoleGrantQ.data?.tabKeys);
    const raw = userGrantQ.data.tabKeys;
    if (raw == null || raw.length === 0) {
      setUserDraft(new Set(base));
      return;
    }
    const next = new Set<NavItemKey>();
    for (const k of raw) {
      if (base.has(k as NavItemKey)) next.add(k as NavItemKey);
    }
    next.add("profile");
    setUserDraft(next);
  }, [userTargetId, userTargetRole, userGrantFingerprint, userGrantQ.isSuccess, userGrantQ.data?.tabKeys, userRoleGrantQ.data?.tabKeys]);

  const saveUserMut = useMutation({
    mutationFn: (tabKeys: string[]) => apiPut<{ tabKeys: string[] | null }>(`/api/v1/user-nav-tabs/${userTargetId}`, { tabKeys }),
    onSuccess: async () => {
      setUserErr(null);
      await qc.invalidateQueries({ queryKey: ["user-nav-tabs", userTargetId] });
      if (userTargetId === viewer?.id) await useAuthStore.getState().refreshSessionFromServer();
    },
    onError: (e: unknown) => {
      setUserErr(e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e));
    },
  });

  const toggleRole = (key: NavItemKey) => {
    if (key === "profile") return;
    setRoleDraft((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      n.add("profile");
      return n;
    });
  };

  const toggleUser = (key: NavItemKey) => {
    if (key === "profile") return;
    setUserDraft((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      n.add("profile");
      return n;
    });
  };

  const roleIsFullDefault =
    roleTarget &&
    roleDraft.size === roleBaseKeys.size &&
    [...roleBaseKeys].every((k) => roleDraft.has(k));

  const userIsFullRole =
    userTargetRole &&
    userDraft.size === userRoleBase.size &&
    [...userRoleBase].every((k) => userDraft.has(k));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("admin.rbacTitle", "Role-based access (RBAC)")}</CardTitle>
        <CardDescription>
          {t(
            "admin.rbacSubtitle",
            "Customize which sidebar sections each role and user can access in this organization. User grants cannot exceed their role permissions.",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {isGroupAdmin ? (
          <div className="space-y-4 rounded-lg border border-border p-4">
            <div>
              <h3 className="text-sm font-medium">{t("admin.rbacRoleSection", "Permissions by role")}</h3>
              <p className="text-xs text-muted-foreground">
                {t("admin.rbacRoleHint", "Applies to every user with the selected role unless they have a personal override.")}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rbac-role">{t("admin.rbacPickRole", "Role")}</Label>
              <select
                id="rbac-role"
                className="flex h-10 w-full max-w-md rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={roleTarget}
                onChange={(e) => {
                  setRoleTarget((e.target.value || "") as DemoRole | "");
                  setRoleErr(null);
                }}
              >
                <option value="">{t("admin.rbacPickRolePlaceholder", "Select a role…")}</option>
                {MANAGEABLE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {formatUserRole(r, t)}
                  </option>
                ))}
              </select>
            </div>
            {roleErr ? <p className="text-sm text-destructive">{roleErr}</p> : null}
            {roleTarget ? (
              <div className="space-y-3">
                {roleGrantQ.isPending ? (
                  <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
                ) : roleGrantQ.isSuccess ? (
                  <NavTabChecklist
                    orderedKeys={rolePlatformOrderedKeys}
                    draft={roleDraft}
                    onToggle={toggleRole}
                  />
                ) : null}
                <p className="text-xs text-muted-foreground">
                  {roleIsFullDefault || !roleGrantQ.isSuccess
                    ? t("admin.rbacRoleFullHint", "Saving with all role tabs checked restores platform defaults for this role.")
                    : null}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    disabled={!roleTarget || saveRoleMut.isPending || roleGrantQ.isPending}
                    onClick={() => {
                      if (!roleTarget) return;
                      saveRoleMut.mutate([...roleDraft].sort((a, b) => a.localeCompare(b)));
                    }}
                  >
                    {t("admin.rbacSaveRole", "Save role permissions")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!roleTarget || saveRoleMut.isPending || roleGrantQ.isPending}
                    onClick={() => {
                      if (!roleTarget) return;
                      saveRoleMut.mutate(fullRoleTabKeysSorted(roleTarget, null));
                    }}
                  >
                    {t("admin.rbacResetRole", "Use platform defaults")}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-4 rounded-lg border border-border p-4">
          <div>
            <h3 className="text-sm font-medium">{t("admin.rbacUserSection", "Permissions by user")}</h3>
            <p className="text-xs text-muted-foreground">
              {t(
                "admin.rbacUserHint",
                "Grant or restrict extra sidebar tabs for a specific user within their role limits. Profile always stays on.",
              )}
            </p>
          </div>
          <div className="space-y-2">
            <Label>{t("admin.navTabsUser", "User")}</Label>
            <SearchablePickList
              items={userPickItems}
              value={userTargetId}
              selectedItem={userSelectedItem}
              onValueChange={(id) => {
                setUserTargetId(id);
                setUserErr(null);
              }}
              searchPlaceholder={t("admin.rbacUserSearchPlaceholder", "Type name, email, or role…")}
              placeholder={t("admin.navTabsPickUser", "Select a user…")}
              emptyMessage={usersQ.isPending ? t("common.loading") : t("admin.rbacNoUsersMatch", "No users match.")}
              localFilter
              minSearchLength={1}
              idleMessage={t("admin.rbacUserSearchIdle", "Start typing to filter users by name, email, or role.")}
              disabled={usersQ.isPending}
            />
          </div>
          {usersQ.isError ? (
            <p className="text-sm text-destructive">{usersQ.error instanceof Error ? usersQ.error.message : t("common.error")}</p>
          ) : null}
          {userGrantQ.isError ? (
            <p className="text-sm text-destructive">{userGrantQ.error instanceof Error ? userGrantQ.error.message : t("common.error")}</p>
          ) : null}
          {userErr ? <p className="text-sm text-destructive">{userErr}</p> : null}
          {userTargetId && userTargetRole ? (
            <div className="space-y-3">
              {userGrantQ.isPending ? (
                <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
              ) : userGrantQ.isSuccess ? (
                <NavTabChecklist
                  orderedKeys={userOrderedKeys}
                  draft={userDraft}
                  onToggle={toggleUser}
                />
              ) : null}
              <p className="text-xs text-muted-foreground">
                {userIsFullRole || !userGrantQ.isSuccess
                  ? t("admin.navTabsFullRoleHint", "Saving with all tabs checked removes the custom override.")
                  : null}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={!userTargetId || saveUserMut.isPending || userGrantQ.isPending}
                  onClick={() => {
                    if (!userTargetRole) return;
                    saveUserMut.mutate([...userDraft].sort((a, b) => a.localeCompare(b)));
                  }}
                >
                  {t("admin.navTabsSave", "Save user permissions")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!userTargetId || !userTargetRole || saveUserMut.isPending || userGrantQ.isPending}
                  onClick={() => {
                    if (!userTargetRole) return;
                    saveUserMut.mutate(fullRoleTabKeysSorted(userTargetRole, userRoleGrantQ.data?.tabKeys));
                  }}
                >
                  {t("admin.navTabsReset", "Use role defaults")}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
