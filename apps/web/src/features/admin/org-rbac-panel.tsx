import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { SearchablePickList, type PickListItem } from "@/components/searchable-pick-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useUsersQuery, useClinicsQuery } from "@/lib/api-hooks";
import { ApiError, apiDelete, apiGet, apiPut } from "@/lib/http";
import type { NavItemKey } from "@/lib/nav-policy";
import {
  canCustomizeOrgRoleNavTabs,
  canExtendUserNavTabs,
  canManageOrgUserNavTabs,
  navKeysForRole,
  organizationNavKeySet,
  organizationNavOrderedKeys,
  roleNavKeysForRole,
} from "@/lib/nav-policy";
import { mapApiRole } from "@/lib/roles";
import { formatClinicName, formatUserRole } from "@/lib/locale-display";
import type { DemoRole } from "@/lib/roles";
import { useAuthStore } from "@/stores/auth-store";
import { canClinicAdminManageUserRbac } from "@/lib/clinic-admin-rbac-policy";

type UserClinicPrivilegeGrantDto = {
  id: string;
  userId: string;
  clinicId: string;
  clinicNameEn: string;
  templateEmployeeId: string;
  templateEmployeeName: string;
  templateUserRole: string;
  canManageEmployees: boolean;
  canArchiveEmployees: boolean;
  hrProvisionLogin: boolean;
};

type PrivilegeTemplateEmployeeDto = {
  id: string;
  displayName: string;
  jobTitle: string;
  userRole: string;
  canManageEmployees: boolean;
  canArchiveEmployees: boolean;
  hrProvisionLogin: boolean;
};

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
  allowedKeys,
}: {
  orderedKeys: NavItemKey[];
  draft: Set<NavItemKey>;
  onToggle: (key: NavItemKey) => void;
  disabled?: boolean;
  /** When set, tabs outside this set cannot be toggled (clinic admins: role subset only). */
  allowedKeys?: Set<NavItemKey>;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {orderedKeys.map((key) => {
        const locked = key !== "profile" && allowedKeys != null && !allowedKeys.has(key);
        return (
        <label
          key={key}
          className={`flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm ${locked ? "opacity-50" : "cursor-pointer"}`}
        >
          <input
            type="checkbox"
            className="size-4 rounded border-input"
            checked={draft.has(key)}
            disabled={key === "profile" || disabled || locked}
            onChange={() => onToggle(key)}
          />
          <span>{t(NAV_I18N[key])}</span>
        </label>
        );
      })}
    </div>
  );
}

