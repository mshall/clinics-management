import type { ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { TablePagination } from "@/components/table-pagination";
import { useClinicsQuery, useEncountersQuery, usePatientQuery } from "@/lib/api-hooks";
import type { EncounterDetailDto } from "@/lib/api-types";
import { apiPost } from "@/lib/http";

export function PatientDetailPage() {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: patient, isPending, isError, error } = usePatientQuery(id);
  const [encPage, setEncPage] = useState(1);
  const [encPageSize, setEncPageSize] = useState(10);
  const { data: encData, isPending: encLoading } = useEncountersQuery({
    patientId: id,
    page: encPage,
    pageSize: encPageSize,
    enabled: Boolean(id),
  });
  const encounters = encData?.items ?? [];
  const encTotal = encData?.total ?? 0;
  const encTotalPages = encData?.totalPages ?? 1;
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
      navigate(`/encounters/${enc.id}`);
    },
    onError: (e: unknown) => {
      console.error(e);
    },
  });

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{name}</h1>
            <Badge variant="secondary" className="font-mono text-xs ltr-nums">
              {patient.mrn}
            </Badge>
          </div>
          <p className="text-muted-foreground">{patient.homeBranch ?? "—"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to="/patients">{i18n.language === "ar" ? "القائمة" : "Back to list"}</Link>
          </Button>
          <Button
            type="button"
            disabled={!defaultClinicId || createEncounter.isPending}
            onClick={() => createEncounter.mutate()}
          >
            {t("patients.newEncounter")}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{i18n.language === "ar" ? "البيانات الديموغرافية" : "Demographics"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label={t("patients.dob")} value={<span className="ltr-nums">{patient.dob}</span>} />
            <Separator />
            <Row label={t("patients.gender")} value={<span className="uppercase">{patient.gender}</span>} />
            <Separator />
            <Row label={t("patients.phone")} value={<span className="ltr-nums">{patient.phone}</span>} />
            <Separator />
            <Row
              label={t("patients.nationalId")}
              value={<span className="break-all font-mono text-xs ltr-nums">{patient.nationalId ?? "—"}</span>}
            />
            <Separator />
            <Row label={t("patients.email")} value={<span className="break-all">{patient.email ?? "—"}</span>} />
          </CardContent>
        </Card>
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
                          {e.status}
                        </Badge>
                        <span>{e.visitType}</span>
                        <span className="ms-2 text-xs text-muted-foreground ltr-nums">
                          {new Date(e.updatedAt).toLocaleDateString(i18n.language === "ar" ? "ar-AE" : "en-AE")}
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
