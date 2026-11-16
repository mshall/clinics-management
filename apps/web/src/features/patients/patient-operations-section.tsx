import { Scissors } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { OperationStatusBadge } from "@/components/operation-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ResponsiveTable } from "@/components/responsive-table";
import { TablePagination } from "@/components/table-pagination";
import { useOperationQuery, useOperationsQuery } from "@/lib/api-hooks";
import type { OperationDocumentDto, OperationDto } from "@/lib/api-types";
import { apiFetchBlob } from "@/lib/http";
import { formatClinicNameFields, localeForLanguage } from "@/lib/locale-display";
import { formatMoneyAmount } from "@/lib/money-display";
import { nativeSelectClassName } from "@/lib/form-control-styles";
import { Label } from "@/components/ui/label";

const PATIENT_OPS_PAGE_SIZE = 5;

function patientOperationsDateRange(): { from: string; to: string } {
  const end = new Date();
  end.setFullYear(end.getFullYear() + 2, 11, 31);
  const y = end.getFullYear();
  const m = String(end.getMonth() + 1).padStart(2, "0");
  const d = String(end.getDate()).padStart(2, "0");
  return { from: "1970-01-01", to: `${y}-${m}-${d}` };
}

type Props = {
  patientId: string;
};

export function PatientOperationsSection({ patientId }: Props) {
  const { t, i18n } = useTranslation();
  const locale = localeForLanguage(i18n.language);
  const range = useMemo(() => patientOperationsDateRange(), []);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PATIENT_OPS_PAGE_SIZE);
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isPending } = useOperationsQuery({
    from: range.from,
    to: range.to,
    patientId,
    status: statusFilter || undefined,
    page,
    pageSize,
    sortBy: "operationDate",
    sortOrder: "desc",
    enabled: Boolean(patientId),
  });

  const { data: detail, isPending: detailPending } = useOperationQuery(selectedId ?? undefined);

  const rows = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  const openDoc = async (operationId: string, doc: OperationDocumentDto) => {
    const { blob } = await apiFetchBlob(`/api/v1/operations/${operationId}/documents/${doc.id}/file`);
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
        <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Scissors className="h-4 w-4" />
            {t("operations.title", "Operations")}
          </CardTitle>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">{t("operations.status", "Status")}</Label>
              <select
                className={nativeSelectClassName}
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">{t("common.all", "All")}</option>
                <option value="SCHEDULED">{t("operations.statusBooked", "Booked")}</option>
                <option value="COMPLETED">{t("operations.statusDischarged", "Discharged")}</option>
                <option value="CANCELLED">{t("operations.statusCancelled", "Cancelled")}</option>
              </select>
            </div>
            <Button variant="link" className="h-auto p-0" asChild>
              <Link to="/operations">{t("patients.viewAllOperations", "View all operations")}</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="text-sm">
          {isPending ? (
            <p className="text-muted-foreground">{t("common.loading")}</p>
          ) : rows.length === 0 ? (
            <p className="text-muted-foreground">{t("patients.noOperations", "No operations for this patient.")}</p>
          ) : (
            <div className="space-y-3">
              <ResponsiveTable>
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-muted/60">
                    <tr>
                      <th className="px-3 py-2 text-start font-medium">{t("operations.operationDate", "Date")}</th>
                      <th className="px-3 py-2 text-start font-medium">{t("operations.status", "Status")}</th>
                      <th className="px-3 py-2 text-start font-medium">{t("operations.clinician", "Clinician")}</th>
                      <th className="px-3 py-2 text-start font-medium ltr-nums">{t("operations.totalCost", "Total")}</th>
                      <th className="px-3 py-2 text-start font-medium ltr-nums">{t("operations.balanceDue", "Balance")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((op) => (
                      <OperationRow key={op.id} op={op} locale={locale} onSelect={() => setSelectedId(op.id)} />
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
            <DialogTitle>{t("operations.operationDetails", "Operation details")}</DialogTitle>
          </DialogHeader>
          {detailPending || !detail ? (
            <p className="text-muted-foreground">{t("common.loading")}</p>
          ) : (
            <OperationDetailView detail={detail} locale={locale} onOpenDoc={openDoc} />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function OperationRow({
  op,
  locale,
  onSelect,
}: {
  op: OperationDto;
  locale: string;
  onSelect: () => void;
}) {
  const { i18n } = useTranslation();
  const money = (n: number) => formatMoneyAmount(n, op.feeCurrency, locale);

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
      <td className="px-3 py-2 ltr-nums whitespace-nowrap">
        {new Date(op.operationDate).toLocaleDateString(localeForLanguage(i18n.language))}
      </td>
      <td className="px-3 py-2">
        <OperationStatusBadge status={op.status} />
      </td>
      <td className="px-3 py-2">{op.clinicianName ?? "—"}</td>
      <td className="px-3 py-2 ltr-nums">{money(op.totalCost)}</td>
      <td className="px-3 py-2 ltr-nums">{money(op.balanceDue)}</td>
    </tr>
  );
}

function OperationDetailView({
  detail,
  locale,
  onOpenDoc,
}: {
  detail: NonNullable<ReturnType<typeof useOperationQuery>["data"]>;
  locale: string;
  onOpenDoc: (operationId: string, doc: OperationDocumentDto) => void;
}) {
  const { t, i18n } = useTranslation();
  const money = (n: number) => formatMoneyAmount(n, detail.feeCurrency, locale);

  return (
    <div className="space-y-4 text-sm">
      <dl className="grid gap-2 sm:grid-cols-2">
        <DetailRow label={t("operations.operationDate", "Date")}>
          {new Date(detail.operationDate).toLocaleString(localeForLanguage(i18n.language))}
        </DetailRow>
        <DetailRow label={t("operations.status", "Status")}>
          <OperationStatusBadge status={detail.status} />
        </DetailRow>
        <DetailRow label={t("revenue.clinic", "Clinic")}>
          {formatClinicNameFields(detail.clinicNameEn, detail.clinicNameAr, i18n.language, detail.clinicId)}
        </DetailRow>
        <DetailRow label={t("operations.clinician", "Clinician")}>{detail.clinicianName ?? "—"}</DetailRow>
        <DetailRow label={t("operations.totalCost", "Total")}>{money(detail.totalCost)}</DetailRow>
        <DetailRow label={t("operations.downPayment", "Down payment")}>{money(detail.downPayment)}</DetailRow>
        <DetailRow label={t("operations.paidAmount", "Paid")}>{money(detail.paidAmount)}</DetailRow>
        <DetailRow label={t("operations.balanceDue", "Balance")}>{money(detail.balanceDue)}</DetailRow>
      </dl>

      {detail.comments?.trim() ? (
        <div>
          <p className="text-xs font-medium text-muted-foreground">{t("operations.comments", "Comments")}</p>
          <p className="mt-1 whitespace-pre-wrap">{detail.comments}</p>
        </div>
      ) : null}

      {detail.medications.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">{t("encounters.medications")}</p>
          <ul className="list-inside list-disc space-y-1 text-muted-foreground">
            {detail.medications.map((m) => (
              <li key={m.id}>
                {m.drugName}
                {m.dosage ? ` · ${m.dosage}` : ""}
                {m.frequency ? ` · ${m.frequency}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : detail.noMedications ? (
        <p className="text-muted-foreground">{t("encounters.noMedicationsRecorded", "No medications recorded")}</p>
      ) : null}

      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          {t("operations.existingDocuments", "Saved documents")} ({detail.documents.length})
        </p>
        {detail.documents.length === 0 ? (
          <p className="text-muted-foreground">{t("patients.noDocuments", "No documents")}</p>
        ) : (
          <ul className="space-y-2">
            {detail.documents.map((doc) => (
              <li key={doc.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
                <div>
                  <p className="font-medium">{doc.description?.trim() || doc.originalFileName}</p>
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
        <Link to="/operations">{t("patients.openInOperations", "Open in operations workspace")}</Link>
      </Button>
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