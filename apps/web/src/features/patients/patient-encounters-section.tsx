import { HeartPulse } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ResponsiveTable } from "@/components/responsive-table";
import { TablePagination } from "@/components/table-pagination";
import { useEncounterQuery, useEncountersQuery } from "@/lib/api-hooks";
import type { EncounterDetailDto, EncounterDocumentDto } from "@/lib/api-types";
import { apiFetchBlob } from "@/lib/http";
import { formatClinicNameFields, formatEncounterStatus, localeForLanguage } from "@/lib/locale-display";
import { formatMoneyAmount } from "@/lib/money-display";
import { EncounterProfileDocuments } from "@/features/patients/encounter-profile-documents";

const DEFAULT_PAGE_SIZE = 10;

type Props = {
  patientId: string;
  canUploadDocs?: boolean;
};

export function PatientEncountersSection({ patientId, canUploadDocs = false }: Props) {
  const { t, i18n } = useTranslation();
  const locale = localeForLanguage(i18n.language);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isPending } = useEncountersQuery({
    patientId,
    page,
    pageSize,
    sortBy: "updatedAt",
    sortOrder: "desc",
    enabled: Boolean(patientId),
  });

  const { data: detail, isPending: detailPending } = useEncounterQuery(selectedId ?? undefined);

  const rows = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  const openDoc = async (encounterId: string, doc: EncounterDocumentDto) => {
    const { blob } = await apiFetchBlob(`/api/v1/encounters/${encounterId}/documents/${doc.id}/file`);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = doc.originalFileName || "document";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <HeartPulse className="h-4 w-4" />
            {t("patients.encounters")}
          </CardTitle>
          <Button variant="link" className="h-auto p-0" asChild>
            <Link to="/encounters">{t("patients.viewAllEncounters")}</Link>
          </Button>
        </CardHeader>
        <CardContent className="text-sm">
          {isPending ? (
            <p className="text-muted-foreground">{t("common.loading")}</p>
          ) : rows.length === 0 ? (
            <p className="text-muted-foreground">{t("patients.noEncounters")}</p>
          ) : (
            <div className="space-y-3">
              <ResponsiveTable>
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="bg-muted/60">
                    <tr>
                      <th className="px-3 py-2 text-start font-medium">{t("encounters.status", "Status")}</th>
                      <th className="px-3 py-2 text-start font-medium">{t("encounters.visitType", "Visit type")}</th>
                      <th className="px-3 py-2 text-start font-medium">{t("revenue.clinic", "Clinic")}</th>
                      <th className="px-3 py-2 text-start font-medium">{t("encounters.updated", "Updated")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((e) => (
                      <EncounterRow key={e.id} enc={e} onSelect={() => setSelectedId(e.id)} />
                    ))}
                  </tbody>
                </table>
              </ResponsiveTable>
              <TablePagination
                page={page}
                pageSize={pageSize}
                total={total}
                totalPages={totalPages}
                disabled={isPending}
                onPageChange={setPage}
                onPageSizeChange={(s) => {
                  setPageSize(s);
                  setPage(1);
                }}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={selectedId != null} onOpenChange={(open) => !open && setSelectedId(null)}>
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{t("patients.encounterDetails", "Encounter details")}</DialogTitle>
          </DialogHeader>
          {detailPending || !detail ? (
            <p className="text-muted-foreground">{t("common.loading")}</p>
          ) : (
            <EncounterDetailView
              detail={detail}
              locale={locale}
              onOpenDoc={openDoc}
              canUploadDocs={canUploadDocs}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function EncounterRow({ enc, onSelect }: { enc: EncounterDetailDto; onSelect: () => void }) {
  const { t, i18n } = useTranslation();

  return (
    <tr
      className="cursor-pointer border-t border-border transition-colors hover:bg-muted/50"
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      tabIndex={0}
      role="button"
    >
      <td className="px-3 py-2">
        <Badge variant={enc.status === "FINALIZED" ? "default" : "secondary"}>
          {formatEncounterStatus(enc.status, t)}
        </Badge>
      </td>
      <td className="px-3 py-2">{enc.visitType}</td>
      <td className="px-3 py-2">
        {formatClinicNameFields(enc.clinicNameEn, enc.clinicNameAr, i18n.language, enc.clinicId)}
      </td>
      <td className="px-3 py-2 ltr-nums whitespace-nowrap">
        {new Date(enc.updatedAt).toLocaleDateString(localeForLanguage(i18n.language))}
      </td>
    </tr>
  );
}

function EncounterDetailView({
  detail,
  locale,
  onOpenDoc,
  canUploadDocs,
}: {
  detail: EncounterDetailDto;
  locale: string;
  onOpenDoc: (encounterId: string, doc: EncounterDocumentDto) => void;
  canUploadDocs: boolean;
}) {
  const { t, i18n } = useTranslation();
  const money = (n: number, currency: string) => formatMoneyAmount(n, currency, locale);

  const vitalsParts: string[] = [];
  if (detail.heartRate != null) vitalsParts.push(`${t("encounters.vitalsHr", "HR")} ${detail.heartRate}`);
  if (detail.spo2 != null) vitalsParts.push(`${t("encounters.vitalsSpo2", "SpO₂")} ${detail.spo2}%`);
  if (detail.bpSystolic != null && detail.bpDiastolic != null) {
    vitalsParts.push(`${t("encounters.vitalsBp", "BP")} ${detail.bpSystolic}/${detail.bpDiastolic}`);
  }
  if (detail.temperature != null) vitalsParts.push(`${t("encounters.vitalsTemp", "Temp")} ${detail.temperature}°C`);
  if (detail.weightKg != null) vitalsParts.push(`${t("encounters.vitalsWeight", "Weight")} ${detail.weightKg} kg`);
  if (detail.heightCm != null) vitalsParts.push(`${t("encounters.vitalsHeight", "Height")} ${detail.heightCm} cm`);

  const docs = detail.documents ?? [];

  return (
    <div className="space-y-4 text-sm">
      <dl className="grid gap-2 sm:grid-cols-2">
        <DetailRow label={t("encounters.status", "Status")}>
          <Badge variant={detail.status === "FINALIZED" ? "default" : "secondary"}>
            {formatEncounterStatus(detail.status, t)}
          </Badge>
        </DetailRow>
        <DetailRow label={t("encounters.visitType", "Visit type")}>{detail.visitType}</DetailRow>
        <DetailRow label={t("revenue.clinic", "Clinic")}>
          {formatClinicNameFields(detail.clinicNameEn, detail.clinicNameAr, i18n.language, detail.clinicId)}
        </DetailRow>
        <DetailRow label={t("encounters.updated", "Updated")}>
          {new Date(detail.updatedAt).toLocaleString(localeForLanguage(i18n.language))}
        </DetailRow>
        {detail.financialsVisible !== false ? (
          <DetailRow label={t("encounters.visitFee", "Visit fee")}>
            {money(detail.visitFeeAmount, detail.visitFeeCurrency)}
          </DetailRow>
        ) : null}
        {detail.financialsVisible !== false &&
        detail.visitBalanceDueAmount != null &&
        detail.visitBalanceDueCurrency ? (
          <DetailRow label={t("encounters.balanceDue", "Balance due")}>
            {money(detail.visitBalanceDueAmount, detail.visitBalanceDueCurrency)}
          </DetailRow>
        ) : null}
      </dl>

      {detail.chiefComplaint?.trim() ? (
        <div>
          <p className="text-xs font-medium text-muted-foreground">{t("encounters.chiefComplaint", "Chief complaint")}</p>
          <p className="mt-1 whitespace-pre-wrap">{detail.chiefComplaint}</p>
        </div>
      ) : null}

      {vitalsParts.length > 0 ? (
        <div>
          <p className="text-xs font-medium text-muted-foreground">{t("encounters.vitals", "Vitals")}</p>
          <p className="mt-1">{vitalsParts.join(" · ")}</p>
        </div>
      ) : null}

      <SoapBlock label={t("encounters.subjective", "Subjective")} value={detail.subjective} />
      <SoapBlock label={t("encounters.objective", "Objective")} value={detail.objective} />
      <SoapBlock label={t("encounters.assessment", "Assessment")} value={detail.assessment} />
      <SoapBlock label={t("encounters.plan", "Plan")} value={detail.plan} />

      {detail.diagnoses.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">{t("encounters.diagnoses", "Diagnoses")}</p>
          <ul className="list-inside list-disc space-y-1">
            {detail.diagnoses.map((d) => (
              <li key={d.id}>
                <span className="font-mono text-xs">{d.icd10Code}</span>{" "}
                {i18n.language.startsWith("ar") && d.descriptionAr?.trim() ? d.descriptionAr : d.descriptionEn}
                {d.isPrimary ? ` (${t("encounters.primaryDiagnosis", "primary")})` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {detail.medications.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">{t("encounters.medications", "Medications")}</p>
          <ul className="space-y-2">
            {detail.medications.map((m) => (
              <li key={m.id} className="rounded-md border border-border px-3 py-2">
                <p className="font-medium">{m.drugName}</p>
                <p className="text-xs text-muted-foreground">
                  {[m.dosage, m.route, m.frequency, m.duration].filter(Boolean).join(" · ") || "—"}
                </p>
                {m.instructions?.trim() ? <p className="mt-1 text-xs">{m.instructions}</p> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : detail.noMedications ? (
        <p className="text-muted-foreground">{t("encounters.noMedicationsRecorded", "No medications recorded")}</p>
      ) : null}

      <EncounterProfileDocuments
        encounterId={detail.id}
        status={detail.status}
        canUpload={canUploadDocs}
      />

      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          {t("encounters.documents", "Documents")} ({docs.length})
        </p>
        {docs.length === 0 ? (
          <p className="text-muted-foreground">{t("patients.noDocuments", "No documents")}</p>
        ) : (
          <ul className="space-y-2">
            {docs.map((doc) => (
              <li key={doc.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
                <div>
                  <p className="font-medium">{doc.originalFileName}</p>
                  <p className="text-xs text-muted-foreground">
                    {doc.kind} · {new Date(doc.createdAt).toLocaleDateString(localeForLanguage(i18n.language))}
                  </p>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={() => onOpenDoc(detail.id, doc)}>
                  {t("common.view", "View")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Button asChild variant="secondary" className="w-full sm:w-auto">
        <Link to={`/encounters/${detail.id}`}>{t("patients.openInEncounters", "Open in encounters workspace")}</Link>
      </Button>
    </div>
  );
}

function SoapBlock({ label, value }: { label: string; value: string | null }) {
  if (!value?.trim()) return null;
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 whitespace-pre-wrap">{value}</p>
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}