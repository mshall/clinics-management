import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Navigate } from "react-router-dom";
import type { PickListItem } from "@/components/searchable-pick-list";
import { FilterTh, SortableTh, toggleSort, type SortOrder } from "@/components/sortable-th";
import { ResponsiveTable } from "@/components/responsive-table";
import { TablePagination } from "@/components/table-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAdminOverviewQuery, useClinicQuery, useClinicsQuery, useTenantsQuery } from "@/lib/api-hooks";
import { ApiError, apiPatch, apiPost } from "@/lib/http";
import { cn, columnFilterIncludes } from "@/lib/utils";
import { formatClinicName, formatUserRole } from "@/lib/locale-display";
import { clinicKindLabel, isRootClinic } from "@/lib/clinic-kind";
import { useAuthStore } from "@/stores/auth-store";
import { ClinicFormFields } from "@/features/clinics/clinic-form-fields";
import {
  clinicDetailToForm,
  clinicFormToCreatePayload,
  collectClinicFormErrors,
  emptyClinicForm,
  type ClinicFormValues,
} from "@/features/clinics/clinic-form-utils";
import { AdminCreateEmployeePanel } from "./admin-create-employee-panel";
import { AdminDataExplorerPanel } from "./admin-data-explorer-panel";
import { AdminGovernancePanel } from "./admin-governance-panel";
import { OrgHierarchyPanel } from "@/features/org-hierarchy/org-hierarchy-panel";

const USER_ROLES = [
  "GROUP_ADMIN",
  "BRANCH_MANAGER",
  "PHYSICIAN",
  "NURSE",
  "RECEPTIONIST",
  "HR_OFFICER",
  "FINANCE_OFFICER",
  "CLINIC_ADMIN",
  "CLINIC_ASSISTANT",
] as const;

