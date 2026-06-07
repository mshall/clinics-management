import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PickListItem } from "@/components/searchable-pick-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResponsiveTable } from "@/components/responsive-table";
import { ClinicFormFields } from "@/features/clinics/clinic-form-fields";
import {
  clinicDetailToForm,
  clinicFormToCreatePayload,
  emptyClinicForm,
  isClinicFormComplete,
  type ClinicFormValues,
} from "@/features/clinics/clinic-form-utils";
import { ApiError, apiGet, apiPatch, apiPost } from "@/lib/http";
import { formatUserRole } from "@/lib/locale-display";
import type { Paginated } from "@/lib/paginated";

type TenantDetail = {
  id: string;
  name: string;
  baseCurrency: string;
  defaultLocale: string;
  defaultVisitFee: number;
  createdAt: string;
  counts: { users: number; clinics: number; patients: number };
};

type ClinicSummary = {
  id: string;
  parentClinicId: string | null;
  parentNameEn: string | null;
  nameEn: string;
  nameAr: string;
  city: string;
  country: string;
  kind: "parent" | "branch";
};

type ClinicDetail = ClinicSummary & {
  addressEn: string;
  addressAr: string;
  locationUrl: string;
  logoUrl: string | null;
  phone: string;
  email: string;
  licenseNumber: string;
  defaultLanguage: string;
};

type UserRow = {
  id: string;
  email: string;
  displayName: string;
  role: string;
};

const ORG_USER_ROLES = [
  "GROUP_ADMIN",
  "CLINIC_ADMIN",
  "BRANCH_MANAGER",
  "PHYSICIAN",
  "NURSE",
  "RECEPTIONIST",
  "HR_OFFICER",
  "FINANCE_OFFICER",
  "CLINIC_ASSISTANT",
] as const;

