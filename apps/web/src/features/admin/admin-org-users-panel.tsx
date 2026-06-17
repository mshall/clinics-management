import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { PasswordInput } from "@/components/password-input";
import { ResponsiveTable } from "@/components/responsive-table";
import { TablePagination } from "@/components/table-pagination";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useClinicsQuery } from "@/lib/api-hooks";
import { apiDelete, apiGet, apiPatch, apiPost, ApiError } from "@/lib/http";
import { formatClinicName, formatUserRole } from "@/lib/locale-display";
import type { Paginated } from "@/lib/paginated";
import { apiErrorMessage, ORG_USER_ROLES } from "@/features/platform/platform-shared";
import { useAuthStore } from "@/stores/auth-store";

type OrgUserRow = {
  id: string;
  email: string;
  displayName: string;
  role: string;
  createdAt: string;
  clinicIds: string[];
  clinics: { id: string; nameEn: string }[];
};

type UserDetail = OrgUserRow & { tenantId: string | null; tenantName: string | null };

type DialogMode = null | "create" | { edit: string };

export function AdminOrgUsersPanel() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const authUser = useAuthStore((s) => s.user);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);

  const [uEmail, setUEmail] = useState("");
  const [uPassword, setUPassword] = useState("");
  const [uName, setUName] = useState("");
  const [uRole, setURole] = useState<(typeof ORG_USER_ROLES)[number]>("NURSE");
  const [uClinicIds, setUClinicIds] = useState<string[]>([]);
  const [userErr, setUserErr] = useState<string | null>(null);
  const [legacyUsersApi, setLegacyUsersApi] = useState(false);

  async function fetchLegacyOrgUsers(pageNum: number, size: number, q: string): Promise<Paginated<OrgUserRow>> {
    const qParam = q.trim() ? `&q=${encodeURIComponent(q.trim())}` : "";
    const first = await apiGet<Paginated<OrgUserRow>>(
      `/api/v1/users?page=1&pageSize=${Math.max(size, 100)}${qParam}`,
    );
    let items = [...first.items];
    if (!q.trim() && first.totalPages > 1) {
      for (let p = 2; p <= first.totalPages; p += 1) {
        const next = await apiGet<Paginated<OrgUserRow>>(
          `/api/v1/users?page=${p}&pageSize=${Math.max(size, 100)}${qParam}`,
        );
        items.push(...next.items);
      }
    }
    const start = (pageNum - 1) * size;
    const pageItems = items.slice(start, start + size).map((u) => ({
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      role: u.role,
      createdAt: u.createdAt ?? "",
      clinicIds: u.clinicIds ?? [],
      clinics: u.clinics ?? [],
    }));
    const total = q.trim() ? pageItems.length : first.total;
    const totalPages = Math.max(1, Math.ceil(total / size));
    return {
      items: pageItems,
      total,
      page: pageNum,
      pageSize: size,
      totalPages,
    };
  }

  async function fetchOrgUsers(pageNum: number, size: number, q: string) {
    const query = q.trim() ? `&q=${encodeURIComponent(q.trim())}` : "";
    try {
      const data = await apiGet<Paginated<OrgUserRow>>(
        `/api/v1/admin/users?page=${pageNum}&pageSize=${size}${query}`,
      );
      setLegacyUsersApi(false);
      return data;
    } catch (err) {
      if (!(err instanceof ApiError) || err.status !== 404) throw err;
      setLegacyUsersApi(true);
      return fetchLegacyOrgUsers(pageNum, size, q);
    }
  }

  const editUserId = dialogMode && typeof dialogMode === "object" ? dialogMode.edit : null;
  const isCreate = dialogMode === "create";
  const isEdit = Boolean(editUserId);
  const dialogOpen = isCreate || isEdit;

  const { data: clinics = [] } = useClinicsQuery();

  const usersQuery = useQuery({
    queryKey: ["admin", "org-users", page, pageSize, search],
    queryFn: () => fetchOrgUsers(page, pageSize, search),
  });

  const userDetailQuery = useQuery({
    queryKey: ["admin", "org-user", editUserId],
    queryFn: () => apiGet<UserDetail>(`/api/v1/admin/users/${editUserId}`),
    enabled: isEdit && Boolean(editUserId),
  });

  useEffect(() => {
    if (!isEdit || !userDetailQuery.data) return;
    const u = userDetailQuery.data;
    setUEmail(u.email);
    setUName(u.displayName);
    setURole(u.role as (typeof ORG_USER_ROLES)[number]);
    setUClinicIds(u.clinicIds);
    setUPassword("");
  }, [isEdit, userDetailQuery.data]);

  const resetCreateForm = () => {
    setUEmail("");
    setUPassword("");
    setUName("");
    setURole("NURSE");
    setUClinicIds([]);
    setUserErr(null);
  };

  const closeDialog = () => {
    setDialogMode(null);
    setUserErr(null);
    setUPassword("");
  };

  const createMut = useMutation({
    mutationFn: () =>
      apiPost("/api/v1/admin/users", {
        email: uEmail.trim(),
        password: uPassword,
        displayName: uName.trim(),
        role: uRole,
        ...(uClinicIds.length ? { clinicIds: uClinicIds } : {}),
      }),
    onSuccess: () => {
      setUserErr(null);
      closeDialog();
      void qc.invalidateQueries({ queryKey: ["admin"] });
      void qc.invalidateQueries({ queryKey: ["users"] });
      void qc.invalidateQueries({ queryKey: ["org-hierarchy"] });
    },
    onError: (e: unknown) => setUserErr(apiErrorMessage(e)),
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
      return apiPatch(`/api/v1/admin/users/${editUserId}`, body);
    },
    onSuccess: () => {
      setUserErr(null);
      closeDialog();
      void qc.invalidateQueries({ queryKey: ["admin"] });
      void qc.invalidateQueries({ queryKey: ["users"] });
      void qc.invalidateQueries({ queryKey: ["org-hierarchy"] });
    },
    onError: (e: unknown) => setUserErr(apiErrorMessage(e)),
  });

  const deleteMut = useMutation({
    mutationFn: (userId: string) => apiDelete(`/api/v1/admin/users/${userId}`),
    onSuccess: () => {
      closeDialog();
      void qc.invalidateQueries({ queryKey: ["admin"] });
      void qc.invalidateQueries({ queryKey: ["users"] });
      void qc.invalidateQueries({ queryKey: ["org-hierarchy"] });
    },
    onError: (e: unknown) => setUserErr(apiErrorMessage(e)),
  });

  const requiresClinicAssignment = uRole === "CLINIC_ADMIN" || uRole === "BRANCH_MANAGER";
  const canSaveCreate =
    uEmail.trim() && uPassword.length >= 8 && uName.trim() && (!requiresClinicAssignment || uClinicIds.length > 0);
  const canSaveEdit = uEmail.trim() && uName.trim() && (!requiresClinicAssignment || uClinicIds.length > 0);

  const clinicLabel = useMemo(
    () => (row: OrgUserRow) =>
      row.clinics.length
        ? row.clinics.map((c) => formatClinicName(c, i18n.language)).join(", ")
        : t("admin.orgUsersNoClinics", "—"),
    [i18n.language, t],
  );

  const rows = usersQuery.data?.items ?? [];
  const total = usersQuery.data?.total ?? 0;
  const totalPages = usersQuery.data?.totalPages ?? 1;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{t("admin.tabOrgUsers", "Organization users")}</CardTitle>
            <CardDescription>{t("admin.orgUsersHint", "Manage login accounts, roles, and clinic assignments for your organization.")}</CardDescription>
          </div>
          <Button type="button" disabled={legacyUsersApi} onClick={() => { resetCreateForm(); setDialogMode("create"); }}>
            {t("admin.createUser", "Create user")}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {legacyUsersApi ? (
            <p className="text-sm text-amber-700 dark:text-amber-400">
              {total < 3
                ? t(
                    "admin.orgUsersLegacyApiEmpty",
                    "The deployed API is still updating or demo users are still seeding. Refresh in a minute — if the list stays empty after deploy, check App Runner logs for seed errors.",
                  )
                : t(
                    "admin.orgUsersLegacyApi",
                    "Read-only list — full user management will be available after the API deploy completes.",
                  )}
            </p>
          ) : null}
          {usersQuery.isError ? (
            <p className="text-sm text-destructive">
              {usersQuery.error instanceof ApiError
                ? usersQuery.error.message
                : t("common.error")}
            </p>
          ) : null}
          <div className="max-w-sm space-y-2">
            <Label htmlFor="org-users-search">{t("admin.orgUsersSearch", "Search users")}</Label>
            <Input
              id="org-users-search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder={t("admin.orgUsersSearchPh", "Email or display name…")}
            />
          </div>

          {usersQuery.isPending ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : (
            <>
              <ResponsiveTable>
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-muted/60">
                    <tr>
                      <th className="px-3 py-2 text-start">{t("admin.displayName")}</th>
                      <th className="px-3 py-2 text-start">{t("auth.email")}</th>
                      <th className="px-3 py-2 text-start">{t("admin.role", "Role")}</th>
                      <th className="px-3 py-2 text-start">{t("admin.assignedClinics", "Assigned clinics")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr
                        key={row.id}
                        className="cursor-pointer border-t border-border hover:bg-muted/40"
                        onClick={() => setDialogMode({ edit: row.id })}
                      >
                        <td className="px-3 py-2">{row.displayName}</td>
                        <td className="px-3 py-2">{row.email}</td>
                        <td className="px-3 py-2">{formatUserRole(row.role, t)}</td>
                        <td className="px-3 py-2 text-muted-foreground">{clinicLabel(row)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ResponsiveTable>
              <TablePagination
                page={page}
                pageSize={pageSize}
                total={total}
                totalPages={totalPages}
                onPageChange={setPage}
                onPageSizeChange={(ps) => {
                  setPageSize(ps);
                  setPage(1);
                }}
              />
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>
              {isEdit ? t("admin.orgUsersEdit", "Edit user") : t("admin.createUser", "Create user")}
            </DialogTitle>
          </DialogHeader>

          {isEdit && userDetailQuery.isPending ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label required>{t("auth.email")}</Label>
                <Input type="email" value={uEmail} onChange={(e) => setUEmail(e.target.value)} autoComplete="off" />
              </div>
              <div className="space-y-2">
                <Label required={isCreate}>{isEdit ? t("platform.newPasswordOptional", "New password (optional)") : t("admin.tempPassword", "Temporary password")}</Label>
                <PasswordInput
                  value={uPassword}
                  onChange={setUPassword}
                  placeholder={isEdit ? t("platform.leaveBlankPassword", "Leave blank to keep current") : undefined}
                  requirePromptToEdit={isEdit}
                />
              </div>
              <div className="space-y-2">
                <Label required>{t("admin.displayName")}</Label>
                <Input value={uName} onChange={(e) => setUName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t("admin.role", "Role")}</Label>
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
              {clinics.length ? (
                <div className="space-y-2 md:col-span-2">
                  <Label required={requiresClinicAssignment}>
                    {t("admin.assignedClinics", "Assigned clinics")}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {requiresClinicAssignment
                      ? t("admin.assignedClinicsRequiredHint", "Select at least one clinic for this role.")
                      : t(
                          "admin.assignedClinicsOptionalHint",
                          "Optional — assign the clinic or branch this user primarily works at.",
                        )}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {clinics.map((c) => {
                      const on = uClinicIds.includes(c.id);
                      return (
                        <Button
                          key={c.id}
                          type="button"
                          size="sm"
                          variant={on ? "default" : "outline"}
                          onClick={() => setUClinicIds((ids) => (on ? ids.filter((x) => x !== c.id) : [...ids, c.id]))}
                        >
                          {formatClinicName(c, i18n.language)}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2 pt-2 md:col-span-2">
                <Button
                  type="button"
                  disabled={isCreate ? !canSaveCreate || createMut.isPending : !canSaveEdit || patchMut.isPending}
                  onClick={() => (isCreate ? createMut.mutate() : patchMut.mutate())}
                >
                  {isEdit ? t("common.save", "Save") : t("admin.createUser", "Create user")}
                </Button>
                {isEdit && editUserId && editUserId !== authUser?.id ? (
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={deleteMut.isPending}
                    onClick={() => {
                      if (window.confirm(t("admin.orgUsersDeleteConfirm", "Delete this user? This cannot be undone."))) {
                        deleteMut.mutate(editUserId);
                      }
                    }}
                  >
                    {t("common.delete", "Delete")}
                  </Button>
                ) : null}
                <Button type="button" variant="outline" onClick={closeDialog}>
                  {t("common.cancel")}
                </Button>
              </div>
              {userErr ? <p className="text-sm text-destructive md:col-span-2">{userErr}</p> : null}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
