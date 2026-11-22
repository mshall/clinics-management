import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { CreateActionButton } from "@/components/create-action-button";
import { FilterTh, SortableTh, toggleSort, type SortOrder } from "@/components/sortable-th";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SearchInput } from "@/components/search-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResponsiveTable } from "@/components/responsive-table";
import { TablePagination } from "@/components/table-pagination";
import {
  encounterLedgerFromTo,
  useEncountersQuery,
  usePatientsQuery,
} from "@/lib/api-hooks";
import type { EncounterDetailDto } from "@/lib/api-types";
import { ApiError, apiDelete } from "@/lib/http";
import { canDeleteEncounter } from "@/lib/encounter-delete-policy";
import { EncounterDeleteConfirmDialog, type EncounterDeleteTarget } from "@/features/encounters/encounter-delete-confirm-dialog";
import { EncounterCreateWizard } from "@/features/encounters/encounter-create-wizard";
import { formatEncounterStatus, formatClinicNameFields, localeForLanguage } from "@/lib/locale-display";
import { resolvePatientListLabel } from "@/lib/patient-display";
import { searchLedgerActionsClassName, searchLedgerLayoutClassName } from "@/lib/form-control-styles";
import { columnFilterIncludes } from "@/lib/utils";
import { useClinicCurrencyResolver } from "@/lib/use-clinic-currency-resolver";
import { formatVisitType } from "@/lib/visit-types";
import { defaultEncounterListRange, defaultMonthRange } from "@/stores/date-range-store";
import { canMutateEncountersNav } from "@/lib/nav-tab-access-policy";
import { useAuthStore } from "@/stores/auth-store";