export function PlatformOrgDetailPanel({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const [editName, setEditName] = useState("");
  const [editCurrency, setEditCurrency] = useState("");
  const [editLocale, setEditLocale] = useState("");
  const [editVisitFee, setEditVisitFee] = useState("");
  const [settingsErr, setSettingsErr] = useState<string | null>(null);

  const [newClinicForm, setNewClinicForm] = useState<ClinicFormValues>(emptyClinicForm);
  const [newClinicOpen, setNewClinicOpen] = useState(false);
  const [clErr, setClErr] = useState<string | null>(null);

  const [editingClinicId, setEditingClinicId] = useState<string | null>(null);
  const [editClinicForm, setEditClinicForm] = useState<ClinicFormValues>(emptyClinicForm);
  const [editClinicErr, setEditClinicErr] = useState<string | null>(null);

  const [uEmail, setUEmail] = useState("");
  const [uPassword, setUPassword] = useState("");
  const [uName, setUName] = useState("");
  const [uRole, setURole] = useState<(typeof ORG_USER_ROLES)[number]>("CLINIC_ADMIN");
  const [uClinicIds, setUClinicIds] = useState<string[]>([]);
  const [userErr, setUserErr] = useState<string | null>(null);

  const tenantDetailQuery = useQuery({
    queryKey: ["platform", "tenant", tenantId],
    queryFn: () => apiGet<TenantDetail>(`/api/v1/admin/platform/tenants/${tenantId}`),
  });

  const clinicsQuery = useQuery({
    queryKey: ["platform", "clinics", tenantId],
    queryFn: () => apiGet<ClinicSummary[]>(`/api/v1/admin/platform/tenants/${tenantId}/clinics`),
  });

  const usersQuery = useQuery({
    queryKey: ["platform", "users", tenantId],
    queryFn: () => apiGet<Paginated<UserRow>>(`/api/v1/admin/platform/tenants/${tenantId}/users?page=1&pageSize=100`),
  });

  const editingClinicQuery = useQuery({
    queryKey: ["platform", "clinic", tenantId, editingClinicId],
    queryFn: () => apiGet<ClinicDetail>(`/api/v1/admin/platform/tenants/${tenantId}/clinics/${editingClinicId}`),
    enabled: Boolean(editingClinicId),
  });

  const detail = tenantDetailQuery.data;
  const clinicRows = clinicsQuery.data ?? [];
  const userRows = usersQuery.data?.items ?? [];

  const parentClinicItems: PickListItem[] = useMemo(
    () => [
      { value: "", label: t("platform.newParentClinic") },
      ...clinicRows.filter((c) => c.kind === "parent").map((c) => ({ value: c.id, label: c.nameEn })),
    ],
    [clinicRows, t],
  );

  useEffect(() => {
    if (!detail) return;
    setEditName(detail.name);
    setEditCurrency(detail.baseCurrency);
    setEditLocale(detail.defaultLocale);
    setEditVisitFee(String(detail.defaultVisitFee));
  }, [detail]);

  useEffect(() => {
    if (!editingClinicQuery.data) return;
    setEditClinicForm(clinicDetailToForm(editingClinicQuery.data));
  }, [editingClinicQuery.data]);

  useEffect(() => {
    setEditingClinicId(null);
    setNewClinicOpen(false);
    setNewClinicForm(emptyClinicForm());
    setUClinicIds([]);
  }, [tenantId]);

  const patchTenantMut = useMutation({
    mutationFn: () =>
      apiPatch(`/api/v1/admin/platform/tenants/${tenantId}`, {
        name: editName.trim(),
        baseCurrency: editCurrency.trim(),
        defaultLocale: editLocale.trim(),
        defaultVisitFee: Number(editVisitFee) || 0,
      }),
    onSuccess: () => {
      setSettingsErr(null);
      void qc.invalidateQueries({ queryKey: ["platform"] });
    },
    onError: (e: unknown) => setSettingsErr(apiErrorMessage(e)),
  });

  const createClinicMut = useMutation({
    mutationFn: () =>
      apiPost(`/api/v1/admin/platform/tenants/${tenantId}/clinics`, clinicFormToCreatePayload(newClinicForm)),
    onSuccess: () => {
      setClErr(null);
      setNewClinicForm(emptyClinicForm());
      setNewClinicOpen(false);
      void qc.invalidateQueries({ queryKey: ["platform"] });
    },
    onError: (e: unknown) => setClErr(apiErrorMessage(e)),
  });

  const patchClinicMut = useMutation({
    mutationFn: () =>
      apiPatch(`/api/v1/admin/platform/tenants/${tenantId}/clinics/${editingClinicId}`, clinicFormToCreatePayload(editClinicForm, { includeParent: false })),
    onSuccess: () => {
      setEditClinicErr(null);
      setEditingClinicId(null);
      void qc.invalidateQueries({ queryKey: ["platform"] });
    },
    onError: (e: unknown) => setEditClinicErr(apiErrorMessage(e)),
  });

  const createUserMut = useMutation({
    mutationFn: () =>
      apiPost(`/api/v1/admin/platform/tenants/${tenantId}/users`, {
        email: uEmail.trim(),
        password: uPassword,
        displayName: uName.trim(),
        role: uRole,
        ...((uRole === "CLINIC_ADMIN" || uRole === "BRANCH_MANAGER") && uClinicIds.length ? { clinicIds: uClinicIds } : {}),
      }),
    onSuccess: () => {
      setUserErr(null);
      setUEmail("");
      setUPassword("");
      setUName("");
      setUClinicIds([]);
      void qc.invalidateQueries({ queryKey: ["platform"] });
    },
    onError: (e: unknown) => setUserErr(apiErrorMessage(e)),
  });

  if (tenantDetailQuery.isPending) {
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  }

  return (
    <div className="space-y-6 border-t border-border pt-6">
      <div>
        <h2 className="text-lg font-semibold">{detail?.name ?? t("platform.orgDetails")}</h2>
        <p className="text-sm text-muted-foreground">{t("platform.orgDetailsHint")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("platform.orgSettings")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label>{t("platform.orgName")}</Label>
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t("platform.baseCurrency")}</Label>
            <Input value={editCurrency} onChange={(e) => setEditCurrency(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t("platform.defaultLocale")}</Label>
            <Input value={editLocale} onChange={(e) => setEditLocale(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t("platform.defaultVisitFee")}</Label>
            <Input type="number" min={0} value={editVisitFee} onChange={(e) => setEditVisitFee(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Button type="button" disabled={patchTenantMut.isPending} onClick={() => patchTenantMut.mutate()}>
              {t("platform.saveSettings")}
            </Button>
            {settingsErr ? <p className="mt-2 text-sm text-destructive">{settingsErr}</p> : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">{t("platform.clinicsForOrg")}</CardTitle>
          <Button type="button" size="sm" variant="outline" onClick={() => setNewClinicOpen((v) => !v)}>
            {newClinicOpen ? t("common.cancel") : t("platform.addClinic")}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {clinicsQuery.isPending ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : clinicRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("platform.noClinicsYet")}</p>
          ) : (
            <ul className="space-y-3">
              {clinicRows.map((c) => (
                <li key={c.id} className="rounded-md border border-border">
                  <button
                    type="button"
                    className="flex w-full flex-wrap items-center gap-2 px-3 py-2 text-start text-sm hover:bg-muted/50"
                    onClick={() => setEditingClinicId((id) => (id === c.id ? null : c.id))}
                  >
                    <Badge variant={c.kind === "parent" ? "default" : "secondary"}>{c.kind}</Badge>
                    <span className="font-medium">{c.nameEn}</span>
                    <span className="text-muted-foreground">· {c.city}, {c.country}</span>
                    <span className="ms-auto text-xs text-muted-foreground">
                      {editingClinicId === c.id ? t("platform.collapseClinic") : t("platform.editClinic")}
                    </span>
                  </button>
                  {editingClinicId === c.id ? (
                    <div className="border-t border-border p-4">
                      {editingClinicQuery.isPending ? (
                        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
                      ) : (
                        <>
                          <ClinicFormFields
                            idPrefix={`edit-${c.id}`}
                            values={editClinicForm}
                            onChange={(patch) => setEditClinicForm((prev) => ({ ...prev, ...patch }))}
                          />
                          <div className="mt-4 flex gap-2">
                            <Button
                              type="button"
                              disabled={!isClinicFormComplete(editClinicForm) || patchClinicMut.isPending}
                              onClick={() => patchClinicMut.mutate()}
                            >
                              {t("platform.saveClinic")}
                            </Button>
                            <Button type="button" variant="outline" onClick={() => setEditingClinicId(null)}>
                              {t("common.cancel")}
                            </Button>
                          </div>
                          {editClinicErr ? <p className="mt-2 text-sm text-destructive">{editClinicErr}</p> : null}
                        </>
                      )}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {newClinicOpen ? (
            <div className="rounded-md border border-dashed border-border p-4">
              <p className="mb-3 text-sm font-medium">{t("platform.addClinic")}</p>
              <ClinicFormFields
                idPrefix="new-clinic"
                values={newClinicForm}
                onChange={(patch) => setNewClinicForm((prev) => ({ ...prev, ...patch }))}
                showParentPicker
                parentClinicItems={parentClinicItems}
              />
              <Button
                type="button"
                className="mt-4"
                disabled={!isClinicFormComplete(newClinicForm) || createClinicMut.isPending}
                onClick={() => createClinicMut.mutate()}
              >
                {t("admin.saveClinic")}
              </Button>
              {clErr ? <p className="mt-2 text-sm text-destructive">{clErr}</p> : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("platform.orgUsers")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {usersQuery.isPending ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : userRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("platform.noUsersYet")}</p>
          ) : (
            <ResponsiveTable>
              <table className="w-full min-w-[480px] text-sm">
                <thead className="bg-muted/60">
                  <tr>
                    <th className="px-3 py-2 text-start">{t("admin.displayName")}</th>
                    <th className="px-3 py-2 text-start">{t("auth.email")}</th>
                    <th className="px-3 py-2 text-start">{t("admin.role")}</th>
                  </tr>
                </thead>
                <tbody>
                  {userRows.map((u) => (
                    <tr key={u.id} className="border-t border-border">
                      <td className="px-3 py-2">{u.displayName}</td>
                      <td className="px-3 py-2">{u.email}</td>
                      <td className="px-3 py-2">{formatUserRole(u.role, t)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ResponsiveTable>
          )}

          <div className="rounded-md border border-border p-4">
            <p className="mb-3 text-sm font-medium">{t("platform.createUser")}</p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("auth.email")}</Label>
                <Input type="email" value={uEmail} onChange={(e) => setUEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t("auth.password")}</Label>
                <Input type="password" value={uPassword} onChange={(e) => setUPassword(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t("admin.displayName")}</Label>
                <Input value={uName} onChange={(e) => setUName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t("admin.role")}</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={uRole}
                  onChange={(e) => {
                    setURole(e.target.value as (typeof ORG_USER_ROLES)[number]);
                    setUClinicIds([]);
                  }}
                >
                  {ORG_USER_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {formatUserRole(r, t)}
                    </option>
                  ))}
                </select>
              </div>
              {uRole === "CLINIC_ADMIN" || uRole === "BRANCH_MANAGER" ? (
                <div className="space-y-2 md:col-span-2">
                  <Label>{t("platform.assignClinics")}</Label>
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
                </div>
              ) : null}
              <div className="md:col-span-2">
                <Button
                  type="button"
                  disabled={
                    !uEmail.trim() ||
                    uPassword.length < 8 ||
                    !uName.trim() ||
                    createUserMut.isPending ||
                    ((uRole === "CLINIC_ADMIN" || uRole === "BRANCH_MANAGER") && uClinicIds.length === 0)
                  }
                  onClick={() => createUserMut.mutate()}
                >
                  {t("platform.createUserBtn")}
                </Button>
                {userErr ? <p className="mt-2 text-sm text-destructive">{userErr}</p> : null}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function apiErrorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return e instanceof Error ? e.message : String(e);
}
