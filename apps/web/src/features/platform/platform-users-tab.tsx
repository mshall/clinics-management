import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { PasswordInput } from "@/components/password-input";
import { ValidationIssuesDialog } from "@/components/validation-issues-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResponsiveTable } from "@/components/responsive-table";
import { apiGet, apiPatch, apiPost } from "@/lib/http";
import { formatUserRole } from "@/lib/locale-display";
import type { Paginated } from "@/lib/paginated";
import { apiErrorMessage, isClinicRequiredUserRole, isOrgWideUserRole, ORG_USER_ROLES, type PlatformUserRow, type TenantRow } from "@/features/platform/platform-shared";
import {
  ORG_USER_PASSWORD_MIN_LENGTH,
} from "@/features/platform/org-user-form-validation";
import { OrgHierarchyPanel } from "@/features/org-hierarchy/org-hierarchy-panel";
import { useValidationIssuesDialog } from "@/hooks/use-validation-issues-dialog";
import { collectOrgUserCreateIssues } from "@/lib/create-form-validation";

type UserDetail = PlatformUserRow;
type DialogMode = null | "create" | { edit: { userId: string; tenantId: string } };

export function PlatformUsersTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const [filterTenantId, setFilterTenantId] = useState("");
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);

  const [uTenantId, setUTenantId] = useState("");
  const [uEmail, setUEmail] = useState("");
  const [uPassword, setUPassword] = useState("");
  const [uName, setUName] = useState("");
  const [uRole, setURole] = useState<(typeof ORG_USER_ROLES)[number]>("CLINIC_ADMIN");
  const [uClinicIds, setUClinicIds] = useState<string[]>([]);
  const [userErr, setUserErr] = useState<string | null>(null);
  const createValidation = useValidationIssuesDialog({ intent: "create" });

  const editSelection = dialogMode && typeof dialogMode === "object" ? dialogMode.edit : null;
  const isCreate = dialogMode === "create";
  const isEdit = Boolean(editSelection);
  const dialogOpen = isCreate || isEdit;

  const tenantsQuery = useQuery({
    queryKey: ["platform", "tenants"],
    queryFn: () => apiGet<Paginated<TenantRow>>("/api/v1/admin/platform/tenants?page=1&pageSize=200&sortBy=name&sortOrder=asc"),
  });

  const usersQuery = useQuery({
    queryKey: ["platform", "all-users", filterTenantId],
    queryFn: () => {
      const q = filterTenantId ? `&tenantId=${encodeURIComponent(filterTenantId)}` : "";
      return apiGet<Paginated<PlatformUserRow>>(`/api/v1/admin/platform/users?page=1&pageSize=200${q}`);
    },
  });

  const tenantRows = tenantsQuery.data?.items ?? [];
  const userRows = usersQuery.data?.items ?? [];

  const activeTenantId = isEdit ? (editSelection?.tenantId ?? "") : uTenantId;

  const clinicsQuery = useQuery({
    queryKey: ["platform", "clinics", activeTenantId],
    queryFn: () => apiGet<{ id: string; nameEn: string; kind: string }[]>(`/api/v1/admin/platform/tenants/${activeTenantId}/clinics`),
    enabled: Boolean(activeTenantId) && dialogOpen,
  });

  const userDetailQuery = useQuery({
    queryKey: ["platform", "user", editSelection?.tenantId, editSelection?.userId],
    queryFn: () => apiGet<UserDetail>(`/api/v1/admin/platform/tenants/${editSelection!.tenantId}/users/${editSelection!.userId}`),
    enabled: isEdit && Boolean(editSelection?.tenantId && editSelection?.userId),
  });

  const clinicRows = clinicsQuery.data ?? [];

  useEffect(() => {
    if (!isEdit || !userDetailQuery.data) return;
    const u = userDetailQuery.data;
    setUEmail(u.email);
    setUName(u.displayName);
    setURole(u.role as (typeof ORG_USER_ROLES)[number]);
    setUClinicIds(u.clinicIds);
    setUPassword("");
  }, [isEdit, userDetailQuery.data]);

  useEffect(() => {
    if (isOrgWideUserRole(uRole)) {
      setUClinicIds([]);
    }
  }, [uRole]);

  const resetCreateForm = () => {
    setUTenantId("");
    setUEmail("");
    setUPassword("");
    setUName("");
    setURole("CLINIC_ADMIN");
    setUClinicIds([]);
    setUserErr(null);
  };

  const openCreate = () => {
    resetCreateForm();
    setDialogMode("create");
  };

  const closeDialog = () => {
    setDialogMode(null);
    setUserErr(null);
    setUPassword("");
  };

  const createMut = useMutation({
    mutationFn: () =>
      apiPost(`/api/v1/admin/platform/tenants/${uTenantId}/users`, {
        email: uEmail.trim(),
        password: uPassword,
        displayName: uName.trim(),
        role: uRole,
        ...(uClinicIds.length ? { clinicIds: uClinicIds } : {}),
      }),
    onSuccess: () => {
      setUserErr(null);
      closeDialog();
      void qc.invalidateQueries({ queryKey: ["platform"] });
      void qc.invalidateQueries({ queryKey: ["org-hierarchy"] });
    },
    onError: (e: unknown) => {
      setUserErr(apiErrorMessage(e));
      createValidation.showError(e);
    },
  });

  const patchMut = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        email: uEmail.trim(),
        displayName: uName.trim(),
        role: uRole,
      };
      if (uPassword.length >= 8) body.password = uPassword;
      body.clinicIds = uClinicIds;
      return apiPatch(
        `/api/v1/admin/platform/tenants/${editSelection!.tenantId}/users/${editSelection!.userId}`,
        body,
      );
    },
    onSuccess: () => {
      setUserErr(null);
      setUPassword("");
      closeDialog();
      void qc.invalidateQueries({ queryKey: ["platform"] });
      void qc.invalidateQueries({ queryKey: ["org-hierarchy"] });
    },
    onError: (e: unknown) => setUserErr(apiErrorMessage(e)),
  });

  const requiresClinicAssignment = isClinicRequiredUserRole(uRole);
  const showClinicAssignment = !isOrgWideUserRole(uRole) && Boolean(activeTenantId);
  const createFormValues = {
    email: uEmail,
    password: uPassword,
    displayName: uName,
    role: uRole,
    clinicIds: uClinicIds,
    tenantId: uTenantId,
  };
  const passwordTooShort = isCreate && uPassword.length > 0 && uPassword.length < ORG_USER_PASSWORD_MIN_LENGTH;
  const canSaveEdit =
    Boolean(uEmail.trim()) && Boolean(uName.trim()) && (!requiresClinicAssignment || uClinicIds.length > 0);

  const handleCreateUser = () => {
    if (createMut.isPending) return;
    const issues = collectOrgUserCreateIssues(createFormValues, t, { requireTenant: true });
    if (issues.length > 0) {
      createValidation.showIssues(issues);
      return;
    }
    createMut.mutate();
  };

  const handleSaveUser = () => {
    if (patchMut.isPending) return;
    patchMut.mutate();
  };

  const clinicLabel = useMemo(
    () => (row: PlatformUserRow) => (row.clinics.length ? row.clinics.map((c) => c.nameEn).join(", ") : "—"),
    [],
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{t("platform.tabs.usersList")}</CardTitle>
            <CardDescription>{t("platform.tabs.usersListHint")}</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <OrgHierarchyPanel
              scope="platform"
              tenantId={filterTenantId || undefined}
              selectedId={editSelection?.userId}
              onSelectNode={(node) => {
                if (node.nodeType === "user") {
                  const row = userRows.find((r) => r.id === node.id);
                  if (row?.tenantId) {
                    setDialogMode({ edit: { userId: node.id, tenantId: row.tenantId } });
                  }
                } else if (node.nodeType === "organization") {
                  setFilterTenantId(node.id);
                }
              }}
            />
            <Button type="button" onClick={openCreate}>
              {t("platform.tabs.newUser")}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="min-w-[12rem] max-w-xs space-y-2">
            <Label>{t("platform.tabs.filterOrg")}</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={filterTenantId}
              onChange={(e) => setFilterTenantId(e.target.value)}
            >
              <option value="">{t("platform.tabs.allOrgs")}</option>
              {tenantRows.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </div>

          {usersQuery.isPending ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : (
            <ResponsiveTable>
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-muted/60">
                  <tr>
                    <th className="px-3 py-2 text-start">{t("platform.orgName")}</th>
                    <th className="px-3 py-2 text-start">{t("admin.displayName")}</th>
                    <th className="px-3 py-2 text-start">{t("platform.username")}</th>
                    <th className="px-3 py-2 text-start">{t("admin.role")}</th>
                    <th className="px-3 py-2 text-start">{t("platform.assignClinics")}</th>
                  </tr>
                </thead>
                <tbody>
                  {userRows.map((row) => (
                    <tr
                      key={row.id}
                      className="cursor-pointer border-t border-border hover:bg-muted/40"
                      onClick={() => setDialogMode({ edit: { userId: row.id, tenantId: row.tenantId ?? "" } })}
                    >
                      <td className="px-3 py-2">{row.tenantName}</td>
                      <td className="px-3 py-2">{row.displayName}</td>
                      <td className="px-3 py-2">{row.email}</td>
                      <td className="px-3 py-2">{formatUserRole(row.role, t)}</td>
                      <td className="px-3 py-2 text-muted-foreground">{clinicLabel(row)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ResponsiveTable>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{isEdit ? t("platform.tabs.editUser") : t("platform.createUser")}</DialogTitle>
          </DialogHeader>

          {isEdit && userDetailQuery.isPending ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {isCreate ? (
                <div className="space-y-2 md:col-span-2">
                  <Label required>{t("platform.orgName")}</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={uTenantId}
                    onChange={(e) => {
                      setUTenantId(e.target.value);
                      setUClinicIds([]);
                    }}
                  >
                    <option value="">{t("platform.tabs.pickOrg")}</option>
                    {tenantRows.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="md:col-span-2 text-sm text-muted-foreground">
                  {t("platform.orgName")}:{" "}
                  <span className="font-medium text-foreground">{userDetailQuery.data?.tenantName}</span>
                </div>
              )}
              <div className="space-y-2">
                <Label required>{t("platform.username")}</Label>
                <Input type="email" value={uEmail} onChange={(e) => setUEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label required={isCreate}>{isEdit ? t("platform.newPasswordOptional") : t("auth.password")}</Label>
                <PasswordInput
                  value={uPassword}
                  onChange={setUPassword}
                  placeholder={isEdit ? t("platform.leaveBlankPassword") : undefined}
                  requirePromptToEdit={isEdit}
                />
                {isCreate ? (
                  <p className={`text-xs ${passwordTooShort ? "text-destructive" : "text-muted-foreground"}`}>
                    {t("admin.orgUserPasswordMinHint", "Temporary password must be at least 8 characters.")}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label required>{t("admin.displayName")}</Label>
                <Input value={uName} onChange={(e) => setUName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t("admin.role")}</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={uRole}
                  onChange={(e) => setURole(e.target.value as (typeof ORG_USER_ROLES)[number])}
                >
                  {ORG_USER_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {formatUserRole(r, t)}
                    </option>
                  ))}
                </select>
              </div>
              {showClinicAssignment ? (
                <div className="space-y-2 md:col-span-2">
                  <Label required={requiresClinicAssignment}>{t("platform.assignClinics")}</Label>
                  <p className="text-xs text-muted-foreground">
                    {requiresClinicAssignment
                      ? t("admin.assignedClinicsRequiredHint", "Select at least one clinic for this role.")
                      : t(
                          "admin.assignedClinicsOptionalHint",
                          "Optional — assign the clinic or branch this user primarily works at.",
                        )}
                  </p>
                  {clinicsQuery.isPending ? (
                    <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {clinicRows.map((c) => {
                        const on = uClinicIds.includes(c.id);
                        return (
                          <Button
                            key={c.id}
                            type="button"
                            size="sm"
                            variant={on ? "default" : "outline"}
                            onClick={() => setUClinicIds((ids) => (on ? ids.filter((x) => x !== c.id) : [...ids, c.id]))}
                          >
                            {c.nameEn}
                          </Button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : isOrgWideUserRole(uRole) ? (
                <p className="text-xs text-muted-foreground md:col-span-2">
                  {t(
                    "admin.orgWideRoleClinicHint",
                    "This role works across the whole organization — no clinic assignment is required.",
                  )}
                </p>
              ) : isCreate && !uTenantId ? (
                <p className="text-sm text-muted-foreground md:col-span-2">{t("platform.tabs.pickOrgFirst")}</p>
              ) : null}
              <div className="md:col-span-2 flex flex-wrap gap-2 pt-2">
                <Button
                  type="button"
                  disabled={isCreate ? createMut.isPending : !canSaveEdit || patchMut.isPending}
                  onClick={() => (isCreate ? handleCreateUser() : handleSaveUser())}
                >
                  {isEdit ? t("platform.saveUser") : t("platform.createUserBtn")}
                </Button>
                <Button type="button" variant="outline" onClick={closeDialog}>
                  {t("common.cancel")}
                </Button>
              </div>
              {userErr ? <p className="md:col-span-2 text-sm text-destructive">{userErr}</p> : null}
            </div>
          )}
        </DialogContent>
      </Dialog>
      <ValidationIssuesDialog {...createValidation.dialogProps} />
    </div>
  );
}