export function OrgRbacPanel() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const viewer = useAuthStore((s) => s.user);
  const canManagePrivilegeGrants = canManageOrgUserNavTabs(viewer?.role);
  const canCustomizeRoles = canCustomizeOrgRoleNavTabs(viewer?.role);
  const canExtendUsers = canExtendUserNavTabs(viewer?.role);
  const isClinicAdminViewer = viewer?.role === "clinic_admin";
  const { data: viewerClinics = [] } = useClinicsQuery();
  const viewerClinicIds = useMemo(() => viewerClinics.map((c) => c.id), [viewerClinics]);
  const assignableClinics = useMemo(() => {
    if (!isClinicAdminViewer) return viewerClinics;
    return viewerClinics.filter((c) => viewerClinicIds.includes(c.id));
  }, [viewerClinics, isClinicAdminViewer, viewerClinicIds]);

  const [roleTarget, setRoleTarget] = useState<DemoRole | "">("");
  const [roleDraft, setRoleDraft] = useState<Set<NavItemKey>>(() => new Set());
  const [roleErr, setRoleErr] = useState<string | null>(null);

  const roleGrantQ = useQuery({
    queryKey: ["tenant-role-nav-tabs", roleTarget],
    queryFn: () => apiGet<{ tabKeys: string[] | null }>(`/api/v1/admin/role-nav-tabs/${apiRoleParam(roleTarget as DemoRole)}`),
    enabled: canCustomizeRoles && Boolean(roleTarget),
  });

  const organizationOrderedKeys = useMemo(() => organizationNavOrderedKeys(), []);
  const organizationTabSet = useMemo(() => organizationNavKeySet(), []);

  const roleGrantFingerprint = roleGrantQ.data ? JSON.stringify(roleGrantQ.data.tabKeys ?? null) : "";
  const rolePlatformDefaults = useMemo(
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
      setRoleDraft(new Set(rolePlatformDefaults));
      return;
    }
    const next = new Set<NavItemKey>();
    for (const k of saved) {
      if (organizationOrderedKeys.includes(k as NavItemKey)) next.add(k as NavItemKey);
    }
    next.add("profile");
    setRoleDraft(next);
  }, [roleTarget, roleGrantFingerprint, roleGrantQ.isSuccess, roleGrantQ.data?.tabKeys, rolePlatformDefaults, organizationOrderedKeys]);

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
    if (!isClinicAdminViewer) return items;
    return items.filter((u) =>
      canClinicAdminManageUserRbac({ role: u.role, clinicIds: u.clinicIds }, viewerClinicIds),
    );
  }, [usersQ.data?.items, isClinicAdminViewer, viewerClinicIds]);

  const userTarget = pickableUsers.find((u) => u.id === userTargetId);
  const userTargetRole = userTarget ? mapApiRole(userTarget.role) : undefined;

  const userRoleGrantQ = useQuery({
    queryKey: ["tenant-role-nav-tabs", userTargetRole],
    queryFn: () => apiGet<{ tabKeys: string[] | null }>(`/api/v1/admin/role-nav-tabs/${apiRoleParam(userTargetRole!)}`),
    enabled: canCustomizeRoles && Boolean(userTargetRole),
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
  const userDraftSeedRef = useRef("");

  useEffect(() => {
    if (!userTargetId) {
      setUserDraft(new Set());
      userDraftSeedRef.current = "";
      return;
    }
    if (!userTargetRole || !userGrantQ.isSuccess) return;
    if (canCustomizeRoles && !userRoleGrantQ.isSuccess) return;

    const seedKey = `${userTargetId}:${userGrantFingerprint}:${canCustomizeRoles ? JSON.stringify(userRoleGrantQ.data?.tabKeys ?? null) : "clinic"}`;
    if (userDraftSeedRef.current === seedKey) return;
    userDraftSeedRef.current = seedKey;

    const roleEffective = roleNavKeysForRole(userTargetRole, userRoleGrantQ.data?.tabKeys);
    const raw = userGrantQ.data?.tabKeys;
    if (raw == null || raw.length === 0) {
      setUserDraft(new Set(roleEffective));
      return;
    }
    const next = new Set<NavItemKey>();
    for (const k of raw) {
      if (organizationTabSet.has(k as NavItemKey)) next.add(k as NavItemKey);
    }
    next.add("profile");
    setUserDraft(next);
  }, [
    userTargetId,
    userTargetRole,
    userGrantFingerprint,
    userGrantQ.isSuccess,
    userGrantQ.data?.tabKeys,
    canCustomizeRoles,
    userRoleGrantQ.isSuccess,
    userRoleGrantQ.data?.tabKeys,
    organizationTabSet,
  ]);

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
    roleDraft.size === rolePlatformDefaults.size &&
    [...rolePlatformDefaults].every((k) => roleDraft.has(k));

  const userIsFullRole =
    userTargetRole &&
    userDraft.size === userRoleBase.size &&
    [...userRoleBase].every((k) => userDraft.has(k));

  const [privilegeClinicId, setPrivilegeClinicId] = useState("");
  const [privilegeTemplateEmployeeId, setPrivilegeTemplateEmployeeId] = useState("");
  const [privilegeErr, setPrivilegeErr] = useState<string | null>(null);

  const privilegeGrantsQ = useQuery({
    queryKey: ["user-clinic-privilege-grants", userTargetId],
    queryFn: () =>
      apiGet<UserClinicPrivilegeGrantDto[]>(
        `/api/v1/admin/user-clinic-privilege-grants?userId=${encodeURIComponent(userTargetId)}`,
      ),
    enabled: canManagePrivilegeGrants && Boolean(userTargetId),
  });

  const templateEmployeesQ = useQuery({
    queryKey: ["privilege-template-employees", privilegeClinicId],
    queryFn: () =>
      apiGet<PrivilegeTemplateEmployeeDto[]>(
        `/api/v1/admin/user-clinic-privilege-grants/template-employees?clinicId=${encodeURIComponent(privilegeClinicId)}`,
      ),
    enabled: canManagePrivilegeGrants && Boolean(privilegeClinicId),
  });

  const savePrivilegeMut = useMutation({
    mutationFn: () =>
      apiPut<UserClinicPrivilegeGrantDto>(`/api/v1/admin/user-clinic-privilege-grants`, {
        userId: userTargetId,
        clinicId: privilegeClinicId,
        templateEmployeeId: privilegeTemplateEmployeeId,
      }),
    onSuccess: async () => {
      setPrivilegeErr(null);
      await qc.invalidateQueries({ queryKey: ["user-clinic-privilege-grants", userTargetId] });
      if (userTargetId === viewer?.id) await useAuthStore.getState().refreshSessionFromServer();
    },
    onError: (e: unknown) => {
      setPrivilegeErr(e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e));
    },
  });

  const deletePrivilegeMut = useMutation({
    mutationFn: (grantId: string) => apiDelete<{ ok: true }>(`/api/v1/admin/user-clinic-privilege-grants/${grantId}`),
    onSuccess: async () => {
      setPrivilegeErr(null);
      await qc.invalidateQueries({ queryKey: ["user-clinic-privilege-grants", userTargetId] });
      if (userTargetId === viewer?.id) await useAuthStore.getState().refreshSessionFromServer();
    },
    onError: (e: unknown) => {
      setPrivilegeErr(e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e));
    },
  });

  const clinicPickItems: PickListItem[] = useMemo(
    () =>
      assignableClinics.map((c) => ({
        value: c.id,
        label: formatClinicName(c, i18n.language),
      })),
    [assignableClinics, i18n.language],
  );

  const templateEmployeeItems: PickListItem[] = useMemo(
    () =>
      (templateEmployeesQ.data ?? []).map((e) => ({
        value: e.id,
        label: e.displayName,
        hint: `${e.jobTitle} · ${formatUserRole(mapApiRole(e.userRole), t)}`,
      })),
    [templateEmployeesQ.data, t],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("admin.rbacTitle", "Role-based access (RBAC)")}</CardTitle>
        <CardDescription>
          {t(
            "admin.rbacSubtitle",
            "Customize which sidebar sections each role and user can access. Organization admins can grant extra tabs to individual users beyond their role.",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {canCustomizeRoles ? (
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
                    orderedKeys={organizationOrderedKeys}
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
                canExtendUsers
                  ? "Grant or restrict tabs for a specific user. You can add organization tabs (e.g. HR) even when they are not part of the user's role."
                  : isClinicAdminViewer
                    ? t(
                        "admin.rbacUserHintClinicAdmin",
                        "Adjust sidebar tabs for staff in your assigned clinics only, within their role permissions. Organization-wide tabs (e.g. HR, Admin) cannot be added.",
                      )
                    : "Grant or restrict tabs for a specific user within their role permissions.",
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
              ) : userGrantQ.isSuccess && (!canCustomizeRoles || userRoleGrantQ.isSuccess) ? (
                <NavTabChecklist
                  orderedKeys={organizationOrderedKeys}
                  draft={userDraft}
                  onToggle={toggleUser}
                  allowedKeys={canExtendUsers ? undefined : userRoleBase}
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

        {canManagePrivilegeGrants ? (
          <div className="space-y-4 rounded-lg border border-border p-4">
            <div>
              <h3 className="text-sm font-medium">
                {t("admin.rbacPrivilegeSection", "Functional privileges by clinic")}
              </h3>
              <p className="text-xs text-muted-foreground">
                {t(
                  "admin.rbacPrivilegeHint",
                  "Grant a user the same HR and employee-management capabilities as a selected employee at a specific clinic. Sidebar HR access is enabled automatically when those capabilities apply.",
                )}
              </p>
            </div>
            {!userTargetId ? (
              <p className="text-sm text-muted-foreground">
                {t("admin.rbacPrivilegePickUserFirst", "Select a user above to manage clinic privilege grants.")}
              </p>
            ) : (
              <div className="space-y-4">
                {privilegeErr ? <p className="text-sm text-destructive">{privilegeErr}</p> : null}
                {privilegeGrantsQ.isSuccess && (privilegeGrantsQ.data?.length ?? 0) > 0 ? (
                  <ul className="space-y-2">
                    {(privilegeGrantsQ.data ?? []).map((g) => (
                      <li
                        key={g.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
                      >
                        <div>
                          <p className="font-medium">{g.clinicNameEn}</p>
                          <p className="text-xs text-muted-foreground">
                            {t("admin.rbacPrivilegeLike", "Same as")} {g.templateEmployeeName} (
                            {formatUserRole(mapApiRole(g.templateUserRole), t)})
                          </p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={deletePrivilegeMut.isPending}
                          onClick={() => deletePrivilegeMut.mutate(g.id)}
                        >
                          {t("common.remove", "Remove")}
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : privilegeGrantsQ.isSuccess ? (
                  <p className="text-sm text-muted-foreground">
                    {t("admin.rbacPrivilegeNone", "No clinic privilege grants for this user.")}
                  </p>
                ) : null}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{t("hr.clinic", "Clinic")}</Label>
                    <SearchablePickList
                      items={clinicPickItems}
                      value={privilegeClinicId}
                      selectedItem={clinicPickItems.find((c) => c.value === privilegeClinicId) ?? null}
                      onValueChange={(id) => {
                        setPrivilegeClinicId(id);
                        setPrivilegeTemplateEmployeeId("");
                        setPrivilegeErr(null);
                      }}
                      searchPlaceholder={t("appointments.filterClinic", "Type clinic name…")}
                      placeholder={t("hr.pickClinic", "Select clinic…")}
                      localFilter
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("admin.rbacPrivilegeTemplate", "Mirror employee")}</Label>
                    <SearchablePickList
                      items={templateEmployeeItems}
                      value={privilegeTemplateEmployeeId}
                      selectedItem={
                        templateEmployeeItems.find((e) => e.value === privilegeTemplateEmployeeId) ?? null
                      }
                      onValueChange={(id) => {
                        setPrivilegeTemplateEmployeeId(id);
                        setPrivilegeErr(null);
                      }}
                      searchPlaceholder={t("admin.rbacPrivilegeTemplateSearch", "Type employee name…")}
                      placeholder={t("admin.rbacPrivilegeTemplatePick", "Select employee…")}
                      emptyMessage={
                        !privilegeClinicId
                          ? t("admin.rbacPrivilegePickClinicFirst", "Choose a clinic first.")
                          : templateEmployeesQ.isPending
                            ? t("common.loading")
                            : t("admin.rbacPrivilegeNoTemplates", "No linked employees in this clinic.")
                      }
                      disabled={!privilegeClinicId || templateEmployeesQ.isPending}
                      localFilter
                    />
                  </div>
                </div>
                <Button
                  type="button"
                  disabled={
                    !userTargetId ||
                    !privilegeClinicId ||
                    !privilegeTemplateEmployeeId ||
                    savePrivilegeMut.isPending
                  }
                  onClick={() => savePrivilegeMut.mutate()}
                >
                  {t("admin.rbacPrivilegeSave", "Save clinic privileges")}
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
