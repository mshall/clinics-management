import type { ReactNode } from "react";
import {
  Bell,
  CalendarPlus,
  Camera,
  FileStack,
  GitMerge,
  HeartPulse,
  Images,
  LayoutGrid,
  Receipt,
  Scissors,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";
import { AppointmentCreateWizard } from "@/features/appointments/appointment-create-wizard";
import { PatientEncounterCreateDialog } from "@/features/encounters/patient-encounter-create-dialog";
import { PatientMoneySection } from "@/features/patients/patient-money-section";
import { canUsePatientMoney } from "@/lib/patient-money-policy";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PatientEditDialog } from "@/components/patient-edit-dialog";
import { PatientClinicalDocuments } from "@/components/patient-clinical-documents";
import { PatientInvoicesSection } from "@/features/invoices/patient-invoices-section";
import { OutboundMessageLog } from "@/features/messaging/outbound-message-log";
import { PatientMessagingConsentCard } from "@/features/patients/patient-messaging-consent-card";
import { PatientRecordShareConsentCard } from "@/features/patients/patient-record-share-consent-card";
import { PatientEncountersSection } from "@/features/patients/patient-encounters-section";
import { PatientOperationsSection } from "@/features/patients/patient-operations-section";
import { PatientAllergiesSection } from "@/components/patient-allergies-section";
import { Patient360Summary } from "@/components/patient-360-summary";
import { PreVisitSmartSummaryCard } from "@/features/clinical/pre-visit-smart-summary-card";
import { PatientFamilyPanel } from "@/components/patient-family-panel";
import { PatientMergeWizard } from "@/components/patient-merge-wizard";
import { PatientClinicalPhotoGallery } from "@/components/patient-clinical-photo-gallery";
import { PatientChartAlerts } from "@/components/patient-chart-alerts";
import { PatientPrivacyNoticeLink } from "@/components/patient-privacy-notice-link";
import { PatientConsentChips } from "@/features/patients/patient-consent-chips";
import { PatientVitalsCharts } from "@/components/patient-vitals-charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { featureTabTriggerClassName, featureTabsListClassName } from "@/lib/feature-tabs";
import { ResponsiveTable } from "@/components/responsive-table";
import { TablePagination } from "@/components/table-pagination";
import { useClinicsQuery, useEncountersQuery, usePatientQuery } from "@/lib/api-hooks";
import { apiFetchBlob } from "@/lib/http";
import { enhanceImageFile } from "@/lib/enhance-image";
import { calculateAgeFromDob, formatPatientDob, localeForLanguage } from "@/lib/locale-display";
import { patientAcquisitionDisplay, type PatientAcquisitionChannel } from "@/lib/patient-acquisition";
import { showNavItem } from "@/lib/nav-policy";
import { canEditPatientDetails } from "@/lib/patient-edit-policy";
import {
  canMutateAppointmentsNav,
  canMutateEncountersNav,
  canMutateNavTab,
} from "@/lib/nav-tab-access-policy";
import { canCreateOperation } from "@/lib/operation-money-policy";
import { canEditOperationStage2 } from "@/lib/operation-stage-policy";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";