export function EncountersListPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const resolveClinicCurrency = useClinicCurrencyResolver();
  const authUser = useAuthStore((s) => s.user);
  const canCreateEncounter = canMutateEncountersNav(
    authUser?.role,
    authUser?.navTabKeys,
    authUser?.navTabAccessModes,
  );
  const isPhysician = authUser?.role === "physician";
  const canDelete = canDeleteEncounter(authUser?.role);
  const initialRange = useMemo(() => defaultEncounterListRange(), []);
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [ledgerPatientQuery, setLedgerPatientQuery] = useState("");
  const [debouncedLedgerPatient, setDebouncedLedgerPatient] = useState("");
  useEffect(() => {
    const tid = window.setTimeout(() => setDebouncedLedgerPatient(ledgerPatientQuery), 350);
    return () => window.clearTimeout(tid);
  }, [ledgerPatientQuery]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const ledgerRange = useMemo(() => encounterLedgerFromTo(from, to), [from, to]);
  const { data: encData, isPending, isError, error, refetch, isFetching } = useEncountersQuery({
    page,
    pageSize,
    sortBy,
    sortOrder,
    from: ledgerRange.from,
    to: ledgerRange.to,
    patientSearch: debouncedLedgerPatient.trim() || undefined,
  });

  const onSort = (column: string) => {
    const next = toggleSort(sortBy, sortOrder, column);
    setSortBy(next.sortBy);
    setSortOrder(next.sortOrder);
    setPage(1);
  };

  const { data: patData } = usePatientsQuery({ page: 1, pageSize: 200 });
  const [createOpen, setCreateOpen] = useState(false);
  const data = encData?.items ?? [];
  const total = encData?.total ?? 0;
  const totalPages = encData?.totalPages ?? 1;
  const [efEncStatus, setEfEncStatus] = useState("");
  const [efVisit, setEfVisit] = useState("");
  const [efClinic, setEfClinic] = useState("");
  const [efPatient, setEfPatient] = useState("");
  const [efUpdated, setEfUpdated] = useState("");
  const [draftOnly, setDraftOnly] = useState(false);
  const [encounterToDelete, setEncounterToDelete] = useState<EncounterDeleteTarget | null>(null);

  const patientLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of patData?.items ?? []) {
      m.set(p.id, `${p.firstNameEn} ${p.lastNameEn}`);
    }
    return m;
  }, [patData?.items]);
  const patientRegistryTotal = patData?.total ?? 0;

  const filteredEncounters = useMemo(() => {
    const loc = localeForLanguage(i18n.language);
    const name = (e: EncounterDetailDto) => formatClinicNameFields(e.clinicNameEn, e.clinicNameAr, i18n.language);
    return data.filter((e) => {
      if (draftOnly && e.status !== "DRAFT" && e.status !== "AMENDED") return false;
      if (efEncStatus.trim() && !columnFilterIncludes(formatEncounterStatus(e.status, t), efEncStatus)) return false;
      if (
        efVisit.trim() &&
        !columnFilterIncludes(e.visitType, efVisit) &&
        !columnFilterIncludes(formatVisitType(e.visitType, t), efVisit)
      ) {
        return false;
      }
      if (efClinic.trim() && !columnFilterIncludes(name(e), efClinic)) return false;
      if (efPatient.trim()) {
        const pText = resolvePatientListLabel({
          patientId: e.patientId,
          patientMrn: e.patientMrn,
          patientName: e.patientName,
          registryLabel: patientLabel.get(e.patientId),
        }).text;
        if (!columnFilterIncludes(pText, efPatient)) return false;
      }
      if (efUpdated.trim()) {
        const ds = new Date(e.updatedAt).toLocaleString(loc);
        if (!columnFilterIncludes(ds, efUpdated) && !columnFilterIncludes(e.updatedAt, efUpdated)) return false;
      }
      return true;
    });
  }, [data, draftOnly, efEncStatus, efVisit, efClinic, efPatient, efUpdated, i18n.language, patientLabel, t]);

  const deleteMut = useMutation({
    mutationFn: (encounterId: string) => apiDelete(`/api/v1/encounters/${encounterId}`),
    onSuccess: () => {
      setEncounterToDelete(null);
      void qc.invalidateQueries({ queryKey: ["encounters"] });
      void qc.invalidateQueries({ queryKey: ["appointments"] });
      void qc.invalidateQueries({ queryKey: ["revenue"] });
      void qc.invalidateQueries({ queryKey: ["dashboard", "kpis"] });
      toast.success(t("encounters.deleteSuccess", "Encounter deleted."));
    },
    onError: (e: unknown) => {
      const msg =
        e instanceof ApiError && e.body && typeof e.body === "object" && "message" in e.body
          ? String((e.body as { message?: unknown }).message)
          : e instanceof Error
            ? e.message
            : String(e);
      toast.error(msg);
    },
  });

  const listColSpan = canDelete ? 6 : 5;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("encounters.listTitle")}</h1>
          <p className="text-muted-foreground">
            {isPhysician
              ? t(
                  "encounters.listSubtitlePhysician",
                  "Encounters where you are the attending physician, across all clinics. The clinic column shows where each visit took place."
                )
              : t("encounters.listSubtitle")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canCreateEncounter ? (
          <CreateActionButton
            type="button"
            disabled={patientRegistryTotal === 0}
            title={
              patientRegistryTotal === 0
                ? t("encounters.noPatientsRegistered", "Register a patient before creating encounters.")
                : undefined
            }
            onClick={() => setCreateOpen(true)}
          >
            {t("encounters.newEncounter", "New encounter")}
          </CreateActionButton>
          ) : null}
          <EncounterCreateWizard open={createOpen} onOpenChange={setCreateOpen} />
          <Button asChild variant="outline">
            <Link to="/patients">{t("nav.patients")}</Link>
          </Button>
        </div>
      </div>

      {isError ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <p className="flex-1">{error instanceof Error ? error.message : t("common.error")}</p>
          <Button type="button" variant="outline" size="sm" disabled={isFetching} onClick={() => void refetch()}>
            {t("common.retry", "Retry")}
          </Button>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("encounters.searchLedger", "Search encounters")}</CardTitle>
        </CardHeader>
        <CardContent className={searchLedgerLayoutClassName}>
          <div className="space-y-2 min-w-0">
            <Label>{t("encounters.patientNameSearch", "Patient name or MRN")}</Label>
            <SearchInput
              className="w-full"
              value={ledgerPatientQuery}
              placeholder={t("encounters.patientNameSearchPh", "Filter by patient…")}
              onChange={(e) => {
                setLedgerPatientQuery(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="space-y-2 min-w-0">
            <Label>{t("encounters.from", "From")}</Label>
            <Input className="ltr-nums w-full" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
          </div>
          <div className="space-y-2 min-w-0">
            <Label>{t("encounters.to", "To")}</Label>
            <Input className="ltr-nums w-full" type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
          </div>
          <div className={searchLedgerActionsClassName}>
            <Button
              type="button"
              variant={draftOnly ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setDraftOnly((v) => !v);
                setPage(1);
              }}
            >
              {t("encounters.showDraftOnly")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                const r = defaultEncounterListRange();
                setFrom(r.from);
                setTo(r.to);
                setPage(1);
              }}
            >
              {t("encounters.lastTwelveMonths", "Last 12 months")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const r = defaultMonthRange();
                setFrom(r.from);
                setTo(r.to);
                setPage(1);
              }}
            >
              {t("encounters.thisMonth", "This month")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">{t("encounters.recent")}</CardTitle>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            disabled={
              !efEncStatus.trim() &&
              !efVisit.trim() &&
              !efClinic.trim() &&
              !efPatient.trim() &&
              !efUpdated.trim()
            }
            onClick={() => {
              setEfEncStatus("");
              setEfVisit("");
              setEfClinic("");
              setEfPatient("");
              setEfUpdated("");
            }}
          >
            {t("patients.clearColFilters", "Clear column filters")}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <ResponsiveTable>
            <table className="w-full min-w-[960px] text-sm">
              <thead className="bg-muted/60">
                <tr className="text-start">
                  <SortableTh
                    label={t("encounters.status")}
                    column="status"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={onSort}
                    filterValue={efEncStatus}
                    onFilterChange={setEfEncStatus}
                  />
                  <FilterTh label={t("encounters.clinic")} value={efClinic} onChange={setEfClinic} align="start" />
                  <SortableTh
                    label={t("encounters.visitType")}
                    column="visitType"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={onSort}
                    filterValue={efVisit}
                    onFilterChange={setEfVisit}
                  />
                  <FilterTh label={t("encounters.patient")} value={efPatient} onChange={setEfPatient} align="center" />
                  <SortableTh
                    label={t("encounters.updated")}
                    column="updatedAt"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={onSort}
                    filterValue={efUpdated}
                    onFilterChange={setEfUpdated}
                  />
                  {canDelete ? (
                    <th className="px-3 py-2 text-end text-xs font-medium text-muted-foreground">
                      {t("common.actions", "Actions")}
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {isPending ? (
                  <tr>
                    <td colSpan={listColSpan} className="px-3 py-8 text-center text-muted-foreground">
                      {t("common.loading")}
                    </td>
                  </tr>
                ) : null}
                {!isPending &&
                  filteredEncounters.map((e) => (
                    <tr
                      key={e.id}
                      role="link"
                      tabIndex={0}
                      className="cursor-pointer border-t border-border transition-colors hover:bg-muted/50"
                      onClick={() => navigate(`/encounters/${e.id}`)}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter" || ev.key === " ") {
                          ev.preventDefault();
                          navigate(`/encounters/${e.id}`);
                        }
                      }}
                    >
                      <td className="px-3 py-2">
                        <Badge variant={e.status === "FINALIZED" ? "default" : "secondary"}>{formatEncounterStatus(e.status, t)}</Badge>
                      </td>
                      <td className="px-3 py-2">
                        <Badge
                          variant="outline"
                          className="max-w-56 truncate border-primary/35 bg-primary/5 font-normal text-foreground"
                          title={formatClinicNameFields(e.clinicNameEn, e.clinicNameAr, i18n.language)}
                        >
                          {formatClinicNameFields(e.clinicNameEn, e.clinicNameAr, i18n.language)}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">{formatVisitType(e.visitType, t)}</td>
                      <td className="px-3 py-2 text-center">
                        {(() => {
                          const r = resolvePatientListLabel({
                            patientId: e.patientId,
                            patientMrn: e.patientMrn,
                            patientName: e.patientName,
                            registryLabel: patientLabel.get(e.patientId),
                          });
                          return r.isIdFallback ? (
                            <span className="font-mono text-xs text-muted-foreground ltr-nums">{r.text}</span>
                          ) : (
                            r.text
                          );
                        })()}
                      </td>
                      <td className="px-3 py-2 ltr-nums text-xs text-muted-foreground">
                        {new Date(e.updatedAt).toLocaleString(localeForLanguage(i18n.language))}
                      </td>
                      {canDelete ? (
                        <td className="px-3 py-2 text-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            aria-label={t("encounters.delete", "Delete")}
                            disabled={deleteMut.isPending}
                            onClick={(ev) => {
                              ev.preventDefault();
                              ev.stopPropagation();
                              setEncounterToDelete({
                                id: e.id,
                                patientName: e.patientName,
                                patientMrn: e.patientMrn,
                                status: e.status,
                                visitType: e.visitType,
                                clinicId: e.clinicId,
                                clinicNameEn: e.clinicNameEn,
                                clinicNameAr: e.clinicNameAr,
                                clinicLabel: formatClinicNameFields(
                                  e.clinicNameEn,
                                  e.clinicNameAr,
                                  i18n.language,
                                ),
                                createdAt: e.createdAt,
                                updatedAt: e.updatedAt,
                                visitFeeAmount: e.visitFeeAmount,
                                visitFeeCurrency: resolveClinicCurrency(e.clinicId),
                              });
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                {!isPending && data.length === 0 ? (
                  <tr>
                    <td colSpan={listColSpan} className="px-3 py-8 text-center text-muted-foreground">
                      {t("encounters.empty")}
                    </td>
                  </tr>
                ) : null}
                {!isPending && data.length > 0 && filteredEncounters.length === 0 ? (
                  <tr>
                    <td colSpan={listColSpan} className="px-3 py-8 text-center text-muted-foreground">
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
            disabled={isPending}
            onPageChange={setPage}
            onPageSizeChange={(s) => {
              setPageSize(s);
              setPage(1);
            }}
          />
        </CardContent>
      </Card>

      <EncounterDeleteConfirmDialog
        open={encounterToDelete != null}
        onOpenChange={(open) => {
          if (!open && !deleteMut.isPending) setEncounterToDelete(null);
        }}
        encounter={encounterToDelete}
        pending={deleteMut.isPending}
        onConfirm={() => {
          if (encounterToDelete) deleteMut.mutate(encounterToDelete.id);
        }}
      />
    </div>
  );
}
