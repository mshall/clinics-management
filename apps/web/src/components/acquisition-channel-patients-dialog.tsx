import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { FilterTh, SortableTh, toggleSort, type SortOrder } from "@/components/sortable-th";
import { ResponsiveTable } from "@/components/responsive-table";
import { TablePagination } from "@/components/table-pagination";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useReportsPatientAcquisitionPatientsQuery } from "@/lib/api-hooks";
import type { ReportsPatientAcquisitionPatientDto } from "@/lib/api-types";
import { localeForLanguage } from "@/lib/locale-display";
import {
  patientAcquisitionDisplay,
  type PatientAcquisitionChannel,
} from "@/lib/patient-acquisition";

type AcquisitionChannelPatientsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channel: string;
  channelLabel: string;
  from: string;
  to: string;
};

function acquisitionDetail(patient: ReportsPatientAcquisitionPatientDto): string {
  if (patient.acquisitionChannel === "DOCTOR_REFERRAL" && patient.acquisitionReferralName?.trim()) {
    return patient.acquisitionReferralName.trim();
  }
  if (patient.acquisitionChannel === "OTHER" && patient.acquisitionOtherDetail?.trim()) {
    return patient.acquisitionOtherDetail.trim();
  }
  return "—";
}

export function AcquisitionChannelPatientsDialog({
  open,
  onOpenChange,
  channel,
  channelLabel,
  from,
  to,
}: AcquisitionChannelPatientsDialogProps) {
  const { t, i18n } = useTranslation();
  const locale = localeForLanguage(i18n.language);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [fMrn, setFMrn] = useState("");
  const [fName, setFName] = useState("");
  const [fPhone, setFPhone] = useState("");
  const [fBranch, setFBranch] = useState("");
  const [fDetail, setFDetail] = useState("");
  const debouncedMrn = useDebouncedValue(fMrn, 300);
  const debouncedName = useDebouncedValue(fName, 300);
  const debouncedPhone = useDebouncedValue(fPhone, 300);
  const debouncedBranch = useDebouncedValue(fBranch, 300);
  const debouncedDetail = useDebouncedValue(fDetail, 300);

  useEffect(() => {
    if (!open) return;
    setPage(1);
    setPageSize(10);
    setSortBy("createdAt");
    setSortOrder("desc");
    setFMrn("");
    setFName("");
    setFPhone("");
    setFBranch("");
    setFDetail("");
  }, [open, channel]);

  useEffect(() => {
    setPage(1);
  }, [debouncedMrn, debouncedName, debouncedPhone, debouncedBranch, debouncedDetail]);

  const query = useReportsPatientAcquisitionPatientsQuery(
    open ? channel : null,
    from,
    to,
    {
      page,
      pageSize,
      sortBy,
      sortOrder,
      mrn: debouncedMrn,
      name: debouncedName,
      phone: debouncedPhone,
      branch: debouncedBranch,
      detail: debouncedDetail,
    },
  );

  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = query.data?.totalPages ?? 1;

  const onSort = (column: string) => {
    const next = toggleSort(sortBy, sortOrder, column);
    setSortBy(next.sortBy);
    setSortOrder(next.sortOrder);
    setPage(1);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-5xl flex-col gap-0 overflow-hidden p-0" aria-describedby={undefined}>
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle>{t("reports.acquisitionPatientsTitle", "Patients — {{channel}}", { channel: channelLabel })}</DialogTitle>
          <p className="text-sm text-muted-foreground ltr-nums">
            {t("reports.acquisitionPatientsHint", "{{from}} → {{to}} · Click a row to open the patient profile.", {
              from,
              to,
            })}
          </p>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-6 py-4">
          {query.isError ? (
            <p className="text-sm text-destructive">
              {query.error instanceof Error ? query.error.message : t("common.error")}
            </p>
          ) : null}
          <ResponsiveTable className="min-h-0 flex-1">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/60">
                <tr className="text-start">
                  <SortableTh
                    label={t("patients.mrn")}
                    column="mrn"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={onSort}
                    filterValue={fMrn}
                    onFilterChange={setFMrn}
                  />
                  <SortableTh
                    label={t("hr.name")}
                    column="lastNameEn"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={onSort}
                    filterValue={fName}
                    onFilterChange={setFName}
                  />
                  <SortableTh
                    label={t("patients.phone")}
                    column="phone"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={onSort}
                    filterValue={fPhone}
                    onFilterChange={setFPhone}
                  />
                  <FilterTh label={t("patients.branch")} value={fBranch} onChange={setFBranch} />
                  <SortableTh
                    label={t("reports.registeredAt", "Registered")}
                    column="createdAt"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={onSort}
                  />
                  <th className="px-3 py-2 font-medium">{t("reports.acquisitionChannel", "Channel")}</th>
                  <FilterTh
                    label={t("reports.acquisitionDetail", "Details")}
                    value={fDetail}
                    onChange={setFDetail}
                  />
                </tr>
              </thead>
              <tbody>
                {query.isPending ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                      {t("common.loading")}
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                      {t("reports.acquisitionPatientsEmpty", "No patients match these filters.")}
                    </td>
                  </tr>
                ) : (
                  items.map((p) => {
                    const name =
                      i18n.language === "ar" && p.firstNameAr
                        ? `${p.firstNameAr} ${p.lastNameAr ?? ""}`.trim()
                        : `${p.firstNameEn} ${p.lastNameEn}`.trim();
                    return (
                      <tr key={p.id} className="border-t border-border transition-colors hover:bg-muted/50">
                        <td className="px-3 py-2 font-mono text-xs ltr-nums">
                          <Link to={`/patients/${p.id}`} className="text-primary underline-offset-2 hover:underline">
                            {p.mrn}
                          </Link>
                        </td>
                        <td className="px-3 py-2">
                          <Link to={`/patients/${p.id}`} className="hover:underline">
                            {name}
                          </Link>
                        </td>
                        <td className="px-3 py-2 ltr-nums">{p.phone}</td>
                        <td className="px-3 py-2 text-muted-foreground">{p.homeBranch ?? "—"}</td>
                        <td className="px-3 py-2 ltr-nums text-xs text-muted-foreground">
                          {new Date(p.createdAt).toLocaleDateString(locale)}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {patientAcquisitionDisplay(
                            p.acquisitionChannel as PatientAcquisitionChannel | null,
                            p.acquisitionReferralName,
                            p.acquisitionOtherDetail,
                            t,
                          )}
                        </td>
                        <td className="max-w-[12rem] truncate px-3 py-2 text-xs text-muted-foreground" title={acquisitionDetail(p)}>
                          {acquisitionDetail(p)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </ResponsiveTable>
          <TablePagination
            page={page}
            pageSize={pageSize}
            total={total}
            totalPages={totalPages}
            disabled={query.isFetching}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function useDebouncedValue<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return v;
}
