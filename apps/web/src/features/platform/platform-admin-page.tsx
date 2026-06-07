import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResponsiveTable } from "@/components/responsive-table";
import { ApiError, apiGet, apiPatch, apiPost } from "@/lib/http";
import { formatUserRole } from "@/lib/locale-display";
import type { Paginated } from "@/lib/paginated";
import { useAuthStore } from "@/stores/auth-store";

type TenantRow = {
  id: string;
  name: string;
  baseCurrency: string;
  defaultLocale: string;
  createdAt: string;
  counts: { users: number; clinics: number; patients: number };
};

type TenantDetail = TenantRow & { defaultVisitFee: number };

type ClinicRow = {
  id: string;
  parentClinicId: string | null;
  parentNameEn: string | null;
  nameEn: string;
  nameAr: string;
  city: string;
  country: string;
  kind: "parent" | "branch";
};

type UserRow = {
  id: string;
  email: string;
  displayName: string;
  role: string;
  createdAt: string;
};

type FeatureFlagRow = {
  id: string;
  key: string;
  enabled: boolean;
  description: string | null;
};

type PlatformOverview = {
  tenantCount: number;
  userCount: number;
  clinicCount: number;
  patientCount: number;
  encounterCount: number;
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

export function PlatformAdminPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const authUser = useAuthStore((s) => s.user);
  const isPlatform = authUser?.role === "platform_super_admin" || Boolean(authUser?.platformSuperAdmin);

  const [tenantName, setTenantName] = useState("");
  const [tenantCurrency, setTenantCurrency] = useState("AED");
  const [tenantLocale, setTenantLocale] = useState("en");
  const [gaEmail, setGaEmail] = useState("");
  const [gaPassword, setGaPassword] = useState("");
  const [gaName, setGaName] = useState("");
  const [hqNameEn, setHqNameEn] = useState("");
  const [hqNameAr, setHqNameAr] = useState("");
  const [hqCity, setHqCity] = useState("");
  const [createOrgWithHq, setCreateOrgWithHq] = useState(false);
  const [tenantErr, setTenantErr] = useState<string | null>(null);
  const [selectedTenantId, setSelectedTenantId] = useState("");

  const [editName, setEditName] = useState("");
  const [editCurrency, setEditCurrency] = useState("");
  const [editLocale, setEditLocale] = useState("");
  const [editVisitFee, setEditVisitFee] = useState("");
  const [settingsErr, setSettingsErr] = useState<string | null>(null);

  const [clParentId, setClParentId] = useState("");
  const [clNameEn, setClNameEn] = useState("");
  const [clNameAr, setClNameAr] = useState("");
  const [clCity, setClCity] = useState("");
  const clCountry = "AE";
  const [clErr, setClErr] = useState<string | null>(null);

  const [uEmail, setUEmail] = useState("");
  const [uPassword, setUPassword] = useState("");
  const [uName, setUName] = useState("");
  const [uRole, setURole] = useState<(typeof ORG_USER_ROLES)[number]>("CLINIC_ADMIN");
  const [uClinicIds, setUClinicIds] = useState<string[]>([]);
  const [userErr, setUserErr] = useState<string | null>(null);

  const overviewQuery = useQuery({
    queryKey: ["platform", "overview"],
    queryFn: () => apiGet<PlatformOverview>("/api/v1/admin/platform/overview"),
    enabled: isPlatform,
  });

  const flagsQuery = useQuery({
    queryKey: ["platform", "feature-flags"],
    queryFn: () => apiGet<FeatureFlagRow[]>("/api/v1/admin/platform/feature-flags"),
    enabled: isPlatform,
  });

  const tenantsQuery = useQuery({
    queryKey: ["platform", "tenants"],
    queryFn: () => apiGet<Paginated<TenantRow>>("/api/v1/admin/platform/tenants?page=1&pageSize=100&sortBy=name&sortOrder=asc"),
    enabled: isPlatform,
  });

  const tenantDetailQuery = useQuery({
    queryKey: ["platform", "tenant", selectedTenantId],
    queryFn: () => apiGet<TenantDetail>(`/api/v1/admin/platform/tenants/${selectedTenantId}`),
    enabled: isPlatform && Boolean(selectedTenantId),
  });

  const clinicsQuery = useQuery({
    queryKey: ["platform", "clinics", selectedTenantId],
    queryFn: () => apiGet<ClinicRow[]>(`/api/v1/admin/platform/tenants/${selectedTenantId}/clinics`),
    enabled: isPlatform && Boolean(selectedTenantId),
  });

  const usersQuery = useQuery({
    queryKey: ["platform", "users", selectedTenantId],
    queryFn: () =>
      apiGet<Paginated<UserRow>>(`/api/v1/admin/platform/tenants/${selectedTenantId}/users?page=1&pageSize=100`),
    enabled: isPlatform && Boolean(selectedTenantId),
  });

  const tenantRows = tenantsQuery.data?.items ?? [];
  const clinicRows = clinicsQuery.data ?? [];
  const userRows = usersQuery.data?.items ?? [];
  const parentClinics = useMemo(() => clinicRows.filter((c) => c.kind === "parent"), [clinicRows]);

  const detail = tenantDetailQuery.data;

  useEffect(() => {
    if (!detail || detail.id !== selectedTenantId) return;
    setEditName(detail.name);
    setEditCurrency(detail.baseCurrency);
    setEditLocale(detail.defaultLocale);
    setEditVisitFee(String(detail.defaultVisitFee));
  }, [detail, selectedTenantId]);

  const createTenantMut = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        name: tenantName.trim(),
        baseCurrency: tenantCurrency.trim() || "AED",
        defaultLocale: tenantLocale.trim() || "en",
      };
      if (gaEmail.trim() && gaPassword && gaName.trim()) {
        body.groupAdmin = { email: gaEmail.trim(), password: gaPassword, displayName: gaName.trim() };
      }
      if (createOrgWithHq && hqNameEn.trim() && hqNameAr.trim() && hqCity.trim()) {
        body.initialClinic = { nameEn: hqNameEn.trim(), nameAr: hqNameAr.trim(), city: hqCity.trim(), country: "AE" };
      }
      return apiPost<TenantRow & { groupAdmin?: UserRow | null; initialClinic?: { id: string } | null }>(
        "/api/v1/admin/platform/tenants",
        body,
      );
    },
    onSuccess: (row) => {
      setTenantErr(null);
      setTenantName("");
      setGaEmail("");
      setGaPassword("");
      setGaName("");
      setHqNameEn("");
      setHqNameAr("");
      setHqCity("");
      setCreateOrgWithHq(false);
      setSelectedTenantId(row.id);
      setEditName("");
      setEditCurrency("");
      void qc.invalidateQueries({ queryKey: ["platform"] });
    },
    onError: (e: unknown) => setTenantErr(apiErrorMessage(e)),
  });

  const patchTenantMut = useMutation({
    mutationFn: () =>
      apiPatch<TenantDetail>(`/api/v1/admin/platform/tenants/${selectedTenantId}`, {
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
      apiPost(`/api/v1/admin/platform/tenants/${selectedTenantId}/clinics`, {
        parentClinicId: clParentId || undefined,
        nameEn: clNameEn.trim(),
        nameAr: clNameAr.trim(),
        city: clCity.trim(),
        country: clCountry.trim() || "AE",
      }),
    onSuccess: () => {
      setClErr(null);
      setClParentId("");
      setClNameEn("");
      setClNameAr("");
      setClCity("");
      void qc.invalidateQueries({ queryKey: ["platform"] });
    },
    onError: (e: unknown) => setClErr(apiErrorMessage(e)),
  });

  const createUserMut = useMutation({
    mutationFn: () =>
      apiPost(`/api/v1/admin/platform/tenants/${selectedTenantId}/users`, {
        email: uEmail.trim(),
        password: uPassword,
        displayName: uName.trim(),
        role: uRole,
        ...((uRole === "CLINIC_ADMIN" || uRole === "BRANCH_MANAGER") && uClinicIds.length
          ? { clinicIds: uClinicIds }
          : {}),
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

  const flagMut = useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) =>
      apiPatch(`/api/v1/admin/platform/feature-flags/${encodeURIComponent(key)}`, { enabled }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["platform", "feature-flags"] }),
  });

  const canCreateOrg =
    tenantName.trim().length > 0 &&
    gaEmail.trim().length > 0 &&
    gaPassword.length >= 8 &&
    gaName.trim().length > 0 &&
    (!createOrgWithHq || (hqNameEn.trim() && hqNameAr.trim() && hqCity.trim()));

  if (authUser && !isPlatform) {
    return <Navigate to="/" replace />;
  }

  const ov = overviewQuery.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("platform.title")}</h1>
        <p className="text-muted-foreground">{t("platform.subtitle")}</p>
      </div>

      {ov ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { label: t("platform.kpi.orgs"), value: ov.tenantCount },
            { label: t("platform.kpi.users"), value: ov.userCount },
            { label: t("platform.kpi.clinics"), value: ov.clinicCount },
            { label: t("platform.kpi.patients"), value: ov.patientCount },
            { label: t("platform.kpi.encounters"), value: ov.encounterCount },
          ].map((k) => (
            <Card key={k.label}>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <p className="text-2xl font-semibold ltr-nums">{k.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("platform.createOrg")}</CardTitle>
          <CardDescription>{t("platform.createOrgHint")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label>{t("platform.orgName")}</Label>
            <Input value={tenantName} onChange={(e) => setTenantName(e.target.value)} placeholder="Acme Clinic Group" />
          </div>
          <div className="space-y-2">
            <Label>{t("platform.baseCurrency")}</Label>
            <Input value={tenantCurrency} onChange={(e) => setTenantCurrency(e.target.value)} placeholder="AED" />
          </div>
          <div className="space-y-2">
            <Label>{t("platform.defaultLocale")}</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={tenantLocale}
              onChange={(e) => setTenantLocale(e.target.value)}
            >
              <option value="en">English</option>
              <option value="ar">Arabic</option>
            </select>
          </div>

          <div className="md:col-span-2 rounded-md border border-border p-4 space-y-3">
            <p className="text-sm font-medium">{t("platform.groupAdminSection")}</p>
            <p className="text-xs text-muted-foreground">{t("platform.groupAdminHint")}</p>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <Label>{t("platform.groupAdminEmail")}</Label>
                <Input type="email" value={gaEmail} onChange={(e) => setGaEmail(e.target.value)} placeholder="admin@acme.com" />
              </div>
              <div className="space-y-2">
                <Label>{t("auth.password")}</Label>
                <Input type="password" value={gaPassword} onChange={(e) => setGaPassword(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t("admin.displayName")}</Label>
                <Input value={gaName} onChange={(e) => setGaName(e.target.value)} placeholder="Acme Group Admin" />
              </div>
            </div>
          </div>

          <div className="md:col-span-2 space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={createOrgWithHq} onChange={(e) => setCreateOrgWithHq(e.target.checked)} />
              {t("platform.createInitialHq")}
            </label>
            {createOrgWithHq ? (
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>{t("admin.nameEn")}</Label>
                  <Input value={hqNameEn} onChange={(e) => setHqNameEn(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{t("admin.nameAr")}</Label>
                  <Input value={hqNameAr} onChange={(e) => setHqNameAr(e.target.value)} dir="rtl" />
                </div>
                <div className="space-y-2">
                  <Label>{t("admin.city")}</Label>
                  <Input value={hqCity} onChange={(e) => setHqCity(e.target.value)} />
                </div>
              </div>
            ) : null}
          </div>

          <div className="md:col-span-2">
            <Button type="button" disabled={!canCreateOrg || createTenantMut.isPending} onClick={() => createTenantMut.mutate()}>
              {t("platform.createOrgBtn")}
            </Button>
            {tenantErr ? <p className="mt-2 text-sm text-destructive">{tenantErr}</p> : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("platform.organizations")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {tenantsQuery.isPending ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : (
            <ResponsiveTable>
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-muted/60">
                  <tr>
                    <th className="px-3 py-2 text-start">{t("platform.orgName")}</th>
                    <th className="px-3 py-2 text-start">{t("admin.clinics")}</th>
                    <th className="px-3 py-2 text-start">{t("admin.users")}</th>
                    <th className="px-3 py-2 text-start">{t("platform.select")}</th>
                  </tr>
                </thead>
                <tbody>
                  {tenantRows.map((row) => (
                    <tr key={row.id} className="border-t border-border">
                      <td className="px-3 py-2 font-medium">{row.name}</td>
                      <td className="px-3 py-2 ltr-nums">{row.counts.clinics}</td>
                      <td className="px-3 py-2 ltr-nums">{row.counts.users}</td>
                      <td className="px-3 py-2">
                        <Button
                          type="button"
                          size="sm"
                          variant={selectedTenantId === row.id ? "default" : "outline"}
                          onClick={() => {
                            setSelectedTenantId(row.id);
                            setClParentId("");
                            setUClinicIds([]);
                          }}
                        >
                          {selectedTenantId === row.id ? t("platform.selected") : t("platform.manage")}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ResponsiveTable>
          )}
        </CardContent>
      </Card>

      {selectedTenantId ? (
        <>
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
            <CardHeader>
              <CardTitle className="text-base">{t("platform.orgUsers")}</CardTitle>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("platform.clinicsForOrg")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {clinicsQuery.isPending ? (
                <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
              ) : clinicRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("platform.noClinicsYet")}</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {clinicRows.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center gap-2">
                      <Badge variant={c.kind === "parent" ? "default" : "secondary"}>{c.kind}</Badge>
                      <span>{c.nameEn}</span>
                      <span className="text-muted-foreground">· {c.city}</span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t("platform.parentClinic")}</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={clParentId}
                    onChange={(e) => setClParentId(e.target.value)}
                  >
                    <option value="">{t("platform.newParentClinic")}</option>
                    {parentClinics.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nameEn}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>{t("admin.city")}</Label>
                  <Input value={clCity} onChange={(e) => setClCity(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{t("admin.nameEn")}</Label>
                  <Input value={clNameEn} onChange={(e) => setClNameEn(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{t("admin.nameAr")}</Label>
                  <Input value={clNameAr} onChange={(e) => setClNameAr(e.target.value)} dir="rtl" />
                </div>
              </div>
              <Button
                type="button"
                disabled={!clNameEn.trim() || !clNameAr.trim() || !clCity.trim() || createClinicMut.isPending}
                onClick={() => createClinicMut.mutate()}
              >
                {t("platform.addClinic")}
              </Button>
              {clErr ? <p className="text-sm text-destructive">{clErr}</p> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("platform.createUser")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
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
                          onClick={() =>
                            setUClinicIds((ids) => (on ? ids.filter((x) => x !== c.id) : [...ids, c.id]))
                          }
                        >
                          {c.nameEn}
                        </Button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">{t("platform.assignClinicsHint")}</p>
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
            </CardContent>
          </Card>
        </>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("platform.featureFlags")}</CardTitle>
          <CardDescription>{t("platform.featureFlagsHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          {flagsQuery.isPending ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {(flagsQuery.data ?? []).map((f) => (
                <li key={f.key} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
                  <div>
                    <span className="font-medium">{f.key}</span>
                    {f.description ? <p className="text-xs text-muted-foreground">{f.description}</p> : null}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant={f.enabled ? "default" : "outline"}
                    disabled={flagMut.isPending}
                    onClick={() => flagMut.mutate({ key: f.key, enabled: !f.enabled })}
                  >
                    {f.enabled ? t("platform.flagOn") : t("platform.flagOff")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function apiErrorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return e instanceof Error ? e.message : String(e);
}
