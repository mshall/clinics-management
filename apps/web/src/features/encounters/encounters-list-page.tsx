import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { CreateActionButton } from "@/components/create-action-button";
import { FilterTh, SortableTh, toggleSort, type SortOrder } from "@/components/sortable-th";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchablePickList, type PickListItem } from "@/components/searchable-pick-list";
import { TablePagination } from "@/components/table-pagination";
import { useAdminOverviewQuery, useAppointmentsQuery, useClinicsQuery, useEncountersQuery, usePatientsQuery } from "@/lib/api-hooks";
import type { AppointmentDto, EncounterDetailDto } from "@/lib/api-types";
import { ApiError, apiPost } from "@/lib/http";
import { ENCOUNTER_VISIT_TYPES } from "@/lib/visit-types";
import { defaultMonthRange } from "@/stores/date-range-store";

export function EncountersListPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const initialRange = useMemo(() => defaultMonthRange(), []);
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
  const { data: encData, isPending, isError, error } = useEncountersQuery({
    page,
    pageSize,
    sortBy,
    sortOrder,
    from,
    to,
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
  const [patientSearch, setPatientSearch] = useState("");
  const [debouncedPatientSearch, setDebouncedPatientSearch] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedPatientSearch(patientSearch), 280);
    return () => window.clearTimeout(timer);
  }, [patientSearch]);
  const { data: dialogPatData, isPending: dialogPatientsPending } = usePatientsQuery({
    search: debouncedPatientSearch.trim() || undefined,
    page: 1,
    pageSize: 100,
    enabled: createOpen,
  });
  const dialogPatientList = dialogPatData?.items;
  const dialogPatientItems: PickListItem[] = useMemo(
    () =>
      (dialogPatientList ?? []).map((p) => ({
        value: p.id,
        label: `${p.firstNameEn} ${p.lastNameEn}`.trim(),
        hint: p.mrn,
      })),
    [dialogPatientList]
  );
  const { data: clinics = [] } = useClinicsQuery();
  const data = encData?.items ?? [];
  const total = encData?.total ?? 0;
  const totalPages = encData?.totalPages ?? 1;
  const [efEncStatus, setEfEncStatus] = useState("");
  const [efVisit, setEfVisit] = useState("");
  const [efPatient, setEfPatient] = useState("");
  const [efUpdated, setEfUpdated] = useState("");

  const patientLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of patData?.items ?? []) {
      m.set(p.id, `${p.firstNameEn} ${p.lastNameEn}`);
    }
    return m;
  }, [patData?.items]);
  const patientRegistryTotal = patData?.total ?? 0;

  const filteredEncounters = useMemo(() => {
    const loc = i18n.language === "ar" ? "ar-AE" : "en-AE";
    const n = (s: string) => s.trim().toLowerCase();
    const fst = n(efEncStatus);
    const fv = n(efVisit);
    const fp = n(efPatient);
    const fu = n(efUpdated);
    return data.filter((e) => {
      if (fst && !e.status.toLowerCase().includes(fst)) return false;
      if (fv && !e.visitType.toLowerCase().includes(fv)) return false;
      if (fp) {
        const label = (patientLabel.get(e.patientId) ?? e.patientId).toLowerCase();
        if (!label.includes(fp)) return false;
      }
      if (fu) {
        const ds = new Date(e.updatedAt).toLocaleString(loc).toLowerCase();
        if (!ds.includes(fu) && !e.updatedAt.toLowerCase().includes(fu)) return false;
      }
      return true;
    });
  }, [data, efEncStatus, efVisit, efPatient, efUpdated, i18n.language, patientLabel]);

  const [createPatientId, setCreatePatientId] = useState("");
  const [createClinicId, setCreateClinicId] = useState("");
  const [createVisitType, setCreateVisitType] = useState<string>(ENCOUNTER_VISIT_TYPES[0] ?? "Office visit");
  const [createVisitFee, setCreateVisitFee] = useState("");
  const [createErr, setCreateErr] = useState<string | null>(null);
  const [aptPickerSearch, setAptPickerSearch] = useState("");
  const [debouncedAptPicker, setDebouncedAptPicker] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedAptPicker(aptPickerSearch), 320);
    return () => window.clearTimeout(timer);
  }, [aptPickerSearch]);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState("");
  const aptPickerEnabled =
    createOpen && (Boolean(createPatientId.trim()) || debouncedAptPicker.trim().length >= 2);
  const { data: aptPickerData, isPending: aptPickerPending } = useAppointmentsQuery({
    patientSearch:
      createPatientId.trim().length > 0
        ? undefined
        : debouncedAptPicker.trim().length >= 2
          ? debouncedAptPicker.trim()
          : undefined,
    patientId: createPatientId.trim() || undefined,
    bookableOnly: true,
    page: 1,
    pageSize: 30,
    enabled: aptPickerEnabled,
  });
  const aptPickerRows = aptPickerData?.items ?? [];
  const aptPickerItems: PickListItem[] = useMemo(
    () =>
      aptPickerRows.map((a: AppointmentDto) => ({
        value: a.id,
        label: `${new Date(a.startsAt).toLocaleString(i18n.language === "ar" ? "ar-AE" : "en-AE")} · ${a.status}`,
        hint: `${(a.patientName ?? "").trim() || "—"} · ${a.patientMrn ?? a.patientId.slice(0, 8)}`,
      })),
    [aptPickerRows, i18n.language]
  );

  const adminOv = useAdminOverviewQuery();
  useEffect(() => {
    if (!createOpen) return;
    const d = adminOv.data?.currentTenant?.defaultVisitFee;
    if (d != null && Number.isFinite(Number(d))) setCreateVisitFee(String(d));
  }, [createOpen, adminOv.data?.currentTenant?.defaultVisitFee]);

  const openCreateDialog = () => {
    setPatientSearch("");
    setDebouncedPatientSearch("");
    setCreatePatientId("");
    setCreateClinicId(clinics[0]?.id ?? "");
    setCreateVisitType(ENCOUNTER_VISIT_TYPES[0] ?? "Office visit");
    const d = adminOv.data?.currentTenant?.defaultVisitFee;
    setCreateVisitFee(d != null && Number.isFinite(Number(d)) ? String(d) : "");
    setCreateErr(null);
    setAptPickerSearch("");
    setDebouncedAptPicker("");
    setSelectedAppointmentId("");
    setCreateOpen(true);
  };

  const createMut = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        clinicId: createClinicId,
        patientId: createPatientId,
        visitType: createVisitType,
        chiefComplaint: "",
      };
      const trimmed = createVisitFee.trim();
      if (trimmed !== "") {
        const fee = Number.parseFloat(trimmed);
        if (Number.isFinite(fee) && fee >= 0) body.visitFeeAmount = fee;
      }
      if (selectedAppointmentId.trim()) body.appointmentId = selectedAppointmentId.trim();
      return apiPost<EncounterDetailDto>("/api/v1/encounters", body);
    },
    onSuccess: (enc) => {
      setCreateErr(null);
      setCreateOpen(false);
      void qc.invalidateQueries({ queryKey: ["encounters"] });
      void qc.invalidateQueries({ queryKey: ["patient", enc.patientId] });
      void qc.invalidateQueries({ queryKey: ["appointments"] });
      void qc.invalidateQueries({ queryKey: ["revenue"] });
      void qc.invalidateQueries({ queryKey: ["dashboard", "kpis"] });
      navigate(`/encounters/${enc.id}`);
    },
    onError: (e: unknown) => {
      if (e instanceof ApiError && e.body && typeof e.body === "object" && "message" in e.body) {
        setCreateErr(String((e.body as { message?: unknown }).message));
      } else setCreateErr(e instanceof Error ? e.message : String(e));
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("encounters.listTitle")}</h1>
          <p className="text-muted-foreground">{t("encounters.listSubtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <CreateActionButton
            type="button"
            disabled={patientRegistryTotal === 0}
            title={
              patientRegistryTotal === 0
                ? t("encounters.noPatientsRegistered", "Register a patient before creating encounters.")
                : undefined
            }
            onClick={openCreateDialog}
          >
            {t("encounters.newEncounter", "New encounter")}
          </CreateActionButton>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogContent aria-describedby={undefined}>
              <DialogHeader>
                <DialogTitle>{t("encounters.createEncounterTitle", "Create encounter")}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3 pt-1">
                {createErr ? <p className="text-sm text-destructive">{createErr}</p> : null}
                {patientRegistryTotal === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("encounters.noPatientsRegistered", "Register a patient first.")}</p>
                ) : null}
                <div className="space-y-2">
                  <Label>{t("encounters.patient")}</Label>
                  <p className="text-xs text-muted-foreground">{t("encounters.selectPatientHint", "Choose a patient from the list (search by name or MRN).")}</p>
                  <SearchablePickList
                    items={dialogPatientItems}
                    value={createPatientId}
                    onValueChange={(v) => {
                      setCreatePatientId(v);
                      setSelectedAppointmentId("");
                    }}
                    onSearchQueryChange={setPatientSearch}
                    searchPlaceholder={t("encounters.patientSearchPlaceholder", "Type name or MRN to filter…")}
                    placeholder={t("encounters.pickPatient", "Pick patient")}
                    emptyMessage={dialogPatientsPending ? t("common.loading") : t("encounters.noPatientsMatch", "No patients match.")}
                    localFilter={false}
                    minSearchLength={1}
                    idleMessage={t("encounters.patientSearchIdle", "Start typing to show matching patients.")}
                  />
                </div>
                <div className="space-y-2 rounded-md border border-dashed border-border p-3">
                  <Label>{t("encounters.linkedAppointment", "Booked appointment (optional)")}</Label>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "encounters.linkedAppointmentHint",
                      "Search by patient name, MRN, phone, or national ID. Linking sets the appointment to checked in until the encounter is finalized (then completed)."
                    )}
                  </p>
                  <SearchablePickList
                    items={aptPickerItems}
                    value={selectedAppointmentId}
                    onValueChange={(v) => {
                      setSelectedAppointmentId(v);
                      const row = aptPickerRows.find((a) => a.id === v);
                      if (row) {
                        setCreatePatientId(row.patientId);
                        setCreateClinicId(row.clinicId);
                      }
                    }}
                    onSearchQueryChange={setAptPickerSearch}
                    searchPlaceholder={t("encounters.appointmentSearchPlaceholder", "Type at least 2 characters or pick a patient first…")}
                    placeholder={t("encounters.linkedAppointment", "Booked appointment (optional)")}
                    emptyMessage={aptPickerPending ? t("common.loading") : t("encounters.noBookableAppointments", "No matching open appointments.")}
                    localFilter={false}
                    minSearchLength={createPatientId.trim().length > 0 ? 0 : 2}
                    idleMessage={t("encounters.appointmentSearchIdle", "Type to search or select a patient to see their bookings.")}
                  />
                  {selectedAppointmentId ? (
                    <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setSelectedAppointmentId("")}>
                      {t("encounters.clearAppointment", "Clear appointment link")}
                    </Button>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label>{t("encounters.clinic", "Clinic")}</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={createClinicId}
                    onChange={(e) => setCreateClinicId(e.target.value)}
                  >
                    {clinics.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nameEn}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>{t("encounters.visitType")}</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={createVisitType}
                    onChange={(e) => setCreateVisitType(e.target.value)}
                  >
                    {ENCOUNTER_VISIT_TYPES.map((vt) => (
                      <option key={vt} value={vt}>
                        {vt}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>{t("encounters.visitFee", "Visit fee")}</Label>
                  <Input
                    className="ltr-nums"
                    type="number"
                    min="0"
                    step="0.01"
                    value={createVisitFee}
                    onChange={(e) => setCreateVisitFee(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("encounters.visitFeeHint", "Default comes from organization settings (admin).")}
                  </p>
                </div>
                <CreateActionButton
                  type="button"
                  disabled={
                    patientRegistryTotal === 0 ||
                    !createPatientId ||
                    !createClinicId ||
                    !createVisitType.trim() ||
                    createMut.isPending
                  }
                  onClick={() => createMut.mutate()}
                >
                  {t("encounters.createAndOpen", "Create & open")}
                </CreateActionButton>
              </div>
            </DialogContent>
          </Dialog>
          <Button asChild variant="outline">
            <Link to="/patients">{t("nav.patients")}</Link>
          </Button>
        </div>
      </div>

      {isError ? (
        <p className="text-sm text-destructive">{error instanceof Error ? error.message : t("common.error")}</p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("encounters.searchLedger", "Search encounters")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="space-y-2 min-w-[12rem] flex-1">
            <Label>{t("encounters.patientNameSearch", "Patient name or MRN")}</Label>
            <Input
              className="ltr-nums"
              value={ledgerPatientQuery}
              placeholder={t("encounters.patientNameSearchPh", "Filter by patient…")}
              onChange={(e) => {
                setLedgerPatientQuery(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("encounters.from", "From")}</Label>
            <Input className="ltr-nums" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
          </div>
          <div className="space-y-2">
            <Label>{t("encounters.to", "To")}</Label>
            <Input className="ltr-nums" type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
          </div>
          <Button
            type="button"
            variant="secondary"
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
            disabled={!efEncStatus.trim() && !efVisit.trim() && !efPatient.trim() && !efUpdated.trim()}
            onClick={() => {
              setEfEncStatus("");
              setEfVisit("");
              setEfPatient("");
              setEfUpdated("");
            }}
          >
            {t("patients.clearColFilters", "Clear column filters")}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-sm">
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
                </tr>
              </thead>
              <tbody>
                {isPending ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
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
                        <Badge variant={e.status === "FINALIZED" ? "default" : "secondary"}>{e.status}</Badge>
                      </td>
                      <td className="px-3 py-2">{e.visitType}</td>
                      <td className="px-3 py-2 text-center">
                        {patientLabel.get(e.patientId) ?? (
                          <span className="font-mono text-xs text-muted-foreground ltr-nums">{e.patientId.slice(0, 8)}…</span>
                        )}
                      </td>
                      <td className="px-3 py-2 ltr-nums text-xs text-muted-foreground">
                        {new Date(e.updatedAt).toLocaleString(i18n.language === "ar" ? "ar-AE" : "en-AE")}
                      </td>
                    </tr>
                  ))}
                {!isPending && data.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                      {t("encounters.empty")}
                    </td>
                  </tr>
                ) : null}
                {!isPending && data.length > 0 && filteredEncounters.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                      {t("patients.noColMatch", "No rows match the column filters.")}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
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
    </div>
  );
}
