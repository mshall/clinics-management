import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { SearchablePickList, type PickListItem } from "@/components/searchable-pick-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

type UserClinicHrAssignmentDto = {
  id: string;
  userId: string;
  clinicId: string;
  clinicNameEn: string;
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
    mutationFn: (payload: { tabKeys: string[]; hrClinicId?: string }) =>
      apiPut<{ tabKeys: string[] | null }>(`/api/v1/user-nav-tabs/${userTargetId}`, payload),
    onSuccess: async () => {
      setUserErr(null);
      setHrAssignDialogOpen(false);
      setHrAssignClinicIds(new Set());
      await qc.invalidateQueries({ queryKey: ["user-nav-tabs", userTargetId] });
      await qc.invalidateQueries({ queryKey: ["user-clinic-hr-assignments", userTargetId] });
      if (userTargetId === viewer?.id) await useAuthStore.getState().refreshSessionFromServer();
    },
    onError: (e: unknown) => {
      setUserErr(e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e));
    },
  });

  const [hrAssignErr, setHrAssignErr] = useState<string | null>(null);
  const [hrAssignDialogOpen, setHrAssignDialogOpen] = useState(false);
  const [hrAssignClinicIds, setHrAssignClinicIds] = useState<Set<string>>(() => new Set());
  const [hrDialogSubmitting, setHrDialogSubmitting] = useState(false);

  const hrAssignmentsQ = useQuery({
    queryKey: ["user-clinic-hr-assignments", userTargetId],
    queryFn: () =>
      apiGet<UserClinicHrAssignmentDto[]>(
        `/api/v1/admin/user-clinic-hr-assignments?userId=${encodeURIComponent(userTargetId)}`,
      ),
    enabled: canManagePrivilegeGrants && Boolean(userTargetId),
  });

  const assignedClinicIds = useMemo(
    () => new Set((hrAssignmentsQ.data ?? []).map((a) => a.clinicId)),
    [hrAssignmentsQ.data],
  );

  const unassignedClinics = useMemo(
    () => assignableClinics.filter((c) => !assignedClinicIds.has(c.id)),
    [assignableClinics, assignedClinicIds],
  );

  const saveHrAssignmentMut = useMutation({
    mutationFn: (clinicId: string) =>
      apiPut<UserClinicHrAssignmentDto>(`/api/v1/admin/user-clinic-hr-assignments`, {
        userId: userTargetId,
        clinicId,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["user-clinic-hr-assignments", userTargetId] });
      if (userTargetId === viewer?.id) await useAuthStore.getState().refreshSessionFromServer();
    },
  });

  const deleteHrAssignmentMut = useMutation({
    mutationFn: (assignmentId: string) =>
      apiDelete<{ ok: true }>(`/api/v1/admin/user-clinic-hr-assignments/${assignmentId}`),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["user-clinic-hr-assignments", userTargetId] });
      if (userTargetId === viewer?.id) await useAuthStore.getState().refreshSessionFromServer();
    },
  });

  const openHrClinicDialog = () => {
    const preselect = new Set<string>();
    if (unassignedClinics.length === 1) {
      preselect.add(unassignedClinics[0]!.id);
    }
    setHrAssignClinicIds(preselect);
    setHrAssignErr(null);
    setHrAssignDialogOpen(true);
  };

  const toggleHrClinicPick = (clinicId: string) => {
    setHrAssignClinicIds((prev) => {
      const next = new Set(prev);
      if (next.has(clinicId)) next.delete(clinicId);
      else next.add(clinicId);
      return next;
    });
  };

  const confirmHrClinicDialog = async () => {
    if (!userTargetId || hrAssignClinicIds.size === 0) return;
    setHrDialogSubmitting(true);
    setHrAssignErr(null);
    try {
      for (const clinicId of hrAssignClinicIds) {
        await saveHrAssignmentMut.mutateAsync(clinicId);
      }
      const nextDraft = new Set(userDraft);
      nextDraft.add("hr");
      nextDraft.add("profile");
      const tabKeys = [...nextDraft].sort((a, b) => a.localeCompare(b));
      setUserDraft(nextDraft);
      await saveUserMut.mutateAsync({ tabKeys, hrClinicId: [...hrAssignClinicIds][0] });
    } catch (e: unknown) {
      setHrAssignErr(e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e));
    } finally {
      setHrDialogSubmitting(false);
    }
  };

  const assignHrForClinic = (clinicId: string) => {
    if (!userTargetId || !clinicId) return;
    saveHrAssignmentMut.mutate(clinicId, {
      onError: (e: unknown) => {
        setHrAssignErr(e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e));
      },
    });
  };

  const saveUserNavTabs = (tabKeys: string[]) => {
    if (!userTargetId || !userTargetRole) return;
    const sorted = [...tabKeys].sort((a, b) => a.localeCompare(b));
    if (
      sorted.includes("hr") &&
      canExtendUsers &&
      userTargetRole !== "hr_officer" &&
      (hrAssignmentsQ.data?.length ?? 0) === 0
    ) {
      setUserErr(
        t(
          "admin.rbacHrSaveNeedsAssignment",
          "Use the HR checkbox to choose clinics before saving HR access.",
        ),
      );
      return;
    }
    setUserErr(null);
    saveUserMut.mutate({ tabKeys: sorted });
  };

  const hrDialogClinics = useMemo(
    () =>
      assignableClinics.map((c) => ({
        id: c.id,
        label: formatClinicName(c, i18n.language),
      })),
    [assignableClinics, i18n.language],
  );

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

    if (
      key === "hr" &&
      canExtendUsers &&
      userTargetRole &&
      userTargetRole !== "hr_officer" &&
      userDraft.has("hr")
    ) {
      setUserDraft((prev) => {
        const n = new Set(prev);
        n.delete("hr");
        n.add("profile");
        return n;
      });
      for (const a of hrAssignmentsQ.data ?? []) {
        deleteHrAssignmentMut.mutate(a.id);
      }
      return;
    }

    if (
      key === "hr" &&
      canExtendUsers &&
      userTargetRole &&
      userTargetRole !== "hr_officer" &&
      !userDraft.has("hr")
    ) {
      if ((hrAssignmentsQ.data?.length ?? 0) > 0) {
        setUserDraft((prev) => {
          const n = new Set(prev);
          n.add("hr");
          n.add("profile");
          return n;
        });
        return;
      }
      openHrClinicDialog();
      return;
    }

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
                  ? "Grant or restrict tabs for a specific user. You can add organization tabs (e.g. HR) even when they are not part of the user's role. Enabling HR will prompt for the clinic where they act as HR."
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
                    saveUserNavTabs([...userDraft]);
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
                    saveUserNavTabs(fullRoleTabKeysSorted(userTargetRole, userRoleGrantQ.data?.tabKeys));
                  }}
                >
                  {t("admin.navTabsReset", "Use role defaults")}
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        {canManagePrivilegeGrants && isClinicAdminViewer ? (
          <div className="space-y-4 rounded-lg border border-border p-4">
            <div>
              <h3 className="text-sm font-medium">
                {t("admin.rbacHrAssignmentSection", "Clinic HR assignment")}
              </h3>
              <p className="text-xs text-muted-foreground">
                {t(
                  "admin.rbacHrAssignmentHintClinicAdmin",
                  "Assign this user as HR for your clinic. They receive full HR permissions scoped to that clinic only.",
                )}
              </p>
            </div>
            {!userTargetId ? (
              <p className="text-sm text-muted-foreground">
                {t("admin.rbacHrAssignmentPickUserFirst", "Select a user above to assign clinic HR roles.")}
              </p>
            ) : userTargetRole === "hr_officer" ? (
              <p className="text-sm text-muted-foreground">
                {t(
                  "admin.rbacHrAssignmentAlreadyOfficer",
                  "This user is already an organization HR officer and does not need a clinic assignment.",
                )}
              </p>
            ) : (
              <div className="space-y-4">
                {hrAssignErr ? <p className="text-sm text-destructive">{hrAssignErr}</p> : null}
                {hrAssignmentsQ.isSuccess && (hrAssignmentsQ.data?.length ?? 0) > 0 ? (
                  <ul className="space-y-2">
                    {(hrAssignmentsQ.data ?? []).map((a) => (
                      <li
                        key={a.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
                      >
                        <div>
                          <p className="font-medium">{a.clinicNameEn}</p>
                          <p className="text-xs text-muted-foreground">
                            {t("admin.rbacHrAssignmentActive", "HR for this clinic")}
                          </p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={deleteHrAssignmentMut.isPending}
                          onClick={() => deleteHrAssignmentMut.mutate(a.id)}
                        >
                          {t("admin.rbacHrAssignmentRemove", "Remove HR role")}
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : hrAssignmentsQ.isSuccess ? (
                  <p className="text-sm text-muted-foreground">
                    {t("admin.rbacHrAssignmentNone", "Not assigned as HR for any clinic yet.")}
                  </p>
                ) : null}

                {unassignedClinics.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {unassignedClinics.length === 1 ? (
                      <Button
                        type="button"
                        disabled={saveHrAssignmentMut.isPending}
                        onClick={() => assignHrForClinic(unassignedClinics[0]!.id)}
                      >
                        {t("admin.rbacHrAssignmentAssignClinic", "Assign as HR for {{clinic}}", {
                          clinic: formatClinicName(unassignedClinics[0]!, i18n.language),
                        })}
                      </Button>
                    ) : (
                      unassignedClinics.map((c) => (
                        <Button
                          key={c.id}
                          type="button"
                          variant="outline"
                          disabled={saveHrAssignmentMut.isPending}
                          onClick={() => assignHrForClinic(c.id)}
                        >
                          {t("admin.rbacHrAssignmentAssignClinicShort", "HR — {{clinic}}", {
                            clinic: formatClinicName(c, i18n.language),
                          })}
                        </Button>
                      ))
                    )}
                  </div>
                ) : hrAssignmentsQ.isSuccess ? (
                  <p className="text-xs text-muted-foreground">
                    {t("admin.rbacHrAssignmentAllClinics", "This user is already HR for all assignable clinics.")}
                  </p>
                ) : null}
              </div>
            )}
          </div>
        ) : null}

        {canExtendUsers ? (
          <Dialog
            open={hrAssignDialogOpen}
            onOpenChange={(open) => {
              setHrAssignDialogOpen(open);
              if (!open) {
                setHrAssignClinicIds(new Set());
                setHrAssignErr(null);
              }
            }}
          >
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{t("admin.rbacHrNavDialogTitle", "HR access — select clinics")}</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                {t(
                  "admin.rbacHrNavDialogHint",
                  "Choose one or more clinics where this user will have full HR permissions (employees, archive, hire with login).",
                )}
              </p>
              <div className="max-h-[min(50vh,20rem)] space-y-2 overflow-y-auto rounded-md border border-border p-3">
                {hrDialogClinics.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("admin.rbacHrDialogNoClinics", "No clinics available to assign.")}
                  </p>
                ) : (
                  hrDialogClinics.map((c) => (
                    <label
                      key={c.id}
                      className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-muted/50"
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 size-4 shrink-0 rounded border-input"
                        checked={hrAssignClinicIds.has(c.id)}
                        onChange={() => toggleHrClinicPick(c.id)}
                      />
                      <span className="text-sm leading-snug">{c.label}</span>
                    </label>
                  ))
                )}
              </div>
              {hrAssignErr ? <p className="text-sm text-destructive">{hrAssignErr}</p> : null}
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={hrDialogSubmitting}
                  onClick={() => setHrAssignDialogOpen(false)}
                >
                  {t("common.cancel", "Cancel")}
                </Button>
                <Button
                  type="button"
                  disabled={hrAssignClinicIds.size === 0 || hrDialogSubmitting}
                  onClick={() => void confirmHrClinicDialog()}
                >
                  {hrDialogSubmitting
                    ? t("common.saving", "Saving…")
                    : t("admin.rbacHrNavDialogConfirm", "Enable HR access")}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        ) : null}
      </CardContent>
    </Card>
  );
}
