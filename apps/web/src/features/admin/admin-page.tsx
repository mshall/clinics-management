import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Navigate, useLocation, useSearchParams } from "react-router-dom";
import { BaseCurrencySelect } from "@/components/base-currency-select";
import type { PickListItem } from "@/components/searchable-pick-list";
import { FilterTh, SortableTh } from "@/components/sortable-th";
import { type SortOrder } from "@/components/sort-utils";
import { toggleSort } from "@/components/sort-utils";
import { ValidationIssuesDialog } from "@/components/validation-issues-dialog";
import { ResponsiveTable } from "@/components/responsive-table";
import { TablePagination } from "@/components/table-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useValidationIssuesDialog } from "@/hooks/use-validation-issues-dialog";
import { collectClinicFormIssues } from "@/lib/create-form-validation";
import { useAdminOverviewQuery, useClinicQuery, useClinicsQuery, useTenantsQuery } from "@/lib/api-hooks";
import { ApiError, apiPatch, apiPost } from "@/lib/http";
import { cn, columnFilterIncludes } from "@/lib/utils";
import { formatClinicName } from "@/lib/locale-display";
import { clinicKindLabel, isRootClinic } from "@/lib/clinic-kind";
import { useAuthStore } from "@/stores/auth-store";
import { useOrgBaseCurrency } from "@/lib/use-org-base-currency";
import { nativeSelectClassName } from "@/lib/form-control-styles";
import { ClinicFormFields } from "@/features/clinics/clinic-form-fields";
import {
  clinicDetailToForm,
  clinicFormToCreatePayload,
  clinicFormToPatchPayload,
  emptyClinicForm,
  type ClinicFormValues,
} from "@/features/clinics/clinic-form-utils";
import { AdminCreateEmployeePanel } from "./admin-create-employee-panel";
import { TenantPaymentChannelsPanel } from "./tenant-payment-channels-panel";
import { AdminDataExplorerPanel } from "./admin-data-explorer-panel";
import { AdminGovernancePanel } from "./admin-governance-panel";
import { AdminInsightsPanel } from "./admin-insights-panel";
import { AdminIntegrationClientsPanel } from "./admin-integration-clients-panel";
import { AdminOrgPatientsPanel } from "./admin-org-patients-panel";
import { AdminOrgUsersPanel } from "./admin-org-users-panel";
import { StaffInvitationsPanel } from "./staff-invitations-panel";
import { OrgRbacPanel } from "./org-rbac-panel";
import { OrgHierarchyPanel } from "@/features/org-hierarchy/org-hierarchy-panel";
import { ClinicInvoiceSettingsPanel } from "@/features/invoices/clinic-invoice-settings-panel";
import { ClinicPrescriptionSettingsPanel } from "@/features/prescriptions/clinic-prescription-settings-panel";
import { PageHeader } from "@/brand/ui-kit";
import { SectionNav } from "@/components/section-nav";
import { TenantFeatureFlagsPanel } from "./tenant-feature-flags-panel";
import { OrgWhatsAppRemindersCard } from "./org-whatsapp-reminders-card";
import { OrgSignInDefaultCard } from "./org-sign-in-default-card";
import { AdminOrgBillingPanel } from "./admin-org-billing-panel";
import { AdminKiorlyInvoicesPanel } from "./admin-kiorly-invoices-panel";
import { AdminKiorlyStatementsPanel } from "./admin-kiorly-statements-panel";
import { AdminKiorexChargesPanel } from "./admin-kiorex-charges-panel";
import { AdminKiorexCommissionsPanel } from "./admin-kiorex-commissions-panel";
import { LiteAdminSettings } from "./lite-admin-settings";
import { useSyncOnChange } from "@/lib/use-sync-on-change";

type GroupAdminSection = "clinics" | "users" | "patients" | "organization" | "data" | "governance" | "insights";
type ClinicAdminSection = "staff" | "organization" | "governance" | "insights";

const GROUP_ADMIN_SECTIONS = new Set<string>([
  "clinics",
  "users",
  "patients",
  "organization",
  "data",
  "governance",
  "insights",
]);
const CLINIC_ADMIN_SECTIONS = new Set<string>(["staff", "organization", "governance", "insights"]);