export function PatientDetailPage() {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.user?.role);
  const authUser = useAuthStore((s) => s.user);
  const navTabKeys = useAuthStore((s) => s.user?.navTabKeys);
  const navTabAccessModes = useAuthStore((s) => s.user?.navTabAccessModes);
  const roleNavTabKeys = useAuthStore((s) => s.user?.roleNavTabKeys);
  const canViewEncounters = showNavItem(role, "encounters", navTabKeys, roleNavTabKeys);
  const canViewAppointments = showNavItem(role, "appointments", navTabKeys, roleNavTabKeys);
  const canCreateAppointment = canMutateAppointmentsNav(role, navTabKeys, navTabAccessModes);
  const canCreateEncounter = canMutateEncountersNav(role, navTabKeys, navTabAccessModes);
  const canViewOperationsNav = showNavItem(role, "operations", navTabKeys, roleNavTabKeys);
  const canStartOperation = canCreateOperation(
    role,
    navTabKeys,
    navTabAccessModes,
    authUser?.additionalRoles,
  );
  /** Patient chart: show operations beside encounters when either tab is granted. */
  const canViewPatientOperations = canViewOperationsNav || canViewEncounters;
  const canEditPatient = canEditPatientDetails(role, navTabKeys, navTabAccessModes);
  const canUploadEncounterDocs = canMutateNavTab("encounters", role, navTabKeys, navTabAccessModes);
  const canUploadOperationDocs = canEditOperationStage2(role, authUser?.additionalRoles);
  type ProfileTab =
    | "overview"
    | "smartSummary"
    | "encounters"
    | "operations"
    | "medicalDocuments"
    | "invoices"
    | "money"
    | "notifications";
  const canViewMoney = canUsePatientMoney(authUser);
  const [profileTab, setProfileTab] = useState<ProfileTab>("overview");
  const [editOpen, setEditOpen] = useState(false);
  const [familyOpen, setFamilyOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [photosOpen, setPhotosOpen] = useState(false);
  const [appointmentWizardOpen, setAppointmentWizardOpen] = useState(false);
  const [encounterCreateOpen, setEncounterCreateOpen] = useState(false);
  const { data: patient, isPending, isError, error } = usePatientQuery(id);
  const [vitalsPage, setVitalsPage] = useState(1);
  const [vitalsPageSize, setVitalsPageSize] = useState(10);
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(null);
  const avatarKey = id ? `patient-avatar:${id}` : null;
  const { data: vitalsData, isPending: vitalsLoading } = useEncountersQuery({
    patientId: id,
    page: vitalsPage,
    pageSize: vitalsPageSize,
    sortBy: "updatedAt",
    sortOrder: "desc",
    enabled: Boolean(id) && canViewEncounters,
  });
  const vitalsRowsRaw = vitalsData?.items ?? [];
  const vitalsRows = useMemo(
    () =>
      vitalsRowsRaw.filter(
        (e) =>
          e.heartRate != null ||
          e.spo2 != null ||
          e.bpSystolic != null ||
          e.bpDiastolic != null ||
          e.temperature != null ||
          e.weightKg != null ||
          e.heightCm != null
      ),
    [vitalsRowsRaw]
  );
  const vitalsTotal = vitalsData?.total ?? 0;
  const vitalsTotalPages = vitalsData?.totalPages ?? 1;
  const { data: clinics = [] } = useClinicsQuery();

  const defaultClinicId = patient?.homeBranchId ?? clinics[0]?.id ?? "";

  useEffect(() => {
    if (!avatarKey) return;
    const saved = window.localStorage.getItem(avatarKey);
    setAvatarDataUrl(saved || null);
  }, [avatarKey]);

  const onAvatarChange = async (file: File | null) => {
    if (!avatarKey) return;
    if (!file) return;
    const max = 2 * 1024 * 1024;
    const enhanced = await enhanceImageFile(file, "avatar");
    if (enhanced.size > max) return;
    const dataUrl = await fileToDataUrl(enhanced);
    window.localStorage.setItem(avatarKey, dataUrl);
    setAvatarDataUrl(dataUrl);
  };

  if (isPending) {
    return <p className="text-muted-foreground">{t("common.loading")}</p>;
  }

  if (isError || !patient) {
    return (
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>{t("patients.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {isError && error instanceof Error ? error.message : t("patients.notFound")}
          </p>
          <Button asChild variant="secondary">
            <Link to="/patients">{t("nav.patients")}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const name =
    i18n.language === "ar" && patient.firstNameAr
      ? `${patient.firstNameAr} ${patient.lastNameAr ?? ""}`
      : `${patient.firstNameEn} ${patient.lastNameEn}`;

  const locale = localeForLanguage(i18n.language);
  const patientAge = patient.dob ? calculateAgeFromDob(patient.dob) : null;

  return (
    <div className="space-y-6 doctor-mobile-view">
      <Card className="border-b">
        <CardContent className="pt-4 md:pt-5">
          <div className="flex flex-col gap-4 md:gap-6 md:flex-row md:items-start md:justify-between">
            <div className="flex items-start gap-3 md:gap-4">
              <div className="relative">
                {avatarDataUrl ? (
                  <img src={avatarDataUrl} alt={name} className="h-16 w-16 rounded-full border object-cover md:h-20 md:w-20" />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-full border border-primary/20 bg-accent text-xl font-semibold text-accent-foreground md:h-20 md:w-20">
                    {name.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <label className="absolute -bottom-1 -right-1 cursor-pointer rounded-full border bg-background p-1 shadow-xs" title={t("patients.uploadPhoto", "Upload photo")}>
                  <Camera className="h-4 w-4" />
                  <Input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => void onAvatarChange(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
                  <PatientChartAlerts patientId={patient.id} />
                  <PatientConsentChips patientId={patient.id} />
                  <PatientPrivacyNoticeLink />
                  <Badge variant="secondary" className="font-mono text-xs ltr-nums">
                    {patient.mrn}
                  </Badge>
                  {patient.isSample ? (
                    <Badge variant="outline" className="border-[hsl(var(--warning)/0.3)] text-[hsl(var(--warning))] " data-testid="sample-patient-badge">
                      {t("help.sample.badge")}
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">{patient.homeBranch ?? "—"}{patientAge != null ? <span className="ltr-nums"> · {patientAge} {t("patients.yearsShort", "y")}</span> : null}</p>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
                    onClick={() => setFamilyOpen(true)}
                  >
                    <Users className="h-3.5 w-3.5" aria-hidden />
                    {t("patients.family", "Family links")}
                  </button>
                  {canEditPatient ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
                      onClick={() => setMergeOpen(true)}
                    >
                      <GitMerge className="h-3.5 w-3.5" aria-hidden />
                      {t("patients.mergeWizard", "Merge duplicate patient")}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
                    onClick={() => setPhotosOpen(true)}
                  >
                    <Images className="h-3.5 w-3.5" aria-hidden />
                    {t("patients.photoGallery", "Clinical photo gallery")}
                  </button>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link to="/patients">{t("patients.backToList")}</Link>
              </Button>
              {canEditPatient ? (
                <Button type="button" variant="outline" onClick={() => setEditOpen(true)}>
                  {patient.profileComplete === false
                    ? t("patients.completeProfile", "Complete profile")
                    : t("patients.editPatient", "Edit patient")}
                </Button>
              ) : null}
              {canViewAppointments && canCreateAppointment ? (
                <Button
                  type="button"
                  data-testid="patient-new-appointment"
                  className={cn(
                    "relative overflow-hidden border-0 bg-linear-to-br from-sky-600 via-sky-500 to-teal-500",
                    "text-white shadow-kx-2 hover:from-sky-500 hover:via-sky-500 hover:to-teal-400",
                    "hover:shadow-kx-3",
                  )}
                  onClick={() => setAppointmentWizardOpen(true)}
                >
                  <CalendarPlus className="size-4" aria-hidden />
                  <span className="flex flex-col items-start leading-tight">
                    <span className="text-sm font-semibold">{t("patients.newAppointment", "New appointment")}</span>
                    <span className="text-[10px] font-normal text-white/85">
                      {t("patients.newAppointmentHint", "Schedule a visit")}
                    </span>
                  </span>
                </Button>
              ) : null}
              {canViewEncounters && canCreateEncounter ? (
                <Button
                  type="button"
                  data-testid="patient-new-encounter"
                  variant="create"
                  disabled={patient.profileComplete === false}
                  onClick={() => setEncounterCreateOpen(true)}
                >
                  <HeartPulse className="size-4" aria-hidden />
                  {t("patients.newEncounter")}
                </Button>
              ) : null}
              {canStartOperation ? (
                <Button
                  type="button"
                  data-testid="patient-new-operation"
                  className={cn(
                    "relative overflow-hidden border-0 bg-linear-to-br from-amber-600 via-amber-500 to-orange-500",
                    "text-white shadow-kx-2 hover:from-amber-500 hover:via-amber-500 hover:to-orange-400",
                    "hover:shadow-kx-3",
                  )}
                  onClick={() =>
                    navigate(`/operations?new=1&patientId=${encodeURIComponent(patient.id)}`)
                  }
                >
                  <Scissors className="size-4" aria-hidden />
                  <span className="flex flex-col items-start leading-tight">
                    <span className="text-sm font-semibold">
                      {t("patients.newOperation", "New operation")}
                    </span>
                    <span className="text-[10px] font-normal text-white/85">
                      {t("patients.newOperationHint", "Schedule surgery")}
                    </span>
                  </span>
                </Button>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs
        value={profileTab}
        onValueChange={(v) => setProfileTab(v as ProfileTab)}
        className="space-y-4"
      >
        <TabsList className={featureTabsListClassName}>
          <TabsTrigger value="overview" className={featureTabTriggerClassName("sky")}>
            <LayoutGrid className="h-4 w-4 shrink-0" aria-hidden />
            {t("patients.tabOverview", "Overview")}
          </TabsTrigger>
          <TabsTrigger value="smartSummary" className={featureTabTriggerClassName("violet")}>
            <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
            {t("patients.tabSmartSummary", "Smart summary")}
          </TabsTrigger>
          {canViewEncounters ? (
            <TabsTrigger value="encounters" className={featureTabTriggerClassName("emerald")}>
              <HeartPulse className="h-4 w-4 shrink-0" aria-hidden />
              {t("patients.encounters")}
            </TabsTrigger>
          ) : null}
          {canViewPatientOperations ? (
            <TabsTrigger value="operations" className={featureTabTriggerClassName("amber")}>
              <Scissors className="h-4 w-4 shrink-0" aria-hidden />
              {t("patients.tabOperations", "Operations")}
            </TabsTrigger>
          ) : null}
          <TabsTrigger value="medicalDocuments" className={featureTabTriggerClassName("sky")}>
            <FileStack className="h-4 w-4 shrink-0" aria-hidden />
            {t("patients.tabMedicalDocuments", "Medical documents")}
          </TabsTrigger>
          <TabsTrigger value="invoices" className={featureTabTriggerClassName("emerald")}>
            <Receipt className="h-4 w-4 shrink-0" aria-hidden />
            {t("patients.tabInvoices", "Invoices")}
          </TabsTrigger>
          {canViewMoney ? (
            <TabsTrigger value="money" className={featureTabTriggerClassName("violet")} data-testid="patient-tab-money">
              <Wallet className="h-4 w-4 shrink-0" aria-hidden />
              {t("patientMoney.tab")}
            </TabsTrigger>
          ) : null}
          <TabsTrigger value="notifications" className={featureTabTriggerClassName("amber")}>
            <Bell className="h-4 w-4 shrink-0" aria-hidden />
            {t("patients.tabNotificationSettings", "Notification settings")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-0 space-y-6">
      <Patient360Summary patientId={patient.id} />

      <PatientAllergiesSection patientId={patient.id} />

      <div className={`grid gap-4 ${canViewEncounters ? "xl:grid-cols-[1.1fr_1fr]" : ""}`}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("patients.personalDetails")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row
              label={t("patients.dob")}
              value={
                patient.dob ? (
                  <span className="ltr-nums">
                    {formatPatientDob(patient.dob, locale)}
                    {patientAge != null ? (
                      <span className="text-muted-foreground">
                        {" · "}
                        {t("patients.ageYears", "{{age}} years", { age: patientAge })}
                      </span>
                    ) : null}
                  </span>
                ) : (
                  t("common.notAvailable", "—")
                )
              }
            />
            <Separator />
            <Row label={t("patients.gender")} value={<span className="uppercase">{patient.gender}</span>} />
            <Separator />
            <Row label={t("patients.phone")} value={<span className="ltr-nums">{patient.phone}</span>} />
            <Separator />
            <Row
              label={t("patients.nationalId")}
              value={<span className="break-all font-mono text-xs ltr-nums">{patient.nationalId ?? "—"}</span>}
            />
            {patient.hasNationalIdDoc ? (
              <>
                <Separator />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-muted-foreground">{t("patients.nationalIdDocument")}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={async () => {
                      const { blob } = await apiFetchBlob(`/api/v1/patients/${patient.id}/national-id-document`);
                      const url = URL.createObjectURL(blob);
                      window.open(url, "_blank", "noopener,noreferrer");
                      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
                    }}
                  >
                    {t("patients.downloadNationalIdDoc")}
                  </Button>
                </div>
              </>
            ) : null}
            <Separator />
            <Row label={t("patients.email")} value={<span className="break-all">{patient.email ?? "—"}</span>} />
            <Separator />
            <Row
              label={t("patients.howDidTheyFindUs", "How did they find us?")}
              value={
                <span className="text-end">
                  {patientAcquisitionDisplay(
                    patient.acquisitionChannel as PatientAcquisitionChannel | null | undefined,
                    patient.acquisitionReferralName,
                    patient.acquisitionOtherDetail,
                    t,
                  )}
                </span>
              }
            />
          </CardContent>
        </Card>
        {canViewEncounters ? (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <HeartPulse className="h-4 w-4 text-rose-500" />
              {t("patients.vitalsHistory", "Vitals history")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {vitalsLoading ? (
              <p className="text-muted-foreground">{t("common.loading")}</p>
            ) : vitalsRows.length === 0 ? (
              <p className="text-muted-foreground">{t("patients.noVitals", "No vitals captured yet.")}</p>
            ) : (
              <div className="space-y-3">
                <ResponsiveTable>
                  <table className="w-full min-w-[640px] text-xs sm:text-sm">
                    <thead className="bg-muted/60">
                      <tr>
                        <th className="px-2 py-2 text-start font-medium text-muted-foreground">{t("encounters.updated", "Updated")}</th>
                        <th className="px-2 py-2 text-start font-medium text-muted-foreground">{t("encounters.vitalsHr")}</th>
                        <th className="px-2 py-2 text-start font-medium text-muted-foreground">{t("encounters.vitalsSpo2")}</th>
                        <th className="px-2 py-2 text-start font-medium text-muted-foreground">{t("encounters.vitalsBp")}</th>
                        <th className="px-2 py-2 text-start font-medium text-muted-foreground">{t("encounters.vitalsTemp")}</th>
                        <th className="px-2 py-2 text-start font-medium text-muted-foreground">{t("encounters.vitalsWtHt")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vitalsRows.map((e) => (
                        <tr key={e.id} className="border-t border-border">
                          <td className="px-2 py-2 ltr-nums text-xs text-muted-foreground">
                            {new Date(e.updatedAt).toLocaleString(localeForLanguage(i18n.language))}
                          </td>
                          <td className="px-2 py-2 ltr-nums">{e.heartRate ?? "—"}</td>
                          <td className="px-2 py-2 ltr-nums">{e.spo2 != null ? `${e.spo2}%` : "—"}</td>
                          <td className="px-2 py-2 ltr-nums">
                            {e.bpSystolic != null && e.bpDiastolic != null ? `${e.bpSystolic}/${e.bpDiastolic}` : "—"}
                          </td>
                          <td className="px-2 py-2 ltr-nums">{e.temperature != null ? `${e.temperature}C` : "—"}</td>
                          <td className="px-2 py-2 ltr-nums">
                            {e.weightKg != null || e.heightCm != null ? `${e.weightKg ?? "—"}/${e.heightCm ?? "—"}` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ResponsiveTable>
                <TablePagination
                  page={vitalsPage}
                  pageSize={vitalsPageSize}
                  total={vitalsTotal}
                  totalPages={vitalsTotalPages}
                  disabled={vitalsLoading}
                  onPageChange={setVitalsPage}
                  onPageSizeChange={(s) => {
                    setVitalsPageSize(s);
                    setVitalsPage(1);
                  }}
                />
              </div>
            )}
          </CardContent>
        </Card>
        ) : null}
      </div>

      {canViewEncounters ? (
        <Card>
          <CardContent className="pt-6">
            <PatientVitalsCharts patientId={patient.id} />
          </CardContent>
        </Card>
      ) : null}

        </TabsContent>

        <TabsContent value="smartSummary" className="mt-0">
          <PreVisitSmartSummaryCard patientId={patient.id} />
        </TabsContent>

        {canViewEncounters && patient ? (
          <TabsContent value="encounters" className="mt-0">
            <PatientEncountersSection patientId={patient.id} canUploadDocs={canUploadEncounterDocs} />
          </TabsContent>
        ) : null}

        {canViewPatientOperations ? (
          <TabsContent value="operations" className="mt-0">
            <PatientOperationsSection patientId={patient.id} canUploadDocs={canUploadOperationDocs} />
          </TabsContent>
        ) : null}

        <TabsContent value="medicalDocuments" className="mt-0">
          <PatientClinicalDocuments patientId={patient.id} />
        </TabsContent>

        <TabsContent value="invoices" className="mt-0">
          <PatientInvoicesSection patientId={patient.id} clinicId={patient.homeBranchId} />
        </TabsContent>

        {canViewMoney ? (
          <TabsContent value="money" className="mt-0">
            <PatientMoneySection patientId={patient.id} clinicId={patient.homeBranchId} />
          </TabsContent>
        ) : null}

        <TabsContent value="notifications" className="mt-0 space-y-6">
          <PatientMessagingConsentCard patientId={patient.id} />
          <PatientRecordShareConsentCard patientId={patient.id} />
          <OutboundMessageLog patientId={patient.id} />
        </TabsContent>
      </Tabs>

      {canEditPatient ? (
        <PatientEditDialog patient={patient} open={editOpen} onOpenChange={setEditOpen} />
      ) : null}

      <Dialog open={familyOpen} onOpenChange={setFamilyOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto sm:max-w-xl" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{t("patients.family", "Family links")}</DialogTitle>
          </DialogHeader>
          <PatientFamilyPanel patientId={patient.id} embedded />
        </DialogContent>
      </Dialog>

      {canEditPatient ? (
        <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
          <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>{t("patients.mergeWizard", "Merge duplicate patient")}</DialogTitle>
            </DialogHeader>
            <PatientMergeWizard targetPatientId={patient.id} embedded onDone={() => setMergeOpen(false)} />
          </DialogContent>
        </Dialog>
      ) : null}

      <Dialog open={photosOpen} onOpenChange={setPhotosOpen}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto sm:max-w-4xl" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{t("patients.photoGallery", "Clinical photo gallery")}</DialogTitle>
          </DialogHeader>
          <PatientClinicalPhotoGallery patientId={patient.id} embedded />
        </DialogContent>
      </Dialog>

      {canViewAppointments && canCreateAppointment ? (
        <AppointmentCreateWizard
          open={appointmentWizardOpen}
          onOpenChange={setAppointmentWizardOpen}
          lockedPatientId={patient.id}
          lockedPatientLabel={name}
        />
      ) : null}

      {canViewEncounters && canCreateEncounter ? (
        <PatientEncounterCreateDialog
          open={encounterCreateOpen}
          onOpenChange={setEncounterCreateOpen}
          patientId={patient.id}
          patientLabel={name}
          defaultClinicId={defaultClinicId}
          profileComplete={patient.profileComplete !== false}
        />
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
