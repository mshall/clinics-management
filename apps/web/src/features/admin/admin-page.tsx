import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { SearchablePickList, type PickListItem } from "@/components/searchable-pick-list";
import { FilterTh, SortableTh, toggleSort, type SortOrder } from "@/components/sortable-th";
import { TablePagination } from "@/components/table-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAdminOverviewQuery, useClinicsQuery, useTenantsQuery } from "@/lib/api-hooks";
import { ApiError, apiPatch, apiPost } from "@/lib/http";
import { MIDDLE_EAST_COUNTRY_OPTIONS } from "@/lib/middle-east-countries";
import { useAuthStore } from "@/stores/auth-store";

const USER_ROLES = [
  "GROUP_ADMIN",
  "BRANCH_MANAGER",
  "PHYSICIAN",
  "NURSE",
  "RECEPTIONIST",
  "HR_OFFICER",
  "FINANCE_OFFICER",
] as const;

export function AdminPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const authUser = useAuthStore((s) => s.user);
  const isGroupAdmin = authUser?.role === "group_admin";
  const overview = useAdminOverviewQuery();
  const { data: clinics = [] } = useClinicsQuery();
  const [tPage, setTPage] = useState(1);
  const [tPs, setTPs] = useState(10);
  const [tSortBy, setTSortBy] = useState("name");
  const [tSortOrder, setTSortOrder] = useState<SortOrder>("asc");
  const tenants = useTenantsQuery({ page: tPage, pageSize: tPs, sortBy: tSortBy, sortOrder: tSortOrder });

  const [clParentId, setClParentId] = useState("");
  const [clNameEn, setClNameEn] = useState("");
  const [clNameAr, setClNameAr] = useState("");
  const [clCity, setClCity] = useState("");
  const [clCountry, setClCountry] = useState("AE");
  const [clAddressEn, setClAddressEn] = useState("");
  const [clAddressAr, setClAddressAr] = useState("");
  const [clLocationUrl, setClLocationUrl] = useState("");
  const [clLogoUrl, setClLogoUrl] = useState("");
  const [clPhone, setClPhone] = useState("");
  const [clEmail, setClEmail] = useState("");
  const [clLicense, setClLicense] = useState("");
  const [clinicErr, setClinicErr] = useState<string | null>(null);

  const [cfNameEn, setCfNameEn] = useState("");
  const [cfNameAr, setCfNameAr] = useState("");
  const [cfParent, setCfParent] = useState("");
  const [cfCity, setCfCity] = useState("");
  const [cfCountry, setCfCountry] = useState("");
  const [cfKind, setCfKind] = useState("");

  const [addClinicOpen, setAddClinicOpen] = useState(false);
  const [tfName, setTfName] = useState("");
  const [tfUsers, setTfUsers] = useState("");
  const [tfClinics, setTfClinics] = useState("");
  const [tfRegistered, setTfRegistered] = useState("");
  const [tfPatients, setTfPatients] = useState("");

  const [uEmail, setUEmail] = useState("");
  const [uPassword, setUPassword] = useState("");
  const [uName, setUName] = useState("");
  const [uRole, setURole] = useState<string>("NURSE");
  const [userErr, setUserErr] = useState<string | null>(null);

  const onTenantSort = (column: string) => {
    const next = toggleSort(tSortBy, tSortOrder, column);
    setTSortBy(next.sortBy);
    setTSortOrder(next.sortOrder);
    setTPage(1);
  };

  const parentClinicPickItems: PickListItem[] = useMemo(
    () => [
      { value: "", label: t("admin.newParentClinic", "None — create as parent clinic") },
      ...clinics.filter((c) => c.kind === "parent").map((c) => ({ value: c.id, label: c.nameEn })),
    ],
    [clinics, t]
  );

  const countryPickItems: PickListItem[] = useMemo(
    () => MIDDLE_EAST_COUNTRY_OPTIONS.map((o) => ({ value: o.value, label: `${o.label} (${o.value})` })),
    []
  );

  const filteredClinics = useMemo(() => {
    const n = (s: string) => s.trim().toLowerCase();
    const fe = n(cfNameEn);
    const fa = n(cfNameAr);
    const fp = n(cfParent);
    const fc = n(cfCity);
    const fco = n(cfCountry);
    const fk = n(cfKind);
    return clinics.filter((c) => {
      if (fe && !c.nameEn.toLowerCase().includes(fe)) return false;
      if (fa && !c.nameAr.toLowerCase().includes(fa)) return false;
      const parentLabel = (c.parentNameEn ?? "").trim() || "none";
      if (fp && !parentLabel.toLowerCase().includes(fp)) return false;
      if (fc && !c.city.toLowerCase().includes(fc)) return false;
      if (fco && !c.country.toLowerCase().includes(fco)) return false;
      if (fk && !c.kind.toLowerCase().includes(fk)) return false;
      return true;
    });
  }, [clinics, cfNameEn, cfNameAr, cfParent, cfCity, cfCountry, cfKind]);

  const resetClinicForm = () => {
    setClParentId("");
    setClNameEn("");
    setClNameAr("");
    setClCity("");
    setClCountry("AE");
    setClAddressEn("");
    setClAddressAr("");
    setClLocationUrl("");
    setClLogoUrl("");
    setClPhone("");
    setClEmail("");
    setClLicense("");
  };

  const createClinicMut = useMutation({
    mutationFn: () =>
      apiPost("/api/v1/clinics", {
        parentClinicId: clParentId || undefined,
        nameEn: clNameEn.trim(),
        nameAr: clNameAr.trim(),
        city: clCity.trim(),
        country: clCountry.trim() || "AE",
        addressEn: clAddressEn.trim(),
        addressAr: clAddressAr.trim(),
        locationUrl: clLocationUrl.trim(),
        logoUrl: clLogoUrl.trim() || undefined,
        phone: clPhone.trim() || undefined,
        email: clEmail.trim() || undefined,
        licenseNumber: clLicense.trim() || undefined,
      }),
    onSuccess: () => {
      setClinicErr(null);
      void qc.invalidateQueries({ queryKey: ["clinics"] });
      resetClinicForm();
      setAddClinicOpen(false);
    },
    onError: (e: unknown) => {
      if (e instanceof ApiError && e.body && typeof e.body === "object" && "message" in e.body) {
        setClinicErr(String((e.body as { message?: unknown }).message));
      } else setClinicErr(e instanceof Error ? e.message : String(e));
    },
  });

  const createUserMut = useMutation({
    mutationFn: () =>
      apiPost("/api/v1/admin/users", {
        email: uEmail.trim(),
        password: uPassword,
        displayName: uName.trim(),
        role: uRole,
      }),
    onSuccess: () => {
      setUserErr(null);
      void qc.invalidateQueries({ queryKey: ["users"] });
      void qc.invalidateQueries({ queryKey: ["admin", "overview"] });
      setUEmail("");
      setUPassword("");
      setUName("");
    },
    onError: (e: unknown) => {
      if (e instanceof ApiError && e.body && typeof e.body === "object" && "message" in e.body) {
        setUserErr(String((e.body as { message?: unknown }).message));
      } else setUserErr(e instanceof Error ? e.message : String(e));
    },
  });
  const tenantRows = tenants.data?.items ?? [];
  const tTotal = tenants.data?.total ?? 0;
  const tTotalPages = tenants.data?.totalPages ?? 1;

  const filteredTenantRows = useMemo(() => {
    const n = (s: string) => s.trim().toLowerCase();
    const fn = n(tfName);
    const fu = n(tfUsers);
    const fc = n(tfClinics);
    const fr = n(tfRegistered);
    const fp = n(tfPatients);
    const matchNum = (cell: number, q: string) => {
      if (!q) return true;
      const digits = q.replace(/[^\d]/g, "");
      return (digits && String(cell).includes(digits)) || String(cell).toLowerCase().includes(q);
    };
    return tenantRows.filter((row) => {
      if (fn && !row.name.toLowerCase().includes(fn)) return false;
      if (fu && !matchNum(row.counts.users, fu)) return false;
      if (fc && !matchNum(row.counts.clinics, fc)) return false;
      if (fp && !matchNum(row.counts.patients, fp)) return false;
      const regStr = new Date(row.createdAt).toLocaleDateString().toLowerCase();
      if (fr && !regStr.includes(fr) && !row.createdAt.toLowerCase().includes(fr)) return false;
      return true;
    });
  }, [tenantRows, tfName, tfUsers, tfClinics, tfRegistered, tfPatients]);

  const toggleFlag = useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) =>
      apiPatch(`/api/v1/admin/feature-flags/${encodeURIComponent(key)}`, { enabled }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin", "overview"] }),
    onError: (e: unknown) => console.error(e),
  });

  const [adminSection, setAdminSection] = useState<"clinics" | "organization">("clinics");
  const [feeDraft, setFeeDraft] = useState("");
  useEffect(() => {
    const v = overview.data?.currentTenant?.defaultVisitFee;
    if (v != null && Number.isFinite(Number(v))) setFeeDraft(String(v));
  }, [overview.data?.currentTenant?.defaultVisitFee]);

  const patchFeeMut = useMutation({
    mutationFn: () => apiPatch("/api/v1/admin/tenant-settings", { defaultVisitFee: Number.parseFloat(feeDraft) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin", "overview"] }),
    onError: (e: unknown) => {
      if (e instanceof ApiError && e.body && typeof e.body === "object" && "message" in e.body) {
        alert(String((e.body as { message?: unknown }).message));
      } else alert(e instanceof Error ? e.message : String(e));
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("admin.title")}</h1>
        <p className="text-muted-foreground">{t("admin.subtitle")}</p>
      </div>

      {overview.isError ? (
        <p className="text-sm text-destructive">
          {overview.error instanceof Error ? overview.error.message : t("common.error")}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant={adminSection === "clinics" ? "default" : "outline"} onClick={() => setAdminSection("clinics")}>
          {t("admin.tabClinics", "Clinics & tenants")}
        </Button>
        <Button type="button" size="sm" variant={adminSection === "organization" ? "default" : "outline"} onClick={() => setAdminSection("organization")}>
          {t("admin.tabOrganization", "Organization & settings")}
        </Button>
      </div>

      {adminSection === "organization" ? (
        <div className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("admin.currentOrg")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>
                  <span className="text-muted-foreground">{t("admin.name")}: </span>
                  {overview.data?.currentTenant?.name ?? "—"}
                </p>
                <p className="ltr-nums">
                  <span className="text-muted-foreground">{t("admin.tenantsRegistered")}: </span>
                  {overview.data?.registeredTenants ?? "—"}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("admin.auditTail")}</CardTitle>
              </CardHeader>
              <CardContent className="max-h-64 space-y-2 overflow-y-auto text-xs">
                {(overview.data?.recentAudit ?? []).map((a) => (
                  <div key={a.id} className="rounded border border-border px-2 py-1.5">
                    <span className="font-medium">{a.action}</span>{" "}
                    <span className="text-muted-foreground">
                      {a.resource} {a.resourceId ? `· ${a.resourceId.slice(0, 8)}…` : ""}
                    </span>
                    <div className="text-muted-foreground ltr-nums">{new Date(a.createdAt).toLocaleString()}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {isGroupAdmin ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("admin.defaultVisitFee", "Default visit fee (encounters)")}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap items-end gap-3">
                <div className="space-y-2">
                  <Label>{t("admin.feeAmount", "Amount (base currency)")}</Label>
                  <Input className="ltr-nums w-40" type="number" min="0" step="0.01" value={feeDraft} onChange={(e) => setFeeDraft(e.target.value)} />
                </div>
                <Button type="button" disabled={patchFeeMut.isPending || feeDraft === ""} onClick={() => patchFeeMut.mutate()}>
                  {t("admin.saveFee", "Save")}
                </Button>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("admin.featureFlags")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2">
              {(overview.data?.featureFlags ?? []).map((f) => (
                <div key={f.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs font-medium">{f.key}</p>
                    <p className="truncate text-xs text-muted-foreground">{f.description}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant={f.enabled ? "default" : "secondary"}>{f.enabled ? "ON" : "OFF"}</Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={toggleFlag.isPending}
                      onClick={() => {
                        toggleFlag.mutate({ key: f.key, enabled: !f.enabled }, {
                          onError: (e) => {
                            if (e instanceof ApiError) alert(e.message);
                          },
                        });
                      }}
                    >
                      {t("admin.toggle")}
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {isGroupAdmin ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("admin.rbacUser", "Create user (RBAC)")}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" value={uEmail} onChange={(e) => setUEmail(e.target.value)} autoComplete="off" />
                </div>
                <div className="space-y-2">
                  <Label>{t("admin.tempPassword", "Temporary password")}</Label>
                  <Input type="password" value={uPassword} onChange={(e) => setUPassword(e.target.value)} autoComplete="new-password" />
                </div>
                <div className="space-y-2">
                  <Label>{t("admin.displayName", "Display name")}</Label>
                  <Input value={uName} onChange={(e) => setUName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={uRole}
                    onChange={(e) => setURole(e.target.value)}
                  >
                    {USER_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end sm:col-span-2">
                  <Button
                    type="button"
                    disabled={!uEmail.trim() || uPassword.length < 8 || !uName.trim() || createUserMut.isPending}
                    onClick={() => createUserMut.mutate()}
                  >
                    {t("admin.createUser", "Create user")}
                  </Button>
                </div>
                {userErr ? <p className="text-sm text-destructive sm:col-span-full">{userErr}</p> : null}
                <p className="text-xs text-muted-foreground sm:col-span-full">
                  {t("admin.rbacHint", "Example: NURSE cannot access Revenue; PHYSICIAN and FINANCE_OFFICER can.")}
                </p>
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}

      {adminSection === "clinics" ? (
        <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("admin.addClinic", "Clinics: parent & branches")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Button type="button" onClick={() => setAddClinicOpen(true)}>
            {t("admin.openAddClinic")}
          </Button>
          <Dialog
            open={addClinicOpen}
            onOpenChange={(o) => {
              setAddClinicOpen(o);
              if (!o) {
                setClinicErr(null);
                resetClinicForm();
              }
            }}
          >
            <DialogContent className="max-h-[min(90vh,40rem)] overflow-y-auto sm:max-w-[36rem]" aria-describedby={undefined}>
              <DialogHeader>
                <DialogTitle>{t("admin.addClinicDialogTitle")}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label>{t("admin.parentClinic", "Parent clinic (optional)")}</Label>
                  <SearchablePickList
                    items={parentClinicPickItems}
                    value={clParentId}
                    onValueChange={setClParentId}
                    searchPlaceholder={t("admin.filterParentClinic", "Type to find parent…")}
                    placeholder={t("admin.pickParent", "Parent")}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("admin.nameEn", "Name (EN)")}</Label>
                  <Input value={clNameEn} onChange={(e) => setClNameEn(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{t("admin.nameAr", "Name (AR)")}</Label>
                  <Input value={clNameAr} onChange={(e) => setClNameAr(e.target.value)} dir="rtl" />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>{t("admin.city", "City")}</Label>
                  <Input value={clCity} onChange={(e) => setClCity(e.target.value)} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>{t("admin.country", "Country")}</Label>
                  <SearchablePickList
                    items={countryPickItems}
                    value={clCountry}
                    onValueChange={setClCountry}
                    searchPlaceholder={t("admin.filterCountry", "Type country name or code…")}
                    placeholder={t("admin.country")}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>{t("admin.addressEn", "Full address (English)")}</Label>
                  <textarea
                    className="flex min-h-[88px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={clAddressEn}
                    onChange={(e) => setClAddressEn(e.target.value)}
                    placeholder={t("admin.addressEnPh", "Street, building, area…")}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>{t("admin.addressAr", "Full address (Arabic)")}</Label>
                  <textarea
                    className="flex min-h-[88px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={clAddressAr}
                    onChange={(e) => setClAddressAr(e.target.value)}
                    dir="rtl"
                    placeholder={t("admin.addressArPh", "العنوان الكامل…")}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>{t("admin.locationUrl", "Location link (maps URL)")}</Label>
                  <Input
                    className="ltr-nums"
                    type="url"
                    value={clLocationUrl}
                    onChange={(e) => setClLocationUrl(e.target.value)}
                    placeholder="https://maps.google.com/?q=..."
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>{t("admin.logoUrl", "Logo (image URL)")}</Label>
                  <Input
                    className="ltr-nums"
                    type="url"
                    value={clLogoUrl}
                    onChange={(e) => setClLogoUrl(e.target.value)}
                    placeholder="https://…"
                  />
                  {clLogoUrl.trim() ? (
                    <div className="mt-2 rounded-md border border-border bg-muted/30 p-2">
                      <p className="mb-1 text-xs text-muted-foreground">{t("admin.logoPreview", "Preview")}</p>
                      <img src={clLogoUrl.trim()} alt="" className="max-h-20 max-w-[12rem] object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    </div>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label>{t("admin.phone", "Phone")}</Label>
                  <Input className="ltr-nums" value={clPhone} onChange={(e) => setClPhone(e.target.value)} placeholder="+971…" />
                </div>
                <div className="space-y-2">
                  <Label>{t("admin.email", "Email")}</Label>
                  <Input type="email" value={clEmail} onChange={(e) => setClEmail(e.target.value)} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>{t("admin.licenseNumber", "License number")}</Label>
                  <Input className="font-mono text-sm" value={clLicense} onChange={(e) => setClLicense(e.target.value)} />
                </div>
                {clinicErr ? <p className="text-sm text-destructive sm:col-span-full">{clinicErr}</p> : null}
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={() => setAddClinicOpen(false)}>
                  {t("common.cancel")}
                </Button>
                <Button
                  type="button"
                  disabled={
                    !clNameEn.trim() ||
                    !clNameAr.trim() ||
                    !clCity.trim() ||
                    !clAddressEn.trim() ||
                    !clAddressAr.trim() ||
                    !clLocationUrl.trim() ||
                    createClinicMut.isPending
                  }
                  onClick={() => createClinicMut.mutate()}
                >
                  {t("admin.saveClinic", "Save clinic")}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">{t("admin.clinicsList", "Clinics in this organization")}</CardTitle>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            disabled={
              !cfNameEn.trim() &&
              !cfNameAr.trim() &&
              !cfParent.trim() &&
              !cfCity.trim() &&
              !cfCountry.trim() &&
              !cfKind.trim()
            }
            onClick={() => {
              setCfNameEn("");
              setCfNameAr("");
              setCfParent("");
              setCfCity("");
              setCfCountry("");
              setCfKind("");
            }}
          >
            {t("admin.clearClinicFilters", "Clear filters")}
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-muted/60">
                <tr>
                  <th className="align-top px-2 py-2 text-start">
                    <div className="space-y-1">
                      <span className="text-xs font-medium text-muted-foreground">{t("admin.clinicCol", "Clinic (EN)")}</span>
                      <Input className="h-8 text-xs" value={cfNameEn} onChange={(e) => setCfNameEn(e.target.value)} placeholder="…" />
                    </div>
                  </th>
                  <th className="align-top px-2 py-2 text-start">
                    <div className="space-y-1">
                      <span className="text-xs font-medium text-muted-foreground">{t("admin.parentClinicCol", "Parent clinic")}</span>
                      <Input className="h-8 text-xs" value={cfParent} onChange={(e) => setCfParent(e.target.value)} placeholder="…" />
                    </div>
                  </th>
                  <th className="align-top px-2 py-2 text-start">
                    <div className="space-y-1">
                      <span className="text-xs font-medium text-muted-foreground">{t("admin.nameAr", "Name (AR)")}</span>
                      <Input className="h-8 text-xs" value={cfNameAr} onChange={(e) => setCfNameAr(e.target.value)} placeholder="…" />
                    </div>
                  </th>
                  <th className="align-top px-2 py-2 text-start">
                    <div className="space-y-1">
                      <span className="text-xs font-medium text-muted-foreground">{t("admin.city", "City")}</span>
                      <Input className="h-8 text-xs" value={cfCity} onChange={(e) => setCfCity(e.target.value)} placeholder="…" />
                    </div>
                  </th>
                  <th className="align-top px-2 py-2 text-start">
                    <div className="space-y-1">
                      <span className="text-xs font-medium text-muted-foreground">{t("admin.country", "Country")}</span>
                      <Input className="h-8 text-xs" value={cfCountry} onChange={(e) => setCfCountry(e.target.value)} placeholder="…" />
                    </div>
                  </th>
                  <th className="align-top px-2 py-2 text-start">
                    <div className="space-y-1">
                      <span className="text-xs font-medium text-muted-foreground">{t("admin.kind", "Kind")}</span>
                      <Input className="h-8 text-xs" value={cfKind} onChange={(e) => setCfKind(e.target.value)} placeholder="parent / branch" />
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredClinics.map((c) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="px-2 py-2 font-medium">{c.nameEn}</td>
                    <td className="px-2 py-2 text-muted-foreground">{c.parentNameEn ?? t("admin.parentNone", "None")}</td>
                    <td className="px-2 py-2" dir="rtl">
                      {c.nameAr}
                    </td>
                    <td className="px-2 py-2">{c.city}</td>
                    <td className="px-2 py-2 ltr-nums">{c.country}</td>
                    <td className="px-2 py-2">
                      <Badge variant="secondary">{c.kind}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredClinics.length === 0 ? (
            <p className="mt-2 text-center text-sm text-muted-foreground">{t("admin.noClinicsMatch", "No clinics match the filters.")}</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">{t("admin.allTenants")}</CardTitle>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            disabled={!tfName.trim() && !tfUsers.trim() && !tfClinics.trim() && !tfRegistered.trim() && !tfPatients.trim()}
            onClick={() => {
              setTfName("");
              setTfUsers("");
              setTfClinics("");
              setTfRegistered("");
              setTfPatients("");
            }}
          >
            {t("admin.clearTenantFilters")}
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/60">
                <tr>
                  <SortableTh
                    label={t("admin.name")}
                    column="name"
                    sortBy={tSortBy}
                    sortOrder={tSortOrder}
                    onSort={onTenantSort}
                    filterValue={tfName}
                    onFilterChange={setTfName}
                  />
                  <FilterTh label={t("admin.users")} value={tfUsers} onChange={setTfUsers} />
                  <FilterTh label={t("admin.clinics")} value={tfClinics} onChange={setTfClinics} />
                  <SortableTh
                    label={t("admin.registered", "Registered")}
                    column="createdAt"
                    sortBy={tSortBy}
                    sortOrder={tSortOrder}
                    onSort={onTenantSort}
                    filterValue={tfRegistered}
                    onFilterChange={setTfRegistered}
                  />
                  <FilterTh label={t("admin.patients")} value={tfPatients} onChange={setTfPatients} />
                </tr>
              </thead>
              <tbody>
                {tenants.isPending ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                      {t("common.loading")}
                    </td>
                  </tr>
                ) : null}
                {!tenants.isPending &&
                  filteredTenantRows.map((row) => (
                    <tr key={row.id} className="border-t border-border">
                      <td className="px-3 py-2">{row.name}</td>
                      <td className="px-3 py-2 ltr-nums">{row.counts.users}</td>
                      <td className="px-3 py-2 ltr-nums">{row.counts.clinics}</td>
                      <td className="px-3 py-2 ltr-nums text-xs text-muted-foreground">
                        {new Date(row.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-2 ltr-nums">{row.counts.patients}</td>
                    </tr>
                  ))}
                {!tenants.isPending && tenantRows.length > 0 && filteredTenantRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                      {t("admin.noTenantsMatch")}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <TablePagination
            page={tPage}
            pageSize={tPs}
            total={tTotal}
            totalPages={tTotalPages}
            disabled={tenants.isFetching}
            onPageChange={setTPage}
            onPageSizeChange={(s) => {
              setTPs(s);
              setTPage(1);
            }}
          />
        </CardContent>
      </Card>
        </div>
      ) : null}
    </div>
  );
}
