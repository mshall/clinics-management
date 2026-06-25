import type { ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera, HeartPulse } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PatientEditDialog } from "@/components/patient-edit-dialog";
import { PatientClinicalDocuments } from "@/components/patient-clinical-documents";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ResponsiveTable } from "@/components/responsive-table";
import { TablePagination } from "@/components/table-pagination";
import { useClinicsQuery, useEncountersQuery, usePatientQuery } from "@/lib/api-hooks";
import type { EncounterDetailDto } from "@/lib/api-types";
import { apiFetchBlob, apiPost } from "@/lib/http";
import { enhanceImageFile } from "@/lib/enhance-image";
import { formatEncounterStatus, calculateAgeFromDob, formatPatientDob, localeForLanguage } from "@/lib/locale-display";
import { patientAcquisitionDisplay, type PatientAcquisitionChannel } from "@/lib/patient-acquisition";
import { showNavItem } from "@/lib/nav-policy";
import { canEditPatientDetails } from "@/lib/patient-edit-policy";
import { useAuthStore } from "@/stores/auth-store";

export function PatientDetailPage() {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);
  const navTabKeys = useAuthStore((s) => s.user?.navTabKeys);
  const canViewEncounters = showNavItem(role, "encounters", navTabKeys);
  const canEditPatient = canEditPatientDetails(role);
  const [editOpen, setEditOpen] = useState(false);
  const { data: patient, isPending, isError, error } = usePatientQuery(id);
  const [encPage, setEncPage] = useState(1);
  const [encPageSize, setEncPageSize] = useState(10);
  const [vitalsPage, setVitalsPage] = useState(1);
  const [vitalsPageSize, setVitalsPageSize] = useState(10);
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(null);
  const avatarKey = id ? `patient-avatar:${id}` : null;
  const { data: encData, isPending: encLoading } = useEncountersQuery({
    patientId: id,
    page: encPage,
    pageSize: encPageSize,
    sortBy: "updatedAt",
    sortOrder: "desc",
    enabled: Boolean(id) && canViewEncounters,
  });
  const { data: vitalsData, isPending: vitalsLoading } = useEncountersQuery({
    patientId: id,
    page: vitalsPage,
    pageSize: vitalsPageSize,
    sortBy: "updatedAt",
    sortOrder: "desc",
    enabled: Boolean(id) && canViewEncounters,
  });
  const encounters = encData?.items ?? [];
  const encTotal = encData?.total ?? 0;
  const encTotalPages = encData?.totalPages ?? 1;
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

  const createEncounter = useMutation({
    mutationFn: () =>
      apiPost<EncounterDetailDto>("/api/v1/encounters", {
        clinicId: defaultClinicId,
        patientId: patient!.id,
        visitType: "Office visit",
        chiefComplaint: "",
      }),
    onSuccess: (enc) => {
      void qc.invalidateQueries({ queryKey: ["encounters"] });
      void qc.invalidateQueries({ queryKey: ["patient", id] });
      void qc.invalidateQueries({ queryKey: ["appointments"] });
      void qc.invalidateQueries({ queryKey: ["revenue"] });
      void qc.invalidateQueries({ queryKey: ["dashboard", "kpis"] });
      navigate(`/encounters/${enc.id}`);
    },
    onError: (e: unknown) => {
      console.error(e);
    },
  });

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
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="flex items-start gap-4">
              <div className="relative">
                {avatarDataUrl ? (
                  <img src={avatarDataUrl} alt={name} className="h-24 w-24 rounded-full border object-cover" />
                ) : (
                  <div className="flex h-24 w-24 items-center justify-center rounded-full border bg-muted text-xl font-semibold">
                    {name.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <label className="absolute -bottom-1 -right-1 cursor-pointer rounded-full border bg-background p-1 shadow-sm" title={t("patients.uploadPhoto", "Upload photo")}>
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
                  <h1 className="text-2xl font-bold tracking-tight">{name}</h1>
                  <Badge variant="secondary" className="font-mono text-xs ltr-nums">
                    {patient.mrn}
                  </Badge>
                </div>
                <p className="text-muted-foreground">{patient.homeBranch ?? "—"}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t("patients.photoOptional", "Profile photo is optional.")}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link to="/patients">{t("patients.backToList")}</Link>
              </Button>
              {canEditPatient ? (
                <Button type="button" variant="outline" onClick={() => setEditOpen(true)}>
                  {t("patients.editPatient", "Edit patient")}
                </Button>
              ) : null}
              {canViewEncounters ? (
                <Button
                  type="button"
                  disabled={!defaultClinicId || createEncounter.isPending}
                  onClick={() => createEncounter.mutate()}
                >
                  {t("patients.newEncounter")}
                </Button>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

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

      <PatientClinicalDocuments patientId={patient.id} />

      {canViewEncounters ? (
      <div className="grid gap-4">
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-base">{t("patients.encounters")}</CardTitle>
            <Button variant="link" className="h-auto p-0" asChild>
              <Link to="/encounters">{t("patients.viewAllEncounters")}</Link>
            </Button>
          </CardHeader>
          <CardContent className="text-sm">
            {encLoading ? (
              <p className="text-muted-foreground">{t("common.loading")}</p>
            ) : encounters.length === 0 ? (
              <p className="text-muted-foreground">{t("patients.noEncounters")}</p>
            ) : (
              <div className="space-y-3">
                <ul className="space-y-2">
                  {encounters.map((e) => (
                    <li
                      key={e.id}
                      role="link"
                      tabIndex={0}
                      className="flex cursor-pointer flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 transition-colors hover:bg-muted/50"
                      onClick={() => navigate(`/encounters/${e.id}`)}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter" || ev.key === " ") {
                          ev.preventDefault();
                          navigate(`/encounters/${e.id}`);
                        }
                      }}
                    >
                      <div>
                        <Badge variant={e.status === "FINALIZED" ? "default" : "secondary"} className="me-2">
                          {formatEncounterStatus(e.status, t)}
                        </Badge>
                        <span>{e.visitType}</span>
                        <span className="ms-2 text-xs text-muted-foreground ltr-nums">
                          {new Date(e.updatedAt).toLocaleDateString(localeForLanguage(i18n.language))}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
                <TablePagination
                  page={encPage}
                  pageSize={encPageSize}
                  total={encTotal}
                  totalPages={encTotalPages}
                  disabled={encLoading}
                  onPageChange={setEncPage}
                  onPageSizeChange={(s) => {
                    setEncPageSize(s);
                    setEncPage(1);
                  }}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      ) : null}
      {canEditPatient ? (
        <PatientEditDialog patient={patient} open={editOpen} onOpenChange={setEditOpen} />
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
