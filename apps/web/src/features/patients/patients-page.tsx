import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GitMerge, Trash2, Pencil } from "lucide-react";
import { useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { CreateActionButton } from "@/components/create-action-button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PatientEditDialog } from "@/components/patient-edit-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SearchInput } from "@/components/search-input";
import { FilterTh, SortableTh } from "@/components/sortable-th";
import { type SortOrder } from "@/components/sort-utils";
import { toggleSort } from "@/components/sort-utils";
import { ResponsiveTable } from "@/components/responsive-table";
import { TablePagination } from "@/components/table-pagination";
import type { PatientDto } from "@/lib/api-schema";
import { usePatientsQuery } from "@/lib/api-hooks";
import { apiDelete, apiGet } from "@/lib/http";
import { columnFilterIncludes } from "@/lib/utils";
import { formatGender } from "@/lib/locale-display";
import { useAuthStore } from "@/stores/auth-store";
import { canEditPatientDetails, canManagePatientsInList } from "@/lib/patient-edit-policy";
import { mapApiRole } from "@/lib/roles";
import { useSyncOnChange } from "@/lib/use-sync-on-change";
import { PatientRegisterWizard } from "@/features/patients/patient-register-wizard";

export function PatientsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [quickSearch, setQuickSearch] = useState("");
  const debouncedQuick = useDebouncedValue(quickSearch, 300);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState("mrn");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [pfId, setPfId] = useState("");
  const debouncedPfId = useDebouncedValue(pfId, 300);
  const [pfMrn, setPfMrn] = useState("");
  const [pfName, setPfName] = useState("");
  const [pfGender, setPfGender] = useState("");
  const [pfDob, setPfDob] = useState("");
  const [pfEmail, setPfEmail] = useState("");
  const [pfBranch, setPfBranch] = useState("");
  const [patientToDelete, setPatientToDelete] = useState<PatientDto | null>(null);
  const [patientToEdit, setPatientToEdit] = useState<PatientDto | null>(null);

  const query = useMemo(
    () => ({
      search: debouncedQuick,
      id: debouncedPfId.trim() || undefined,
      page,
      pageSize,
      sortBy,
      sortOrder,
    }),
    [debouncedQuick, debouncedPfId, page, pageSize, sortBy, sortOrder],
  );

  const onSort = (column: string) => {
    const next = toggleSort(sortBy, sortOrder, column);
    setSortBy(next.sortBy);
    setSortOrder(next.sortOrder);
    setPage(1);
  };

  const { data, isFetching, isError, error } = usePatientsQuery(query);
  const items: PatientDto[] = useMemo(() => data?.items ?? [], [data?.items]);
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  const filteredPatients = useMemo(() => {
    return items.filter((p) => {
      if (pfMrn.trim() && !columnFilterIncludes(p.mrn, pfMrn)) return false;
      const nameHay = `${p.firstNameEn} ${p.lastNameEn} ${p.firstNameAr ?? ""} ${p.lastNameAr ?? ""}`;
      if (pfName.trim() && !columnFilterIncludes(nameHay, pfName)) return false;
      const gLabel = p.gender === "M" ? "male m" : p.gender === "F" ? "female f" : String(p.gender);
      if (
        pfGender.trim() &&
        !columnFilterIncludes(gLabel, pfGender) &&
        !columnFilterIncludes(String(p.gender), pfGender)
      ) {
        return false;
      }
      if (pfDob.trim() && !columnFilterIncludes(p.dob ?? "", pfDob)) return false;
      if (pfEmail.trim() && !columnFilterIncludes(p.email ?? "", pfEmail)) return false;
      if (pfBranch.trim() && !columnFilterIncludes(p.homeBranch ?? "", pfBranch)) return false;
      return true;
    });
  }, [items, pfMrn, pfName, pfGender, pfDob, pfEmail, pfBranch]);

  useSyncOnChange([debouncedQuick, debouncedPfId], () => {
    setPage(1);
  }, { skipMount: true });

  const authRole = useAuthStore((s) => s.user?.role);
  const navTabKeys = useAuthStore((s) => s.user?.navTabKeys);
  const navTabAccessModes = useAuthStore((s) => s.user?.navTabAccessModes);
  const canManagePatients = canManagePatientsInList(authRole, navTabKeys, navTabAccessModes);
  const canReviewDuplicates =
    canEditPatientDetails(authRole, navTabKeys, navTabAccessModes) &&
    ["group_admin", "clinic_admin", "branch_manager"].includes(mapApiRole(String(authRole ?? "")));
  const dupSummary = useQuery({
    queryKey: ["patients", "duplicates", "summary"],
    queryFn: () =>
      apiGet<{ totalClusters: number; duplicatePatientCount: number; safeAutoMergeClusters: number }>(
        "/api/v1/patients/duplicates/summary",
      ),
    enabled: canReviewDuplicates,
    staleTime: 60_000,
  });
  const [registerOpen, setRegisterOpen] = useState(false);

  const deleteMut = useMutation({
    mutationFn: (patientId: string) => apiDelete(`/api/v1/patients/${patientId}`),
    onSuccess: () => {
      setPatientToDelete(null);
      void qc.invalidateQueries({ queryKey: ["patients"] });
      void qc.invalidateQueries({ queryKey: ["dashboard", "kpis"] });
      void qc.invalidateQueries({ queryKey: ["admin", "org-patients"] });
    },
  });

  const handleEditPatient = (patient: PatientDto, e: MouseEvent | KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setPatientToEdit(patient);
  };

  const handleDeletePatient = (patient: PatientDto, e: MouseEvent | KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setPatientToDelete(patient);
  };

  const deletePatientName = patientToDelete
    ? i18n.language === "ar" && patientToDelete.firstNameAr
      ? `${patientToDelete.firstNameAr} ${patientToDelete.lastNameAr ?? ""}`.trim()
      : `${patientToDelete.firstNameEn} ${patientToDelete.lastNameEn}`.trim()
    : "";

  return (
    <div className="space-y-6">
      <PatientRegisterWizard
        open={registerOpen}
        onOpenChange={setRegisterOpen}
        listPageSize={pageSize}
        onRegistered={() => {
          setPfMrn("");
          setPfName("");
          setPfGender("");
          setPfDob("");
          setPfEmail("");
          setPfBranch("");
          setQuickSearch("");
          setPage(1);
          setSortBy("createdAt");
          setSortOrder("desc");
        }}
      />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("patients.title")}</h1>
          <p className="text-muted-foreground">{t("patients.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canReviewDuplicates ? (
            <Link
              to="/patients/duplicates"
              className="group inline-flex items-center gap-2.5 rounded-xl border border-border/80 bg-gradient-to-br from-background via-background to-primary/5 px-3.5 py-2.5 text-sm font-medium shadow-sm transition hover:border-primary/40 hover:shadow-md"
              data-testid="duplicate-patients-link"
            >
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary transition group-hover:bg-primary/15">
                <GitMerge className="size-4" aria-hidden />
              </span>
              <span className="flex flex-col items-start leading-tight">
                <span>{t("patients.duplicatesLink", "Duplicate patients")}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {dupSummary.isPending
                    ? t("common.loading", "Loading…")
                    : t("patients.duplicatesLinkHint", "{{count}} charts share a phone", {
                        count: dupSummary.data?.duplicatePatientCount ?? 0,
                      })}
                </span>
              </span>
              {(dupSummary.data?.duplicatePatientCount ?? 0) > 0 ? (
                <span className="ms-1 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground tabular-nums">
                  {dupSummary.data?.duplicatePatientCount}
                </span>
              ) : null}
            </Link>
          ) : null}
          <CreateActionButton type="button" onClick={() => setRegisterOpen(true)}>
            {t("patients.newPatient")}
          </CreateActionButton>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">{t("patients.search")}</CardTitle>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            disabled={
              !pfId.trim() &&
              !pfMrn.trim() &&
              !pfName.trim() &&
              !pfGender.trim() &&
              !pfDob.trim() &&
              !pfEmail.trim() &&
              !pfBranch.trim()
            }
            onClick={() => {
              setPfId("");
              setPfMrn("");
              setPfName("");
              setPfGender("");
              setPfDob("");
              setPfEmail("");
              setPfBranch("");
            }}
          >
            {t("patients.clearColFilters", "Clear column filters")}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {isError ? (
            <p className="text-sm text-destructive">{error instanceof Error ? error.message : t("common.error")}</p>
          ) : null}
          <SearchInput
            value={quickSearch}
            onChange={(e) => setQuickSearch(e.target.value)}
            placeholder={t("patients.searchPlaceholder")}
            aria-busy={isFetching}
          />
          <ResponsiveTable>
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/60">
                <tr className="text-start">
                  <FilterTh
                    label={t("patients.patientId", "Patient ID")}
                    value={pfId}
                    onChange={setPfId}
                  />
                  <SortableTh
                    label={t("patients.mrn")}
                    column="mrn"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={onSort}
                    filterValue={pfMrn}
                    onFilterChange={setPfMrn}
                  />
                  <SortableTh
                    label={t("hr.name")}
                    column="lastNameEn"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={onSort}
                    filterValue={pfName}
                    onFilterChange={setPfName}
                  />
                  <SortableTh
                    label={t("patients.gender")}
                    column="gender"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={onSort}
                    align="center"
                    filterValue={pfGender}
                    onFilterChange={setPfGender}
                  />
                  <SortableTh
                    label={t("patients.dob")}
                    column="dob"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={onSort}
                    filterValue={pfDob}
                    onFilterChange={setPfDob}
                  />
                  <FilterTh label={t("patients.email")} value={pfEmail} onChange={setPfEmail} />
                  <FilterTh label={t("patients.branch")} value={pfBranch} onChange={setPfBranch} />
                  {canManagePatients ? (
                    <th className="px-3 py-2 text-end">{t("common.actions", "Actions")}</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {filteredPatients.map((p) => (
                  <tr
                    key={p.id}
                    role="link"
                    tabIndex={0}
                    className="border-t border-border transition-colors hover:bg-muted/50 cursor-pointer"
                    onClick={() => navigate(`/patients/${p.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        navigate(`/patients/${p.id}`);
                      }
                    }}
                  >
                    <td className="px-3 py-2 font-mono text-xs ltr-nums text-muted-foreground" title={p.id}>
                      {p.id.length > 10 ? `${p.id.slice(0, 10)}…` : p.id}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs ltr-nums">{p.mrn}</td>
                    <td className="px-3 py-2">
                      {(() => {
                        const nm = i18n.language === "ar" && p.firstNameAr ? `${p.firstNameAr} ${p.lastNameAr ?? ""}`.trim() : `${p.firstNameEn} ${p.lastNameEn}`.trim();
                        return (
                          <div className="flex items-center gap-2.5">
                            <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">{nm.charAt(0).toUpperCase()}</span>
                            <span className="min-w-0 truncate font-medium">{nm}</span>
                            {p.isSample ? (
                              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground ring-1 ring-inset ring-border">{t("help.sample.badge")}</span>
                            ) : null}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className="text-xs font-medium text-muted-foreground">
                        {formatGender(p.gender, t)}
                      </span>
                    </td>
                    <td className="px-3 py-2 ltr-nums">{p.dob ?? t("common.notAvailable", "—")}</td>
                    <td className="max-w-40 truncate px-3 py-2 text-xs text-muted-foreground">{p.email ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{p.homeBranch}</td>
                    {canManagePatients ? (
                      <td className="px-3 py-2 text-end">
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label={t("patients.editPatient", "Edit patient")}
                            onClick={(e) => handleEditPatient(p, e)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            aria-label={t("patients.deletePatient", "Delete patient")}
                            disabled={deleteMut.isPending}
                            onClick={(e) => handleDeletePatient(p, e)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
                {items.length === 0 && !isFetching ? (
                  <tr>
                    <td colSpan={canManagePatients ? 8 : 7} className="px-3 py-8 text-center text-muted-foreground">
                      {t("patients.empty")}
                    </td>
                  </tr>
                ) : null}
                {items.length > 0 && filteredPatients.length === 0 && !isFetching ? (
                  <tr>
                    <td colSpan={canManagePatients ? 8 : 7} className="px-3 py-8 text-center text-muted-foreground">
                      {t("patients.noColMatch", "No rows match the column filters.")}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </ResponsiveTable>
          <TablePagination
            page={page}
            pageSize={pageSize}
            total={total}
            totalPages={totalPages}
            disabled={isFetching}
            onPageChange={setPage}
            onPageSizeChange={(s) => {
              setPageSize(s);
              setPage(1);
            }}
          />
        </CardContent>
      </Card>

      <ConfirmDialog
        open={patientToDelete != null}
        onOpenChange={(open) => {
          if (!open && !deleteMut.isPending) setPatientToDelete(null);
        }}
        title={t("patients.deleteConfirmTitle", "Delete patient?")}
        description={t(
          "patients.deleteConfirmBody",
          "Delete {{name}} ({{mrn}})? They will be removed from the registry.",
          { name: deletePatientName, mrn: patientToDelete?.mrn ?? "" },
        )}
        confirmLabel={t("patients.deleteConfirmAction", "Delete patient")}
        cancelLabel={t("common.cancel", "Cancel")}
        pending={deleteMut.isPending}
        onConfirm={() => {
          if (patientToDelete) deleteMut.mutate(patientToDelete.id);
        }}
      />

      {patientToEdit ? (
        <PatientEditDialog
          patient={patientToEdit}
          open={Boolean(patientToEdit)}
          onOpenChange={(open) => {
            if (!open) setPatientToEdit(null);
          }}
        />
      ) : null}
    </div>
  );
}

function useDebouncedValue<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  const immediate = typeof value === "string" && value.trim() === "";
  useSyncOnChange([immediate, value], () => {
    if (immediate) setV(value);
  });
  useEffect(() => {
    if (immediate) return;
    const id = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(id);
  }, [immediate, value, ms]);
  return v;
}
