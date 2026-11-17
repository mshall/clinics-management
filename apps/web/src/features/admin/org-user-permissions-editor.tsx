import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useClinicsQuery } from "@/lib/api-hooks";
import { apiErrorMessage } from "@/lib/api-error-message";
import { ApiError, apiDelete, apiGet, apiPatch, apiPut } from "@/lib/http";
import type { NavTabAccessMode } from "@/lib/nav-tab-access-policy";
import type { NavItemKey } from "@/lib/nav-policy";
import {
  canCustomizeOrgRoleNavTabs,
  canExtendUserNavTabs,
  canManageOrgUserNavTabs,
  organizationNavKeySet,
  organizationNavOrderedKeys,
  roleNavKeysForRole,
} from "@/lib/nav-policy";
import { formatClinicName, formatUserRole } from "@/lib/locale-display";
import {
  MONEY_ACCESS_OVERRIDE_I18N,
  MONEY_ACCESS_OVERRIDE_OPTIONS,
  normalizeMoneyAccessOverride,
  type MoneyAccessOverride,
} from "@/lib/money-access-override";
import type { MoneyVisibilityOverrides } from "@/lib/money-visibility-policy";
import { nativeSelectClassName } from "@/lib/form-control-styles";
import type { DemoRole } from "@/lib/roles";
import { useAuthStore } from "@/stores/auth-store";
import { Label } from "@/components/ui/label";
import { NavTabChecklist, NAV_TAB_I18N } from "@/features/admin/org-nav-tab-checklist";
import { orgUserRolesForEdit } from "@/features/platform/platform-shared";
import {
  AdminOrgUserRoleChangeConfirmDialog,
  type OrgUserRoleChangeTarget,
} from "@/features/admin/admin-org-user-role-change-confirm-dialog";
import { mapApiRole } from "@/lib/roles";

type UserClinicHrAssignmentDto = {
  id: string;
  userId: string;
  clinicId: string;
  clinicNameEn: string;
};

function apiRoleParam(role: DemoRole): string {
  return role.toUpperCase();
}

function fullRoleTabKeysSorted(role: DemoRole, roleNavTabKeys?: string[] | null): string[] {
  return [...roleNavKeysForRole(role, roleNavTabKeys)].sort((a, b) => a.localeCompare(b));
}

export type OrgUserPermissionsEditorProps = {
  userId: string;
  userRole: DemoRole;
  displayName?: string;
  /** When false, hide HR assignment block (embedded in compact layouts). */
  showHrAssignmentSection?: boolean;
  /** Called after primary role is saved (API uppercase role, e.g. PHYSICIAN). */
  onPrimaryRoleChanged?: (roleApi: string) => void;
};

