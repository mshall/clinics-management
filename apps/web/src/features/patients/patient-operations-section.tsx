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
import { formatClinicNameFields, localeForLanguage } from "@/lib/locale-display";
import { formatMoneyAmount } from "@/lib/money-display";
import { showOperationMoneyColumns } from "@/lib/operation-money-policy";
import { operationStatusIsDischarged } from "@/lib/operation-status-policy";
import { useAuthStore } from "@/stores/auth-store";
import { filterFieldClassName, filterToolbarCompactClassName, nativeSelectClassName } from "@/lib/form-control-styles";
import { Label } from "@/components/ui/label";
import { OperationPostSurgeryDocumentsSection } from "@/features/operations/operation-post-surgery-documents";
import { OperationPreSurgeryProfileDocs } from "@/features/patients/operation-pre-surgery-profile-docs";
import { OperationDocumentFileActions } from "@/components/operation-document-file-actions";
import {
  operationDocumentKindLabel,
  reservedOperationDocumentCategories,
} from "@/lib/operation-document-categories";
import { operationStatusIsEditable } from "@/lib/operation-status-policy";

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
  canUploadDocs?: boolean;
};

export function PatientOperationsSection({ patientId, canUploadDocs = false }: Props) {
  const { t, i18n } = useTranslation();
  const locale = localeForLanguage(i18n.language);
  const authUser = useAuthStore((s) => s.user);
  const showMoneyColumns = showOperationMoneyColumns(authUser?.role, authUser?.moneyVisibilityOverrides);
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

  return (
    <>
      <Card>
        <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Scissors className="h-4 w-4" />
            {t("operations.title", "Operations")}
          </CardTitle>
          <div className={filterToolbarCompactClassName}>
            <div className={filterFieldClassName}>
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
                      {showMoneyColumns ? (
                        <>
                          <th className="px-3 py-2 text-start font-medium ltr-nums">{t("operations.totalCost", "Total")}</th>
                          <th className="px-3 py-2 text-start font-medium ltr-nums">{t("operations.balanceDue", "Balance")}</th>
                        </>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((op) => (
                      <OperationRow
                        key={op.id}
                        op={op}
                        locale={locale}
                        showMoneyColumns={showMoneyColumns}
                        onSelect={() => setSelectedId(op.id)}
                      />
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
            <OperationDetailView
              detail={detail}
              locale={locale}
              canUploadDocs={canUploadDocs}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function OperationRow({
  op,
  locale,
  showMoneyColumns,
  onSelect,
}: {
  op: OperationDto;
  locale: string;
  showMoneyColumns: boolean;
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
      {showMoneyColumns ? (
        <>
          <td className="px-3 py-2 ltr-nums">{op.financialsVisible ? money(op.totalCost) : "—"}</td>
          <td className="px-3 py-2 ltr-nums">{op.financialsVisible ? money(op.balanceDue) : "—"}</td>
        </>
      ) : null}
    </tr>
  );
}

function OperationDocumentsBlock({
  title,
  documents,
  operationId,
  emptyLabel,
}: {
  title: string;
  documents: OperationDocumentDto[];
  operationId: string;
  emptyLabel: string;
}) {
  const { t, i18n } = useTranslation();
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-muted-foreground">
        {title} ({documents.length})
      </p>
      {documents.length === 0 ? (
        <p className="text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul className="space-y-2">
          {documents.map((doc) => (
            <li key={doc.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
              <div>
                <p className="font-medium">
                  <span className="text-foreground">{operationDocumentKindLabel(doc.kind, t)}</span>
                  {doc.description?.trim()
                    ? ` — ${doc.description.trim()}`
                    : ` — ${doc.originalFileName}`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(doc.createdAt).toLocaleDateString(localeForLanguage(i18n.language))}
                </p>
              </div>
              <OperationDocumentFileActions operationId={operationId} doc={doc} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OperationDetailView({
  detail,
  locale,
  canUploadDocs,
}: {
  detail: NonNullable<ReturnType<typeof useOperationQuery>["data"]>;
  locale: string;
  canUploadDocs: boolean;
}) {
  const { t, i18n } = useTranslation();
  const money = (n: number) => formatMoneyAmount(n, detail.feeCurrency, locale);
  const reservedCategories = reservedOperationDocumentCategories(detail.documents, t);

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
        {detail.financialsVisible ? (
          <>
            <DetailRow label={t("operations.totalCost", "Total")}>{money(detail.totalCost)}</DetailRow>
            <DetailRow label={t("operations.downPayment", "Down payment")}>{money(detail.downPayment)}</DetailRow>
            <DetailRow label={t("operations.paidAmount", "Paid")}>{money(detail.paidAmount)}</DetailRow>
            <DetailRow label={t("operations.balanceDue", "Balance")}>{money(detail.balanceDue)}</DetailRow>
          </>
        ) : null}
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

      {operationStatusIsEditable(detail.status) && canUploadDocs ? (
        <OperationPreSurgeryProfileDocs
          operationId={detail.id}
          canUpload
          reservedCategories={reservedCategories}
        />
      ) : null}

      <OperationDocumentsBlock
        title={t("operations.preSurgeryDocuments", "Pre-surgery documents")}
        documents={detail.documents.filter((d) => d.kind !== "POST_SURGERY")}
        operationId={detail.id}
        emptyLabel={t("patients.noDocuments", "No documents")}
      />
      {operationStatusIsDischarged(detail.status) ? (
        <>
          <OperationDocumentsBlock
            title={t("operations.postSurgeryTitle", "Post-surgery documents")}
            documents={detail.documents.filter((d) => d.kind === "POST_SURGERY")}
            operationId={detail.id}
            emptyLabel={t("operations.postSurgeryEmpty", "No post-surgery documents yet.")}
          />
          <OperationPostSurgeryDocumentsSection
            operationId={detail.id}
            documents={detail.documents}
            canUpload={canUploadDocs}
          />
        </>
      ) : null}

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