export function AdminPage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const authUser = useAuthStore((s) => s.user);
  const isGroupAdmin = authUser?.role === "group_admin";
  const isClinicAdmin = authUser?.role === "clinic_admin";
  const isBranchManager = authUser?.role === "branch_manager";
  const isPlatformSuperAdmin = Boolean(authUser?.platformSuperAdmin);
  const isPlatformRole = authUser?.role === "platform_super_admin";
  const overview = useAdminOverviewQuery();
  const { data: clinics = [] } = useClinicsQuery();
  const [tPage, setTPage] = useState(1);
  const [tPs, setTPs] = useState(10);
  const [tSortBy, setTSortBy] = useState("name");
  const [tSortOrder, setTSortOrder] = useState<SortOrder>("asc");
  const tenants = useTenantsQuery({
    page: tPage,
    pageSize: tPs,
    sortBy: tSortBy,
    sortOrder: tSortOrder,
    enabled: isPlatformRole,
  });

  const [selectedClinicId, setSelectedClinicId] = useState<string | null>(null);
  const [editClinicForm, setEditClinicForm] = useState<ClinicFormValues>(emptyClinicForm());
  const [editClinicErr, setEditClinicErr] = useState<string | null>(null);
  const selectedClinicDetail = useClinicQuery(selectedClinicId ?? undefined);

  const [addClinicForm, setAddClinicForm] = useState<ClinicFormValues>(emptyClinicForm());
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
  const [uClinicIds, setUClinicIds] = useState<string[]>([]);
  const [userErr, setUserErr] = useState<string | null>(null);

  useEffect(() => {
    if (uRole !== "CLINIC_ADMIN" && uRole !== "BRANCH_MANAGER") setUClinicIds([]);
  }, [uRole]);

  const onTenantSort = (column: string) => {
    const next = toggleSort(tSortBy, tSortOrder, column);
    setTSortBy(next.sortBy);
    setTSortOrder(next.sortOrder);
    setTPage(1);
  };

  const parentClinicPickItems: PickListItem[] = useMemo(
    () => clinics.filter(isRootClinic).map((c) => ({ value: c.id, label: formatClinicName(c, i18n.language) })),
    [clinics, i18n.language],
  );

  const filteredClinics = useMemo(() => {
    return clinics.filter((c) => {
      if (cfNameEn.trim() && !columnFilterIncludes(c.nameEn, cfNameEn)) return false;
      if (cfNameAr.trim() && !columnFilterIncludes(c.nameAr ?? "", cfNameAr)) return false;
      const parentLabel = (c.parentNameEn ?? "").trim() || "none";
      if (cfParent.trim() && !columnFilterIncludes(parentLabel, cfParent)) return false;
      if (cfCity.trim() && !columnFilterIncludes(c.city, cfCity)) return false;
      if (cfCountry.trim() && !columnFilterIncludes(c.country, cfCountry)) return false;
      if (cfKind.trim() && !columnFilterIncludes(c.kind, cfKind)) return false;
      return true;
    });
  }, [clinics, cfNameEn, cfNameAr, cfParent, cfCity, cfCountry, cfKind]);

  const resetClinicForm = () => {
    setAddClinicForm(emptyClinicForm());
  };

  useEffect(() => {
    if (!selectedClinicId || !selectedClinicDetail.data) return;
    setEditClinicForm(clinicDetailToForm(selectedClinicDetail.data));
    setEditClinicErr(null);
  }, [selectedClinicId, selectedClinicDetail.data]);

  const patchClinicMut = useMutation({
    mutationFn: () =>
      apiPatch(
        `/api/v1/clinics/${selectedClinicId}`,
        clinicFormToCreatePayload(editClinicForm, { includeParent: false }),
      ),
    onSuccess: () => {
      setEditClinicErr(null);
      setSelectedClinicId(null);
      void qc.invalidateQueries({ queryKey: ["clinics"] });
      void qc.invalidateQueries({ queryKey: ["org-hierarchy"] });
    },
    onError: (e: unknown) => {
      if (e instanceof ApiError && e.body && typeof e.body === "object" && "message" in e.body) {
        setEditClinicErr(String((e.body as { message?: unknown }).message));
      } else setEditClinicErr(e instanceof Error ? e.message : String(e));
    },
  });

  const createClinicMut = useMutation({
    mutationFn: () => apiPost("/api/v1/clinics", clinicFormToCreatePayload(addClinicForm)),
    onSuccess: () => {
      setClinicErr(null);
      resetClinicForm();
      setAddClinicOpen(false);
      void qc.invalidateQueries({ queryKey: ["clinics"] });
      void qc.invalidateQueries({ queryKey: ["org-hierarchy"] });
    },
    onError: (e: unknown) => {
      if (e instanceof ApiError && e.body && typeof e.body === "object" && "message" in e.body) {
        setClinicErr(String((e.body as { message?: unknown }).message));
      } else setClinicErr(e instanceof Error ? e.message : String(e));
    },
  });

  const handleCreateClinic = () => {
    if (createClinicMut.isPending) return;
    const errors = collectClinicFormErrors(addClinicForm, t);
    if (errors.length > 0) {
      toast.error(t("admin.clinicValidationTitle", "Complete the required clinic fields"), {
        description: errors.join("\n"),
      });
      return;
    }
    createClinicMut.mutate();
  };

  const handlePatchClinic = () => {
    if (patchClinicMut.isPending) return;
    const errors = collectClinicFormErrors(editClinicForm, t);
    if (errors.length > 0) {
      toast.error(t("admin.clinicValidationTitle", "Complete the required clinic fields"), {
        description: errors.join("\n"),
      });
      return;
    }
    patchClinicMut.mutate();
  };

  const createUserMut = useMutation({
    mutationFn: () =>
      apiPost("/api/v1/admin/users", {
        email: uEmail.trim(),
        password: uPassword,
        displayName: uName.trim(),
        role: uRole,
        ...((uRole === "CLINIC_ADMIN" || uRole === "BRANCH_MANAGER") && uClinicIds.length ? { clinicIds: uClinicIds } : {}),
      }),
    onSuccess: () => {
      setUserErr(null);
      void qc.invalidateQueries({ queryKey: ["users"] });
      void qc.invalidateQueries({ queryKey: ["admin", "overview"] });
      setUEmail("");
      setUPassword("");
      setUName("");
      setUClinicIds([]);
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
    const matchNum = (cell: number, q: string) => {
      if (!q.trim()) return true;
      const digits = q.replace(/[^\d]/g, "");
      return (digits && String(cell).includes(digits)) || columnFilterIncludes(String(cell), q);
    };
    return tenantRows.filter((row) => {
      if (tfName.trim() && !columnFilterIncludes(row.name, tfName)) return false;
      if (tfUsers.trim() && !matchNum(row.counts.users, tfUsers)) return false;
      if (tfClinics.trim() && !matchNum(row.counts.clinics, tfClinics)) return false;
      if (tfPatients.trim() && !matchNum(row.counts.patients, tfPatients)) return false;
      const regStr = new Date(row.createdAt).toLocaleDateString();
      if (
        tfRegistered.trim() &&
        !columnFilterIncludes(regStr, tfRegistered) &&
        !columnFilterIncludes(row.createdAt, tfRegistered)
      ) {
        return false;
      }
      return true;
    });
  }, [tenantRows, tfName, tfUsers, tfClinics, tfRegistered, tfPatients]);

  const toggleFlag = useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) =>
      apiPatch(`/api/v1/admin/feature-flags/${encodeURIComponent(key)}`, { enabled }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin", "overview"] }),
    onError: (e: unknown) => console.error(e),
  });

  const [adminSection, setAdminSection] = useState<"clinics" | "organization" | "data" | "governance">("clinics");
  const [feeDraft, setFeeDraft] = useState("");
  useEffect(() => {
    if (!isPlatformSuperAdmin && adminSection === "data") setAdminSection("clinics");
  }, [isPlatformSuperAdmin, adminSection]);
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

  if (authUser && !isGroupAdmin && !isClinicAdmin && !isBranchManager) {
    return <Navigate to="/" replace />;
  }
  if (isClinicAdmin || isBranchManager) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t("nav.admin", "Administration")}</h1>
            <p className="text-muted-foreground">
              {isBranchManager
                ? t("admin.branchManagerSubtitle", "Staff onboarding and governance for clinics you manage.")
                : t("admin.clinicAdminSubtitle", "Staff onboarding and clinic governance.")}
            </p>
          </div>
          <OrgHierarchyPanel scope="tenant" />
        </div>
        <AdminCreateEmployeePanel />
        <AdminGovernancePanel />
      </div>
    );
  }

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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant={adminSection === "clinics" ? "default" : "outline"} onClick={() => setAdminSection("clinics")}>
          {t("admin.tabClinics", "Clinics & tenants")}
        </Button>
        <Button type="button" size="sm" variant={adminSection === "organization" ? "default" : "outline"} onClick={() => setAdminSection("organization")}>
          {t("admin.tabOrganization", "Organization & settings")}
        </Button>
        {isPlatformSuperAdmin ? (
          <Button type="button" size="sm" variant={adminSection === "data" ? "default" : "outline"} onClick={() => setAdminSection("data")}>
            {t("admin.tabDataExplorer", "Data explorer")}
          </Button>
        ) : null}
        <Button type="button" size="sm" variant={adminSection === "governance" ? "default" : "outline"} onClick={() => setAdminSection("governance")}>
          {t("admin.tabGovernance")}
        </Button>
        </div>
        <OrgHierarchyPanel scope="tenant" />
      </div>

      {adminSection === "governance" ? (
        <AdminGovernancePanel />
      ) : adminSection === "data" ? (
        isPlatformSuperAdmin ? (
          <AdminDataExplorerPanel />
        ) : null
      ) : adminSection === "organization" ? (
        <div className="space-y-6">
          <AdminCreateEmployeePanel />

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
                {isPlatformRole ? (
                  <p className="ltr-nums">
                    <span className="text-muted-foreground">{t("admin.tenantsRegistered")}: </span>
                    {overview.data?.registeredTenants ?? "—"}
                  </p>
                ) : null}
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
                  <Label required>{t("admin.feeAmount", "Amount (base currency)")}</Label>
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
                  <Label required>Email</Label>
                  <Input type="email" value={uEmail} onChange={(e) => setUEmail(e.target.value)} autoComplete="off" />
                </div>
                <div className="space-y-2">
                  <Label required>{t("admin.tempPassword", "Temporary password")}</Label>
                  <Input type="password" value={uPassword} onChange={(e) => setUPassword(e.target.value)} autoComplete="new-password" />
                </div>
                <div className="space-y-2">
                  <Label required>{t("admin.displayName", "Display name")}</Label>
                  <Input value={uName} onChange={(e) => setUName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{t("profile.roleLabel")}</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={uRole}
                    onChange={(e) => setURole(e.target.value)}
                  >
                    {USER_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {formatUserRole(r, t)}
                      </option>
                    ))}
                  </select>
                </div>
                {uRole === "CLINIC_ADMIN" || uRole === "BRANCH_MANAGER" ? (
                  <div className="space-y-2 sm:col-span-full">
                    <Label required>{t("admin.clinicAdminScopes")}</Label>
                    <p className="text-xs text-muted-foreground">{t("admin.clinicAdminScopesHint")}</p>
                    <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border border-border p-2">
                      {clinics.map((c) => (
                        <label key={c.id} className="flex cursor-pointer items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="size-4 rounded border-input"
                            checked={uClinicIds.includes(c.id)}
                            onChange={() =>
                              setUClinicIds((prev) => (prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id]))
                            }
                          />
                          <span>
                            {formatClinicName(c, i18n.language)}{" "}
                            <span className="text-muted-foreground">({clinicKindLabel(c.kind, t)})</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="flex items-end sm:col-span-2">
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
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">{t("admin.addClinic", "Clinics: parent & branches")}</CardTitle>
          <OrgHierarchyPanel scope="tenant" />
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
              <ClinicFormFields
                idPrefix="admin-add-clinic"
                values={addClinicForm}
                onChange={(patch) => setAddClinicForm((prev) => ({ ...prev, ...patch }))}
                showParentPicker
                parentClinicItems={parentClinicPickItems}
              />
              {clinicErr ? <p className="text-sm text-destructive">{clinicErr}</p> : null}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={() => setAddClinicOpen(false)}>
                  {t("common.cancel")}
                </Button>
                <Button
                  type="button"
                  disabled={createClinicMut.isPending}
                  onClick={handleCreateClinic}
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
          <ResponsiveTable>
            <table className="w-full min-w-[960px] text-sm">
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
                  <tr
                    key={c.id}
                    className={cn(
                      "cursor-pointer border-t border-border hover:bg-muted/40",
                      selectedClinicId === c.id && "bg-muted/50",
                    )}
                    onClick={() => setSelectedClinicId(c.id)}
                  >
                    <td className="px-2 py-2 font-medium">{formatClinicName(c, i18n.language)}</td>
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
          </ResponsiveTable>
          {filteredClinics.length === 0 ? (
            <p className="mt-2 text-center text-sm text-muted-foreground">{t("admin.noClinicsMatch", "No clinics match the filters.")}</p>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={Boolean(selectedClinicId)} onOpenChange={(open) => !open && setSelectedClinicId(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>
              {t("platform.tabs.editClinic", "Edit clinic")}
              {selectedClinicDetail.data ? ` — ${formatClinicName(selectedClinicDetail.data, i18n.language)}` : ""}
            </DialogTitle>
          </DialogHeader>
          {selectedClinicDetail.isPending ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : selectedClinicDetail.isError ? (
            <p className="text-sm text-destructive">
              {selectedClinicDetail.error instanceof Error ? selectedClinicDetail.error.message : t("common.error")}
            </p>
          ) : (
            <div className="space-y-4">
              <ClinicFormFields
                idPrefix="admin-edit-clinic"
                values={editClinicForm}
                onChange={(patch) => setEditClinicForm((prev) => ({ ...prev, ...patch }))}
              />
              {editClinicErr ? <p className="text-sm text-destructive">{editClinicErr}</p> : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={patchClinicMut.isPending}
                  onClick={handlePatchClinic}
                >
                  {t("platform.saveClinic", "Save clinic")}
                </Button>
                <Button type="button" variant="outline" onClick={() => setSelectedClinicId(null)}>
                  {t("common.cancel", "Cancel")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {isPlatformRole ? (
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
          <ResponsiveTable>
            <table className="w-full min-w-[960px] text-sm">
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
          </ResponsiveTable>
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
      ) : null}
        </div>
      ) : null}
    </div>
  );
}