function parseGroupAdminSection(raw: string | null): GroupAdminSection {
  return raw && GROUP_ADMIN_SECTIONS.has(raw) ? (raw as GroupAdminSection) : "clinics";
}

function parseClinicAdminSection(raw: string | null): ClinicAdminSection {
  return raw && CLINIC_ADMIN_SECTIONS.has(raw) ? (raw as ClinicAdminSection) : "staff";
}

export function AdminPage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { hash } = useLocation();
  const authUser = useAuthStore((s) => s.user);
  const refreshSession = useAuthStore((s) => s.refreshSessionFromServer);
  const orgBaseCurrency = useOrgBaseCurrency();
  // the self-serve owner is a physician with GROUP_ADMIN as an additional role: the page (and the API) treat them as group admin
  const isGroupAdmin = authUser?.role === "group_admin" || Boolean(authUser?.additionalRoles?.includes("group_admin"));
  const isClinicAdmin = authUser?.role === "clinic_admin";
  const isBranchManager = authUser?.role === "branch_manager";
  const isGroupSupervisor = authUser?.role === "group_supervisor";
  const canViewInsights =
    isGroupAdmin ||
    isClinicAdmin ||
    isBranchManager ||
    isGroupSupervisor ||
    authUser?.role === "hr_officer" ||
    authUser?.role === "finance_officer";
  const canManageOrgUserNavTabs = isGroupAdmin || isClinicAdmin;
  const canManageOrgBilling =
    isGroupAdmin || authUser?.role === "finance_officer" || Boolean(authUser?.isTenantOwner);
  const canViewOrgBilling = canManageOrgBilling || canViewInsights;
  const isPlatformSuperAdmin = Boolean(authUser?.platformSuperAdmin);
  const isPlatformRole = authUser?.role === "platform_super_admin";
  const isLitePlan = authUser?.plan?.key?.toUpperCase() === "LITE";
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
  const [editClinicForm, setEditClinicForm] = useState<ClinicFormValues>(() => emptyClinicForm(orgBaseCurrency));
  const selectedClinicDetail = useClinicQuery(selectedClinicId ?? undefined);

  const [addClinicForm, setAddClinicForm] = useState<ClinicFormValues>(() => emptyClinicForm(orgBaseCurrency));
  const createClinicValidation = useValidationIssuesDialog({ intent: "create" });
  const patchClinicValidation = useValidationIssuesDialog({ intent: "save" });

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

  const editParentClinicPickItems: PickListItem[] = useMemo(
    () =>
      clinics
        .filter((c) => isRootClinic(c) && c.id !== selectedClinicId)
        .map((c) => ({ value: c.id, label: formatClinicName(c, i18n.language) })),
    [clinics, i18n.language, selectedClinicId],
  );

  const editBranchCount = useMemo(
    () => (selectedClinicId ? clinics.filter((c) => c.parentClinicId === selectedClinicId).length : 0),
    [clinics, selectedClinicId],
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
    setAddClinicForm(emptyClinicForm(orgBaseCurrency));
  };

  useSyncOnChange([selectedClinicId, selectedClinicDetail.data], () => {
    if (!selectedClinicId || !selectedClinicDetail.data) return;
    setEditClinicForm(clinicDetailToForm(selectedClinicDetail.data, orgBaseCurrency));
    patchClinicValidation.clear();
  });

  const patchClinicMut = useMutation({
    mutationFn: () =>
      apiPatch(`/api/v1/clinics/${selectedClinicId}`, clinicFormToPatchPayload(editClinicForm, orgBaseCurrency)),
    onSuccess: () => {
      patchClinicValidation.clear();
      setSelectedClinicId(null);
      void qc.invalidateQueries({ queryKey: ["clinics"] });
      void qc.invalidateQueries({ queryKey: ["org-hierarchy"] });
    },
    onError: (e: unknown) => patchClinicValidation.showError(e),
  });

  const createClinicMut = useMutation({
    mutationFn: () => apiPost("/api/v1/clinics", clinicFormToCreatePayload(addClinicForm, { orgBaseCurrency })),
    onSuccess: () => {
      createClinicValidation.clear();
      resetClinicForm();
      setAddClinicOpen(false);
      void qc.invalidateQueries({ queryKey: ["clinics"] });
      void qc.invalidateQueries({ queryKey: ["org-hierarchy"] });
    },
    onError: (e: unknown) => createClinicValidation.showError(e),
  });

  const handleCreateClinic = () => {
    if (createClinicMut.isPending) return;
    const issues = collectClinicFormIssues(addClinicForm, t);
    if (issues.length > 0) {
      createClinicValidation.showIssues(issues);
      return;
    }
    createClinicMut.mutate();
  };

  const handlePatchClinic = () => {
    if (patchClinicMut.isPending) return;
    const issues = collectClinicFormIssues(editClinicForm, t);
    if (issues.length > 0) {
      patchClinicValidation.showIssues(issues);
      return;
    }
    patchClinicMut.mutate();
  };

  const tenantRows = useMemo(() => tenants.data?.items ?? [], [tenants.data?.items]);
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


  // Side-nav deep links and in-page SectionNav share ?section= so the URL stays the source of truth.
  const adminSection = parseGroupAdminSection(searchParams.get("section"));
  const clinicAdminSection = parseClinicAdminSection(searchParams.get("section"));
  const setAdminSection = useCallback(
    (id: GroupAdminSection) => {
      setSearchParams({ section: id }, { replace: true });
    },
    [setSearchParams],
  );
  const setClinicAdminSection = useCallback(
    (id: ClinicAdminSection) => {
      setSearchParams({ section: id }, { replace: true });
    },
    [setSearchParams],
  );
  // Quick-setup / wizard deep-link: scroll to the WhatsApp reminders card once the org section is painted.
  useEffect(() => {
    if (hash !== "#whatsapp-reminders") return;
    if (adminSection !== "organization" && clinicAdminSection !== "organization") return;
    const id = window.setTimeout(() => {
      const el = document.getElementById("whatsapp-reminders");
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.focus?.({ preventScroll: true });
    }, 80);
    return () => window.clearTimeout(id);
  }, [hash, adminSection, clinicAdminSection]);
  const [feeDraft, setFeeDraft] = useState("");
  const [currencyDraft, setCurrencyDraft] = useState<string>(orgBaseCurrency);
  const [trnDraft, setTrnDraft] = useState("");
  const [vatDraft, setVatDraft] = useState("");
  const [feeOverride, setFeeOverride] = useState(false);
  const [trnOverride, setTrnOverride] = useState(false);
  const [vatOverride, setVatOverride] = useState(false);
  const [operationAcquisitionRequiredDraft, setOperationAcquisitionRequiredDraft] = useState(false);
  useSyncOnChange([isPlatformSuperAdmin, isGroupAdmin, adminSection], () => {
    if (!isPlatformSuperAdmin && !isGroupAdmin && adminSection === "data") setAdminSection("clinics");
  });
  useSyncOnChange([overview.data?.currentTenant], () => {
    const t = overview.data?.currentTenant;
    if (!t) return;
    setFeeOverride(!t.defaultVisitFeeUsesMarketDefault);
    setTrnOverride(!t.defaultTaxRegistrationNumberUsesMarketDefault);
    setVatOverride(!t.defaultInvoiceVatPercentUsesMarketDefault);
    setFeeDraft(
      String(
        t.defaultVisitFeeUsesMarketDefault
          ? (t.marketTaxDefaults?.defaultVisitFee ?? t.defaultVisitFee)
          : (t.defaultVisitFeeOverride ?? t.defaultVisitFee),
      ),
    );
  });
  useSyncOnChange([overview.data?.currentTenant?.baseCurrency], () => {
    const bc = overview.data?.currentTenant?.baseCurrency;
    if (bc) setCurrencyDraft(bc);
  });
  useSyncOnChange([overview.data?.currentTenant?.operationAcquisitionRequired], () => {
    const t = overview.data?.currentTenant;
    if (!t) return;
    setOperationAcquisitionRequiredDraft(Boolean(t.operationAcquisitionRequired));
  });
  useSyncOnChange([overview.data?.currentTenant], () => {
    const t = overview.data?.currentTenant;
    if (!t) return;
    const trn = t.defaultTaxRegistrationNumberUsesMarketDefault
      ? (t.defaultTaxRegistrationNumber ?? "")
      : (t.defaultTaxRegistrationNumberOverride ?? t.defaultTaxRegistrationNumber ?? "");
    setTrnDraft(trn);
    const vat = t.defaultInvoiceVatPercentUsesMarketDefault
      ? (t.marketTaxDefaults?.invoiceVatPercent ?? t.defaultInvoiceVatPercent)
      : (t.defaultInvoiceVatPercentOverride ?? t.defaultInvoiceVatPercent);
    if (Number.isFinite(Number(vat))) setVatDraft(String(vat));
  });
  const patchOrgSettingsMut = useMutation({
    mutationFn: () => {
      const vatN = Number.parseFloat(vatDraft);
      return apiPatch("/api/v1/admin/tenant-settings", {
        baseCurrency: currencyDraft,
        operationAcquisitionRequired: operationAcquisitionRequiredDraft,
        ...(feeOverride
          ? { defaultVisitFee: Number.parseFloat(feeDraft) }
          : { defaultVisitFeeUseMarketDefault: true }),
        ...(trnOverride
          ? { defaultTaxRegistrationNumber: trnDraft.trim() || null }
          : { defaultTaxRegistrationNumberUseMarketDefault: true }),
        ...(vatOverride
          ? { defaultInvoiceVatPercent: Number.isFinite(vatN) ? vatN : 0 }
          : { defaultInvoiceVatPercentUseMarketDefault: true }),
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin", "overview"] });
      await qc.invalidateQueries({ queryKey: ["clinics"] });
      await refreshSession();
      toast.success(t("admin.orgSettingsSaved", "Organization settings saved."));
    },
    onError: (e: unknown) => {
      if (e instanceof ApiError && e.body && typeof e.body === "object" && "message" in e.body) {
        toast.error(String((e.body as { message?: unknown }).message));
      } else toast.error(e instanceof Error ? e.message : String(e));
    },
  });

  if (authUser && !isGroupAdmin && !isClinicAdmin && !isBranchManager && !isGroupSupervisor) {
    return <Navigate to="/" replace />;
  }
  if (isClinicAdmin || isBranchManager) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={t("nav.admin", "Administration")}
          description={isBranchManager
            ? t("admin.branchManagerSubtitle", "Staff onboarding and governance for clinics you manage.")
            : t("admin.clinicAdminSubtitle", "Staff onboarding and clinic governance.")}
          actions={<OrgHierarchyPanel scope="tenant" />}
          className="mb-1"
        />
        <SectionNav
          label={t("admin.sections", "Administration sections")}
          value={clinicAdminSection}
          onChange={setClinicAdminSection}
          items={[
            { id: "staff", label: t("admin.tabStaffOnboarding", "Staff onboarding") },
            { id: "organization", label: t("admin.tabOrganization", "Organization & settings"), hidden: !isClinicAdmin },
            { id: "governance", label: t("admin.tabGovernance") },
            { id: "insights", label: t("admin.tabInsights", "Insights & performance"), hidden: !canViewInsights },
          ]}
        />
        {clinicAdminSection === "staff" ? (
          <div className="space-y-6">
            <StaffInvitationsPanel />
            <AdminCreateEmployeePanel />
          </div>
        ) : null}
        {clinicAdminSection === "organization" && isClinicAdmin ? (
          <div className="space-y-6">
            <OrgRbacPanel />
            <AdminIntegrationClientsPanel />
          </div>
        ) : null}
        {clinicAdminSection === "governance" ? <AdminGovernancePanel /> : null}
        {clinicAdminSection === "insights" && canViewInsights ? <AdminInsightsPanel /> : null}
      </div>
    );
  }

  if (isLitePlan && !isPlatformRole) {
    return (
      <div className="space-y-6">
        <PageHeader className="mb-1" title={t("liteAdmin.pageTitle")} description={t("liteAdmin.subtitle")} />
        <StaffInvitationsPanel />
        <LiteAdminSettings />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        className="mb-1"
        title={overview.data?.currentTenant?.name ? `${overview.data.currentTenant.name} ${t("admin.title")}` : t("admin.title")}
        description={t("admin.subtitle")}
      />

      {overview.isError ? (
        <p className="text-sm text-destructive">
          {overview.error instanceof Error ? overview.error.message : t("common.error")}
        </p>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <SectionNav
          className="min-w-0 flex-1"
          label={t("admin.sections", "Administration sections")}
          value={adminSection}
          onChange={setAdminSection}
          items={[
            { id: "clinics", label: t("admin.tabClinics", "Clinics & tenants") },
            { id: "users", label: t("admin.tabOrgUsers", "Organization users"), hidden: !isGroupAdmin },
            { id: "patients", label: t("admin.tabOrgPatients", "Organization patients"), hidden: !isGroupAdmin },
            { id: "organization", label: t("admin.tabOrganization", "Organization & settings") },
            { id: "data", label: t("admin.tabDataExplorer", "Data explorer"), hidden: !(isGroupAdmin || isPlatformSuperAdmin) },
            { id: "governance", label: t("admin.tabGovernance") },
            { id: "insights", label: t("admin.tabInsights", "Insights & performance"), hidden: !canViewInsights },
          ]}
        />
      </div>

      {adminSection === "governance" ? (
        <AdminGovernancePanel />
      ) : adminSection === "insights" && canViewInsights ? (
        <AdminInsightsPanel />
      ) : adminSection === "users" && isGroupAdmin ? (
        <div className="space-y-6">
          <StaffInvitationsPanel />
          <AdminOrgUsersPanel />
        </div>
      ) : adminSection === "patients" && isGroupAdmin ? (
        <AdminOrgPatientsPanel />
      ) : adminSection === "data" ? (
        isGroupAdmin || isPlatformSuperAdmin ? (
          <AdminDataExplorerPanel />
        ) : null
      ) : adminSection === "organization" ? (
        <div className="space-y-6">
          {canViewOrgBilling ? (
            <>
              <AdminOrgBillingPanel canManage={canManageOrgBilling} />
              <AdminKiorexChargesPanel />
              <AdminKiorexCommissionsPanel />
              <AdminKiorlyInvoicesPanel canManagePay={canManageOrgBilling} />
              <AdminKiorlyStatementsPanel />
            </>
          ) : null}
          {isGroupAdmin ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("admin.orgSettings", "Organization settings")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-x-4 gap-y-6 sm:grid-cols-2">
                  <div className="grid grid-rows-[auto_auto_minmax(2.75rem,auto)] gap-2">
                    <div className="flex min-h-11 items-end">
                      <Label htmlFor="org-base-currency">{t("platform.baseCurrency", "Base currency")}</Label>
                    </div>
                    <BaseCurrencySelect
                      id="org-base-currency"
                      className="h-11"
                      value={currencyDraft}
                      onChange={setCurrencyDraft}
                    />
                    <p className="text-xs leading-snug text-muted-foreground">
                      {t(
                        "admin.orgBaseCurrencyHint",
                        "Default currency for all clinics unless a clinic sets its own override.",
                      )}
                    </p>
                  </div>
                  <div className="grid grid-rows-[auto_auto_minmax(2.75rem,auto)] gap-2">
                    <div className="flex min-h-11 items-end">
                      <Label htmlFor="org-visit-fee" required>
                        {t("admin.feeAmount", "Default visit fee ({{currency}})", { currency: currencyDraft })}
                      </Label>
                    </div>
                    <Input
                      id="org-visit-fee"
                      className="ltr-nums w-full"
                      type="number"
                      min="0"
                      step="0.01"
                      value={feeDraft}
                      disabled={!feeOverride}
                      onChange={(e) => setFeeDraft(e.target.value)}
                    />
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={feeOverride}
                        onChange={(e) => setFeeOverride(e.target.checked)}
                      />
                      {t("admin.orgOverrideMarketDefault", "Override market default")}
                    </label>
                    <p className="text-xs leading-snug text-muted-foreground">
                      {t(
                        "admin.orgVisitFeeHint",
                        "From your country market pack unless overridden. Used when a clinic does not set its own visit fee.",
                      )}
                    </p>
                  </div>
                  <div className="grid grid-rows-[auto_auto_minmax(2.75rem,auto)] gap-2">
                    <div className="flex min-h-11 items-end">
                      <Label htmlFor="org-trn">{t("admin.orgTaxRegistrationNumber", "Tax registration (TRN)")}</Label>
                    </div>
                    <Input
                      id="org-trn"
                      className="ltr-nums w-full"
                      value={trnDraft}
                      disabled={!trnOverride}
                      onChange={(e) => setTrnDraft(e.target.value)}
                      placeholder={t("admin.orgTrnPlaceholder", "Market default")}
                    />
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={trnOverride}
                        onChange={(e) => setTrnOverride(e.target.checked)}
                      />
                      {t("admin.orgOverrideMarketDefault", "Override market default")}
                    </label>
                    <p className="text-xs leading-snug text-muted-foreground">
                      {t(
                        "admin.orgTrnHint",
                        "Format is validated for your market.",
                      )}
                    </p>
                  </div>
                  <div className="grid grid-rows-[auto_auto_minmax(2.75rem,auto)] gap-2">
                    <div className="flex min-h-11 items-end">
                      <Label htmlFor="org-vat">{t("admin.orgInvoiceVatPercent", "VAT % on invoices")}</Label>
                    </div>
                    <Input
                      id="org-vat"
                      className="ltr-nums w-full"
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      value={vatDraft}
                      disabled={!vatOverride}
                      onChange={(e) => setVatDraft(e.target.value)}
                    />
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={vatOverride}
                        onChange={(e) => setVatOverride(e.target.checked)}
                      />
                      {t("admin.orgOverrideMarketDefault", "Override market default")}
                    </label>
                    <p className="text-xs leading-snug text-muted-foreground">
                      {t(
                        "admin.orgVatHint",
                        "Medical services VAT from your market pack unless overridden. Saving updates all clinics for tax invoices.",
                      )}
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  disabled={
                    patchOrgSettingsMut.isPending ||
                    feeDraft === "" ||
                    !currencyDraft ||
                    vatDraft === "" ||
                    Number.isNaN(Number.parseFloat(vatDraft))
                  }
                  onClick={() => patchOrgSettingsMut.mutate()}
                >
                  {t("common.save", "Save")}
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {isGroupAdmin ? (
            <Card data-testid="admin-operation-settings">
              <CardHeader>
                <CardTitle className="text-base">
                  {t("admin.operationSettings", "Operation settings")}
                </CardTitle>
                <CardDescription>
                  {t(
                    "admin.operationSettingsHint",
                    "Controls required fields when staff create an operation.",
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="op-acquisition-required">
                    {t("admin.operationAcquisitionRequired", "How did they find us?")}
                  </Label>
                  <select
                    id="op-acquisition-required"
                    className={nativeSelectClassName}
                    value={operationAcquisitionRequiredDraft ? "required" : "optional"}
                    onChange={(e) =>
                      setOperationAcquisitionRequiredDraft(e.target.value === "required")
                    }
                    data-testid="admin-operation-acquisition-required"
                  >
                    <option value="optional">
                      {t("admin.operationAcquisitionOptional", "Optional (default)")}
                    </option>
                    <option value="required">
                      {t("admin.operationAcquisitionMandatory", "Mandatory")}
                    </option>
                  </select>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "admin.operationAcquisitionRequiredHint",
                      "When mandatory, staff must select an acquisition channel before saving a new operation.",
                    )}
                  </p>
                </div>
                <Button
                  type="button"
                  disabled={patchOrgSettingsMut.isPending}
                  onClick={() => patchOrgSettingsMut.mutate()}
                >
                  {t("admin.saveOperationSettings", "Save operation settings")}
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {isGroupAdmin || authUser?.isTenantOwner ? <OrgWhatsAppRemindersCard /> : null}

          {isGroupAdmin ? <OrgSignInDefaultCard /> : null}

          {isGroupAdmin ? <TenantPaymentChannelsPanel /> : null}

          {canManageOrgUserNavTabs ? <OrgRbacPanel /> : null}

          {isGroupAdmin || isClinicAdmin ? <AdminIntegrationClientsPanel /> : null}

          {isGroupAdmin ? (
            <TenantFeatureFlagsPanel flags={overview.data?.featureFlags ?? []} canEdit />
          ) : (
            <TenantFeatureFlagsPanel flags={overview.data?.featureFlags ?? []} canEdit={false} />
          )}

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
                createClinicValidation.clear();
                resetClinicForm();
              }
            }}
          >
            <DialogContent className="max-h-[min(90vh,40rem)] overflow-y-auto sm:max-w-xl" aria-describedby={undefined}>
              <DialogHeader>
                <DialogTitle>{t("admin.addClinicDialogTitle")}</DialogTitle>
              </DialogHeader>
              <ClinicFormFields
                idPrefix="admin-add-clinic"
                values={addClinicForm}
                onChange={(patch) => setAddClinicForm((prev) => ({ ...prev, ...patch }))}
                showStructureEditor
                parentClinicItems={parentClinicPickItems}
              />
              {createClinicValidation.formErr ? (
                <p className="text-sm text-destructive">{createClinicValidation.formErr}</p>
              ) : null}
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
                      <Input className="h-8 text-base sm:text-xs" value={cfNameEn} onChange={(e) => setCfNameEn(e.target.value)} placeholder="…" />
                    </div>
                  </th>
                  <th className="align-top px-2 py-2 text-start">
                    <div className="space-y-1">
                      <span className="text-xs font-medium text-muted-foreground">{t("admin.parentClinicCol", "Parent clinic")}</span>
                      <Input className="h-8 text-base sm:text-xs" value={cfParent} onChange={(e) => setCfParent(e.target.value)} placeholder="…" />
                    </div>
                  </th>
                  <th className="align-top px-2 py-2 text-start">
                    <div className="space-y-1">
                      <span className="text-xs font-medium text-muted-foreground">{t("admin.nameAr", "Name (AR)")}</span>
                      <Input className="h-8 text-base sm:text-xs" value={cfNameAr} onChange={(e) => setCfNameAr(e.target.value)} placeholder="…" />
                    </div>
                  </th>
                  <th className="align-top px-2 py-2 text-start">
                    <div className="space-y-1">
                      <span className="text-xs font-medium text-muted-foreground">{t("admin.city", "City")}</span>
                      <Input className="h-8 text-base sm:text-xs" value={cfCity} onChange={(e) => setCfCity(e.target.value)} placeholder="…" />
                    </div>
                  </th>
                  <th className="align-top px-2 py-2 text-start">
                    <div className="space-y-1">
                      <span className="text-xs font-medium text-muted-foreground">{t("admin.country", "Country")}</span>
                      <Input className="h-8 text-base sm:text-xs" value={cfCountry} onChange={(e) => setCfCountry(e.target.value)} placeholder="…" />
                    </div>
                  </th>
                  <th className="align-top px-2 py-2 text-start">
                    <div className="space-y-1">
                      <span className="text-xs font-medium text-muted-foreground">{t("admin.kind", "Kind")}</span>
                      <Input className="h-8 text-base sm:text-xs" value={cfKind} onChange={(e) => setCfKind(e.target.value)} placeholder="parent / branch" />
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
                      <Badge variant={c.kind === "branch" ? "secondary" : c.kind === "parent" ? "default" : "outline"}>
                        {clinicKindLabel(c.kind, t)}
                      </Badge>
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
                showStructureEditor
                parentClinicItems={editParentClinicPickItems}
                currentKind={selectedClinicDetail.data?.kind}
                branchCount={editBranchCount}
              />
              {selectedClinicDetail.data ? (
                <ClinicInvoiceSettingsPanel clinicId={selectedClinicDetail.data.id} detail={selectedClinicDetail.data} />
              ) : null}
              {selectedClinicDetail.data ? (
                <ClinicPrescriptionSettingsPanel clinicId={selectedClinicDetail.data.id} detail={selectedClinicDetail.data} />
              ) : null}
              {patchClinicValidation.formErr ? (
                <p className="text-sm text-destructive">{patchClinicValidation.formErr}</p>
              ) : null}
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
      <ValidationIssuesDialog {...createClinicValidation.dialogProps} />
      <ValidationIssuesDialog {...patchClinicValidation.dialogProps} />
    </div>
  );
}