export function OrgUserPermissionsEditor({
  userId,
  userRole,
  displayName,
  showHrAssignmentSection = true,
  onPrimaryRoleChanged,
}: OrgUserPermissionsEditorProps) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const viewer = useAuthStore((s) => s.user);
  const canManagePrivilegeGrants = canManageOrgUserNavTabs(viewer?.role);
  const canEditMoneyVisibility = canManagePrivilegeGrants && userRole !== "group_admin";
  const canCustomizeRoles = canCustomizeOrgRoleNavTabs(viewer?.role);
  const canExtendUsers = canExtendUserNavTabs(viewer?.role);
  const canChangePrimaryRole = viewer?.role === "group_admin" && viewer.id !== userId;
  const isClinicAdminViewer = viewer?.role === "clinic_admin";
  const [roleDraft, setRoleDraft] = useState<DemoRole>(userRole);
  const [roleConfirmOpen, setRoleConfirmOpen] = useState(false);
  const rolePreviewActive = roleDraft !== userRole;
  const { data: viewerClinics = [] } = useClinicsQuery();
  const viewerClinicIds = useMemo(() => viewerClinics.map((c) => c.id), [viewerClinics]);
  const assignableClinics = useMemo(() => {
    if (!isClinicAdminViewer) return viewerClinics;
    return viewerClinics.filter((c) => viewerClinicIds.includes(c.id));
  }, [viewerClinics, isClinicAdminViewer, viewerClinicIds]);

  const organizationOrderedKeys = useMemo(() => organizationNavOrderedKeys(), []);
  const organizationTabSet = useMemo(() => organizationNavKeySet(), []);

  const [userDraft, setUserDraft] = useState<Set<NavItemKey>>(() => new Set());
  const [tabAccessModesDraft, setTabAccessModesDraft] = useState<Record<string, NavTabAccessMode>>({});
  const [userErr, setUserErr] = useState<string | null>(null);
  const [moneyDraft, setMoneyDraft] = useState<MoneyVisibilityOverrides>({
    operations: "ROLE_DEFAULT",
    encounters: "ROLE_DEFAULT",
    appointments: "ROLE_DEFAULT",
  });
  const [moneyErr, setMoneyErr] = useState<string | null>(null);
  const [moneySaveBanner, setMoneySaveBanner] = useState<"ok" | null>(null);
  const moneyDraftSeedRef = useRef("");
  const previewGrantFingerprintRef = useRef("");

  useEffect(() => {
    setRoleDraft(userRole);
    previewGrantFingerprintRef.current = "";
  }, [userRole, userId]);

  const userRoleGrantQ = useQuery({
    queryKey: ["tenant-role-nav-tabs", userRole],
    queryFn: () => apiGet<{ tabKeys: string[] | null }>(`/api/v1/admin/role-nav-tabs/${apiRoleParam(userRole)}`),
    enabled: canCustomizeRoles && Boolean(userRole),
  });

  const draftRoleGrantQ = useQuery({
    queryKey: ["tenant-role-nav-tabs", roleDraft],
    queryFn: () => apiGet<{ tabKeys: string[] | null }>(`/api/v1/admin/role-nav-tabs/${apiRoleParam(roleDraft)}`),
    enabled: canCustomizeRoles && Boolean(roleDraft),
  });

  const userGrantQ = useQuery({
    queryKey: ["user-nav-tabs", userId],
    queryFn: () =>
      apiGet<{
        tabKeys: string[] | null;
        tabAccessModes?: Record<string, NavTabAccessMode> | null;
        roleTabKeys?: string[];
      }>(`/api/v1/user-nav-tabs/${userId}`),
    enabled: Boolean(userId),
  });

  const userDetailQ = useQuery({
    queryKey: ["admin", "user-detail", userId],
    queryFn: () =>
      apiGet<{ additionalRoles: string[]; role: string; email: string; displayName: string }>(
        `/api/v1/admin/users/${userId}`,
      ),
    enabled: Boolean(userId) && canManagePrivilegeGrants,
  });
  const [extraRolesDraft, setExtraRolesDraft] = useState<Set<DemoRole>>(new Set());
  useEffect(() => {
    const extras = userDetailQ.data?.additionalRoles ?? [];
    setExtraRolesDraft(new Set(extras.map((r) => r.toLowerCase() as DemoRole)));
  }, [userDetailQ.data?.additionalRoles]);

  const saveRolesMut = useMutation({
    mutationFn: () =>
      apiPatch(`/api/v1/admin/users/${userId}/roles`, {
        additionalRoles: [...extraRolesDraft].map((r) => r.toUpperCase()),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin", "user-detail", userId] });
      toast.success(t("admin.additionalRolesSave", "Save additional roles"));
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const moneyVisQ = useQuery({
    queryKey: ["user-money-visibility", userId],
    queryFn: () => apiGet<MoneyVisibilityOverrides>(`/api/v1/user-money-visibility/${userId}`),
    enabled: canEditMoneyVisibility && Boolean(userId),
  });

  const applyDefaultsForRoleDraft = (draftRole: DemoRole, roleTabKeys?: string[] | null) => {
    const keys = roleNavKeysForRole(draftRole, roleTabKeys);
    setUserDraft(new Set(keys));
    setMoneyDraft({
      operations: "ROLE_DEFAULT",
      encounters: "ROLE_DEFAULT",
      appointments: "ROLE_DEFAULT",
    });
    setExtraRolesDraft(new Set());
    userDraftSeedRef.current = `preview:${draftRole}`;
    moneyDraftSeedRef.current = `preview:${draftRole}`;
    setUserErr(null);
    setMoneyErr(null);
    setMoneySaveBanner(null);
  };

  const onPrimaryRoleDraftChange = (roleApi: string) => {
    const demo = mapApiRole(roleApi);
    setRoleDraft(demo);
    previewGrantFingerprintRef.current = "";
    applyDefaultsForRoleDraft(demo, null);
  };

  useEffect(() => {
    if (!rolePreviewActive) return;
    if (!draftRoleGrantQ.isSuccess) return;
    const fp = `${roleDraft}:${JSON.stringify(draftRoleGrantQ.data?.tabKeys ?? null)}`;
    if (previewGrantFingerprintRef.current === fp) return;
    previewGrantFingerprintRef.current = fp;
    applyDefaultsForRoleDraft(roleDraft, draftRoleGrantQ.data?.tabKeys);
  }, [rolePreviewActive, roleDraft, draftRoleGrantQ.isSuccess, draftRoleGrantQ.data?.tabKeys]);

  const applyPrimaryRoleMut = useMutation({
    mutationFn: () =>
      apiPatch<{ role: string }>(`/api/v1/admin/users/${userId}`, { role: apiRoleParam(roleDraft) }),
    onSuccess: async (data) => {
      const nextApi = data.role ?? apiRoleParam(roleDraft);
      onPrimaryRoleChanged?.(nextApi);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin", "user-detail", userId] }),
        qc.invalidateQueries({ queryKey: ["admin", "org-user", userId] }),
        qc.invalidateQueries({ queryKey: ["user-nav-tabs", userId] }),
        qc.invalidateQueries({ queryKey: ["user-money-visibility", userId] }),
        qc.invalidateQueries({ queryKey: ["user-clinic-hr-assignments", userId] }),
        qc.invalidateQueries({ queryKey: ["admin", "org-users"] }),
      ]);
      userDraftSeedRef.current = "";
      moneyDraftSeedRef.current = "";
      setRoleConfirmOpen(false);
      toast.success(t("admin.orgUserRoleChangeSuccess", "Primary role updated."));
      if (userId === viewer?.id) await useAuthStore.getState().refreshSessionFromServer();
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const roleChangeTarget: OrgUserRoleChangeTarget | null =
    rolePreviewActive && userDetailQ.data
      ? {
          userId,
          displayName: displayName?.trim() || userDetailQ.data.displayName || userId,
          email: userDetailQ.data.email,
          fromRole: userRole,
          toRole: roleDraft,
        }
      : null;

  const savedRoleApi = userDetailQ.data?.role ?? apiRoleParam(userRole);
  const assignablePrimaryRoles = orgUserRolesForEdit(savedRoleApi);

  useEffect(() => {
    if (!canEditMoneyVisibility || !moneyVisQ.isSuccess) return;
    if (rolePreviewActive) return;
    const seed = `${userId}:${JSON.stringify(moneyVisQ.data)}`;
    if (moneyDraftSeedRef.current === seed) return;
    moneyDraftSeedRef.current = seed;
    setMoneyDraft({
      operations: normalizeMoneyAccessOverride(moneyVisQ.data.operations),
      encounters: normalizeMoneyAccessOverride(moneyVisQ.data.encounters),
      appointments: normalizeMoneyAccessOverride(moneyVisQ.data.appointments),
    });
  }, [canEditMoneyVisibility, userId, moneyVisQ.isSuccess, moneyVisQ.data, rolePreviewActive]);

  const effectiveRoleForNav = roleDraft;
  const effectiveRoleGrantQ = rolePreviewActive ? draftRoleGrantQ : userRoleGrantQ;

  const userRoleBase = useMemo(() => {
    const roleTabs = canCustomizeRoles
      ? effectiveRoleGrantQ.data?.tabKeys
      : userGrantQ.data?.roleTabKeys;
    return roleNavKeysForRole(effectiveRoleForNav, roleTabs);
  }, [canCustomizeRoles, effectiveRoleForNav, effectiveRoleGrantQ.data?.tabKeys, userGrantQ.data?.roleTabKeys]);

  const userGrantFingerprint = userGrantQ.data ? JSON.stringify(userGrantQ.data.tabKeys ?? null) : "";
  const userDraftSeedRef = useRef("");

  useEffect(() => {
    if (!userId) {
      setUserDraft(new Set());
      userDraftSeedRef.current = "";
      return;
    }
    if (rolePreviewActive) return;
    if (!userGrantQ.isSuccess) return;
    if (canCustomizeRoles && !userRoleGrantQ.isSuccess) return;
    if (!canCustomizeRoles && !userGrantQ.isSuccess) return;

    const seedKey = `${userId}:${userRole}:${userGrantFingerprint}:${canCustomizeRoles ? JSON.stringify(userRoleGrantQ.data?.tabKeys ?? null) : JSON.stringify(userGrantQ.data?.roleTabKeys ?? null)}`;
    if (userDraftSeedRef.current === seedKey) return;
    userDraftSeedRef.current = seedKey;

    const roleEffective = canCustomizeRoles
      ? roleNavKeysForRole(userRole, userRoleGrantQ.data?.tabKeys)
      : roleNavKeysForRole(userRole, userGrantQ.data?.roleTabKeys);
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
    setTabAccessModesDraft(userGrantQ.data?.tabAccessModes ?? {});
  }, [
    userId,
    userRole,
    userGrantFingerprint,
    userGrantQ.isSuccess,
    userGrantQ.data?.tabKeys,
    canCustomizeRoles,
    userRoleGrantQ.isSuccess,
    userRoleGrantQ.data?.tabKeys,
    organizationTabSet,
    rolePreviewActive,
  ]);

  const saveMoneyMut = useMutation({
    mutationFn: (body: MoneyVisibilityOverrides) =>
      apiPut<MoneyVisibilityOverrides>(`/api/v1/user-money-visibility/${userId}`, body),
    onSuccess: async (data) => {
      setMoneyErr(null);
      setMoneySaveBanner("ok");
      setMoneyDraft(data);
      moneyDraftSeedRef.current = `${userId}:${JSON.stringify(data)}`;
      qc.setQueryData(["user-money-visibility", userId], data);
      toast.success(t("admin.moneyVisibilitySaveSuccess", "Money visibility saved."));
      await qc.invalidateQueries({ queryKey: ["user-money-visibility", userId] });
      if (userId === viewer?.id) await useAuthStore.getState().refreshSessionFromServer();
      window.setTimeout(() => setMoneySaveBanner(null), 4000);
    },
    onError: (e: unknown) => {
      const msg = apiErrorMessage(e, t);
      setMoneySaveBanner(null);
      setMoneyErr(msg);
      toast.error(msg);
    },
  });

  const saveUserMut = useMutation({
    mutationFn: (payload: {
      tabKeys: string[];
      hrClinicId?: string;
      tabAccessModes?: Record<string, NavTabAccessMode>;
    }) => apiPut<{ tabKeys: string[] | null }>(`/api/v1/user-nav-tabs/${userId}`, payload),
    onSuccess: async () => {
      setUserErr(null);
      setHrAssignDialogOpen(false);
      setHrAssignClinicIds(new Set());
      await qc.invalidateQueries({ queryKey: ["user-nav-tabs", userId] });
      await qc.invalidateQueries({ queryKey: ["user-clinic-hr-assignments", userId] });
      if (userId === viewer?.id) {
        await useAuthStore.getState().refreshSessionFromServer();
      } else {
        toast.success(
          t("admin.navTabsSavedReloginHint", "Tab permissions saved. The user should sign in again to see changes."),
        );
      }
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
    queryKey: ["user-clinic-hr-assignments", userId],
    queryFn: () =>
      apiGet<UserClinicHrAssignmentDto[]>(
        `/api/v1/admin/user-clinic-hr-assignments?userId=${encodeURIComponent(userId)}`,
      ),
    enabled: canManagePrivilegeGrants && Boolean(userId),
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
        userId,
        clinicId,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["user-clinic-hr-assignments", userId] });
      if (userId === viewer?.id) await useAuthStore.getState().refreshSessionFromServer();
    },
  });

  const deleteHrAssignmentMut = useMutation({
    mutationFn: (assignmentId: string) =>
      apiDelete<{ ok: true }>(`/api/v1/admin/user-clinic-hr-assignments/${assignmentId}`),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["user-clinic-hr-assignments", userId] });
      if (userId === viewer?.id) await useAuthStore.getState().refreshSessionFromServer();
    },
  });

  const openHrClinicDialog = () => {
    const preselect = new Set<string>();
    if (unassignedClinics.length === 1) preselect.add(unassignedClinics[0]!.id);
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
    if (!userId || hrAssignClinicIds.size === 0) return;
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
    if (!userId || !clinicId) return;
    saveHrAssignmentMut.mutate(clinicId, {
      onError: (e: unknown) => {
        setHrAssignErr(e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e));
      },
    });
  };

  const saveUserNavTabs = (tabKeys: string[]) => {
    const sorted = [...tabKeys].sort((a, b) => a.localeCompare(b));
    if (
      sorted.includes("hr") &&
      canExtendUsers &&
      effectiveRoleForNav !== "hr_officer" &&
      (hrAssignmentsQ.data?.length ?? 0) === 0
    ) {
      setUserErr(
        t("admin.rbacHrSaveNeedsAssignment", "Use the HR checkbox to choose clinics before saving HR access."),
      );
      return;
    }
    setUserErr(null);
    const tabAccessModes: Record<string, NavTabAccessMode> = {};
    for (const k of sorted) {
      if (k === "profile") continue;
      tabAccessModes[k] = tabAccessModesDraft[k] ?? "write";
    }
    saveUserMut.mutate({ tabKeys: sorted, tabAccessModes });
  };

  const toggleUser = (key: NavItemKey) => {
    if (key === "profile") return;

    if (key === "hr" && canExtendUsers && effectiveRoleForNav !== "hr_officer" && userDraft.has("hr")) {
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

    if (key === "hr" && canExtendUsers && effectiveRoleForNav !== "hr_officer" && !userDraft.has("hr")) {
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
      const removing = n.has(key);
      if (removing) n.delete(key);
      else n.add(key);
      n.add("profile");
      setTabAccessModesDraft((modes) => {
        const next = { ...modes };
        if (removing) delete next[key];
        else next[key] = modes[key] ?? "write";
        return next;
      });
      return n;
    });
  };

  const userIsFullRole =
    userDraft.size === userRoleBase.size && [...userRoleBase].every((k) => userDraft.has(k));

  const extraBeyondRole = useMemo(() => {
    const extras: NavItemKey[] = [];
    for (const k of userDraft) {
      if (k !== "profile" && !userRoleBase.has(k)) extras.push(k);
    }
    return extras.sort((a, b) => a.localeCompare(b));
  }, [userDraft, userRoleBase]);

  const hrDialogClinics = useMemo(
    () => assignableClinics.map((c) => ({ id: c.id, label: formatClinicName(c, i18n.language) })),
    [assignableClinics, i18n.language],
  );

  if (!canManageOrgUserNavTabs(viewer?.role)) {
    return null;
  }

  return (
    <div className="space-y-4">
      {canChangePrimaryRole ? (
        <section className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
          <div>
            <p className="text-sm font-semibold">{t("admin.orgUserPrimaryRoleTitle", "Primary role type")}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t(
                "admin.orgUserPrimaryRoleHint",
                "Choose a new role to preview default access below. Confirm to apply — this resets custom permissions to the new role’s defaults.",
              )}
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Label htmlFor="org-user-primary-role">{t("admin.role", "Role")}</Label>
              <select
                id="org-user-primary-role"
                className={nativeSelectClassName}
                value={apiRoleParam(roleDraft)}
                disabled={applyPrimaryRoleMut.isPending || userDetailQ.isPending}
                onChange={(e) => onPrimaryRoleDraftChange(e.target.value)}
              >
                {assignablePrimaryRoles.map((r) => (
                  <option key={r} value={r}>
                    {formatUserRole(mapApiRole(r), t)}
                  </option>
                ))}
              </select>
            </div>
            <Button
              type="button"
              disabled={!rolePreviewActive || applyPrimaryRoleMut.isPending || !userDetailQ.data}
              onClick={() => setRoleConfirmOpen(true)}
            >
              {t("admin.orgUserPrimaryRoleConfirm", "Confirm role change")}
            </Button>
          </div>
          {rolePreviewActive ? (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-100">
              {t(
                "admin.orgUserPrimaryRolePreview",
                "Previewing defaults for {{role}}. Nothing is saved until you confirm.",
                { role: formatUserRole(roleDraft, t) },
              )}
            </p>
          ) : null}
        </section>
      ) : null}

      <AdminOrgUserRoleChangeConfirmDialog
        open={roleConfirmOpen}
        onOpenChange={setRoleConfirmOpen}
        target={roleChangeTarget}
        pending={applyPrimaryRoleMut.isPending}
        onConfirm={() => applyPrimaryRoleMut.mutate()}
      />

      <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
        <p className="font-medium">
          {displayName?.trim() || t("admin.orgUserAccessTarget", "This user")}
          <span className="ms-2 font-normal text-muted-foreground">
            · {formatUserRole(rolePreviewActive ? roleDraft : userRole, t)}
            {rolePreviewActive ? (
              <span className="ms-1 text-amber-700 dark:text-amber-300">
                ({t("admin.orgUserRolePreviewBadge", "preview")})
              </span>
            ) : null}
          </span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {canExtendUsers
            ? t(
                "admin.orgUserAccessHint",
                "Upgrade or downgrade sidebar access. Check extra modules beyond this role, or uncheck to restrict. Save role defaults to remove personal overrides.",
              )
            : t(
                "admin.orgUserAccessHintClinicAdmin",
                "Adjust tabs within this role. Organization-wide extras require a group administrator.",
              )}
        </p>
        {extraBeyondRole.length > 0 ? (
          <p className="mt-2 text-xs">
            <span className="text-muted-foreground">{t("admin.orgUserExtraTabs", "Extra vs role")}: </span>
            {extraBeyondRole.map((k) => t(NAV_TAB_I18N[k])).join(", ")}
          </p>
        ) : null}
      </div>

      {userGrantQ.isError ? (
        <p className="text-sm text-destructive">{userGrantQ.error instanceof Error ? userGrantQ.error.message : t("common.error")}</p>
      ) : null}
      {userErr ? <p className="text-sm text-destructive">{userErr}</p> : null}

      {userGrantQ.isPending ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : userGrantQ.isSuccess && (canCustomizeRoles ? effectiveRoleGrantQ.isSuccess : true) ? (
        <>
          <NavTabChecklist
            orderedKeys={organizationOrderedKeys}
            draft={userDraft}
            onToggle={toggleUser}
            allowedKeys={canExtendUsers ? undefined : userRoleBase}
          />
          {[...userDraft]
            .filter((k) => k !== "profile")
            .sort((a, b) => a.localeCompare(b))
            .map((key) => (
              <div
                key={key}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
              >
                <span>{t(NAV_TAB_I18N[key])}</span>
                <select
                  className={nativeSelectClassName}
                  value={tabAccessModesDraft[key] ?? "write"}
                  onChange={(e) =>
                    setTabAccessModesDraft((prev) => ({
                      ...prev,
                      [key]: e.target.value === "read" ? "read" : "write",
                    }))
                  }
                >
                  <option value="write">{t("admin.navTabAccessWrite", "Full access (view and edit)")}</option>
                  <option value="read">{t("admin.navTabAccessRead", "View only")}</option>
                </select>
              </div>
            ))}
        </>
      ) : null}

      <p className="text-xs text-muted-foreground">
        {userIsFullRole
          ? t("admin.navTabsFullRoleHint", "Saving with all tabs checked removes the custom override.")
          : canExtendUsers
            ? t("admin.orgUserDowngradeHint", "Unchecked tabs hide sections even if the role normally includes them.")
            : null}
      </p>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={!userId || saveUserMut.isPending || userGrantQ.isPending}
          onClick={() => saveUserNavTabs([...userDraft])}
        >
          {t("admin.navTabsSave", "Save user permissions")}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!userId || saveUserMut.isPending || userGrantQ.isPending}
          onClick={() =>
            saveUserNavTabs(fullRoleTabKeysSorted(effectiveRoleForNav, effectiveRoleGrantQ.data?.tabKeys))
          }
        >
          {t("admin.navTabsReset", "Use role defaults")}
        </Button>
      </div>

      {canEditMoneyVisibility ? (
        <div className="space-y-3 rounded-lg border border-border p-3">
          <div>
            <p className="text-sm font-medium">{t("admin.moneyVisibilityTitle", "Money visibility")}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t(
                "admin.moneyVisibilityHint",
                "Control whether this user sees fee and balance amounts. Fee editing still follows role rules; this only affects visibility. Click Save money visibility to apply changes.",
              )}
            </p>
          </div>
          {moneyVisQ.isError ? (
            <p className="text-sm text-destructive">
              {moneyVisQ.error instanceof Error ? moneyVisQ.error.message : t("common.error")}
            </p>
          ) : null}
          {moneySaveBanner === "ok" ? (
            <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-900 dark:text-emerald-100" role="status">
              {t("admin.moneyVisibilitySaveSuccess", "Money visibility saved.")}
            </p>
          ) : null}
          {moneyErr ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
              {moneyErr}
            </p>
          ) : null}
          {moneyVisQ.isPending ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : moneyVisQ.isSuccess ? (
            <div className="grid gap-4 sm:grid-cols-3">
              {(
                [
                  ["operations", t("admin.moneyVisibilityOperations", "Operations")],
                  ["encounters", t("admin.moneyVisibilityEncounters", "Encounters")],
                  ["appointments", t("admin.moneyVisibilityAppointments", "Appointments")],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="space-y-1.5">
                  <Label>{label}</Label>
                  <select
                    className={nativeSelectClassName}
                    value={moneyDraft[key]}
                    disabled={saveMoneyMut.isPending}
                    onChange={(e) => {
                      const next = e.target.value as MoneyAccessOverride;
                      setMoneyDraft((prev) => ({ ...prev, [key]: next }));
                    }}
                  >
                    {MONEY_ACCESS_OVERRIDE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {t(MONEY_ACCESS_OVERRIDE_I18N[opt], opt)}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={!moneyVisQ.isSuccess || saveMoneyMut.isPending}
              onClick={() => {
                setMoneySaveBanner(null);
                setMoneyErr(null);
                saveMoneyMut.mutate(moneyDraft);
              }}
            >
              {saveMoneyMut.isPending
                ? t("common.saving", "Saving…")
                : t("admin.moneyVisibilitySave", "Save money visibility")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!moneyVisQ.isSuccess || saveMoneyMut.isPending}
              onClick={() => {
                setMoneySaveBanner(null);
                setMoneyErr(null);
                saveMoneyMut.mutate({
                  operations: "ROLE_DEFAULT",
                  encounters: "ROLE_DEFAULT",
                  appointments: "ROLE_DEFAULT",
                });
              }}
            >
              {saveMoneyMut.isPending
                ? t("common.saving", "Saving…")
                : t("admin.moneyVisibilityReset", "Use role defaults")}
            </Button>
          </div>
        </div>
      ) : null}

      {showHrAssignmentSection && canManagePrivilegeGrants && isClinicAdminViewer ? (
        <div className="space-y-3 rounded-lg border border-border p-3">
          <p className="text-sm font-medium">{t("admin.rbacHrAssignmentSection", "Clinic HR assignment")}</p>
          {effectiveRoleForNav === "hr_officer" ? (
            <p className="text-sm text-muted-foreground">
              {t("admin.rbacHrAssignmentAlreadyOfficer", "This user is already an organization HR officer.")}
            </p>
          ) : (
            <>
              {hrAssignErr ? <p className="text-sm text-destructive">{hrAssignErr}</p> : null}
              {(hrAssignmentsQ.data ?? []).map((a) => (
                <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>{a.clinicNameEn}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={deleteHrAssignmentMut.isPending}
                    onClick={() => deleteHrAssignmentMut.mutate(a.id)}
                  >
                    {t("admin.rbacHrAssignmentRemove", "Remove HR role")}
                  </Button>
                </div>
              ))}
              {unassignedClinics.map((c) => (
                <Button key={c.id} type="button" size="sm" variant="outline" onClick={() => assignHrForClinic(c.id)}>
                  {t("admin.rbacHrAssignmentAssignClinicShort", "HR — {{clinic}}", {
                    clinic: formatClinicName(c, i18n.language),
                  })}
                </Button>
              ))}
            </>
          )}
        </div>
      ) : null}

      {canExtendUsers ? (
        <Dialog open={hrAssignDialogOpen} onOpenChange={setHrAssignDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{t("admin.rbacHrNavDialogTitle", "HR access — select clinics")}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              {t(
                "admin.rbacHrNavDialogHint",
                "Choose clinics where this user will have full HR permissions.",
              )}
            </p>
            <div className="max-h-[min(50vh,20rem)] space-y-2 overflow-y-auto rounded-md border border-border p-3">
              {hrDialogClinics.map((c) => (
                <label key={c.id} className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-muted/50">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 shrink-0 rounded border-input"
                    checked={hrAssignClinicIds.has(c.id)}
                    onChange={() => toggleHrClinicPick(c.id)}
                  />
                  <span className="text-sm leading-snug">{c.label}</span>
                </label>
              ))}
            </div>
            {hrAssignErr ? <p className="text-sm text-destructive">{hrAssignErr}</p> : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" disabled={hrDialogSubmitting} onClick={() => setHrAssignDialogOpen(false)}>
                {t("common.cancel", "Cancel")}
              </Button>
              <Button
                type="button"
                disabled={hrAssignClinicIds.size === 0 || hrDialogSubmitting}
                onClick={() => void confirmHrClinicDialog()}
              >
                {hrDialogSubmitting ? t("common.saving", "Saving…") : t("admin.rbacHrNavDialogConfirm", "Enable HR access")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
      {canManagePrivilegeGrants ? (
        <section className="space-y-3 rounded-lg border p-4">
          <h3 className="text-sm font-semibold">{t("admin.additionalRolesTitle", "Additional roles")}</h3>
          <p className="text-xs text-muted-foreground">
            {t("admin.additionalRolesHint", "Extra capabilities alongside the primary role (plan limits apply).")}
          </p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                "group_admin",
                "physician",
                "receptionist",
                "finance_officer",
                "clinic_admin",
              ] as DemoRole[]
            )
              .filter((r) => r !== userRole)
              .map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`rounded-full border px-3 py-1 text-xs ${
                    extraRolesDraft.has(r) ? "border-primary bg-primary/10" : "border-muted"
                  }`}
                  onClick={() => {
                    const next = new Set(extraRolesDraft);
                    if (next.has(r)) next.delete(r);
                    else next.add(r);
                    setExtraRolesDraft(next);
                  }}
                >
                  {formatUserRole(r, t)}
                </button>
              ))}
          </div>
          <Button type="button" size="sm" disabled={saveRolesMut.isPending} onClick={() => saveRolesMut.mutate()}>
            {t("admin.additionalRolesSave", "Save additional roles")}
          </Button>
        </section>
      ) : null}
    </div>
  );
}