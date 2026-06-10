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
import { ResponsiveTable } from "@/components/responsive-table";
import { TablePagination } from "@/components/table-pagination";
import {
  useAdminOverviewQuery,
  useAppointmentsQuery,
  useClinicsQuery,
  encounterLedgerFromTo,
  useEncountersQuery,
  usePatientsQuery,
  useUsersQuery,
} from "@/lib/api-hooks";
import type { AppointmentDto, EncounterDetailDto } from "@/lib/api-types";
import { appointmentStatusLabel } from "@/components/appointment-status-badge";
import { ApiError, apiPost } from "@/lib/http";
import { formatEncounterStatus, formatClinicName, formatClinicNameFields, localeForLanguage } from "@/lib/locale-display";
import { resolvePatientListLabel, patientToPickListItem } from "@/lib/patient-display";
import { columnFilterIncludes } from "@/lib/utils";
import { ENCOUNTER_VISIT_TYPES } from "@/lib/visit-types";
import { defaultEncounterListRange, defaultMonthRange } from "@/stores/date-range-store";
import { useAuthStore } from "@/stores/auth-store";

export function EncountersListPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const authUser = useAuthStore((s) => s.user);
  const isPhysician = authUser?.role === "physician";
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
    () => (dialogPatientList ?? []).map((p) => patientToPickListItem(p)),
    [dialogPatientList]
  );
  const { data: clinics = [] } = useClinicsQuery();
  const data = encData?.items ?? [];
  const total = encData?.total ?? 0;
  const totalPages = encData?.totalPages ?? 1;
  const [efEncStatus, setEfEncStatus] = useState("");
  const [efVisit, setEfVisit] = useState("");
  const [efClinic, setEfClinic] = useState("");
  const [efPatient, setEfPatient] = useState("");
  const [efUpdated, setEfUpdated] = useState("");
  const [draftOnly, setDraftOnly] = useState(false);

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
      if (efVisit.trim() && !columnFilterIncludes(e.visitType, efVisit)) return false;
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

  const [createPatientId, setCreatePatientId] = useState("");
  const [createClinicId, setCreateClinicId] = useState("");
  const [createVisitType, setCreateVisitType] = useState<string>(ENCOUNTER_VISIT_TYPES[0] ?? "Office visit");
  const [createVisitFee, setCreateVisitFee] = useState("");
  const [createClinicianId, setCreateClinicianId] = useState("");
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
  const { data: usersForDoctors } = useUsersQuery({ page: 1, pageSize: 200, enabled: createOpen && !isPhysician });
  const doctorPickItems: PickListItem[] = useMemo(
    () =>
      (usersForDoctors?.items ?? [])
        .filter((u) => u.role === "PHYSICIAN")
        .map((u) => ({
          value: u.id,
          label: u.displayName,
          hint: u.email,
        })),
    [usersForDoctors?.items]
  );

  const aptPickerRows = aptPickerData?.items ?? [];
  const aptPickerItems: PickListItem[] = useMemo(
    () =>
      aptPickerRows.map((a: AppointmentDto) => {
        const clinicHint = formatClinicNameFields(a.clinicNameEn, a.clinicNameAr, i18n.language);
        return {
          value: a.id,
          label: `${new Date(a.startsAt).toLocaleString(localeForLanguage(i18n.language))} · ${appointmentStatusLabel(a.status, t)}`,
          hint: [clinicHint, `${(a.patientName ?? "").trim() || "—"} · ${a.patientMrn ?? a.patientId.slice(0, 8)}`]
            .filter(Boolean)
            .join(" · "),
        };
      }),
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
    setCreateClinicianId("");
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
      if (!isPhysician && createClinicianId.trim()) body.clinicianId = createClinicianId.trim();
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
                  <Label required>{t("encounters.patient")}</Label>
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
                        setCreateClinicianId(row.clinicianId);
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
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => {
                        setSelectedAppointmentId("");
                        setCreateClinicianId("");
                      }}
                    >
                      {t("encounters.clearAppointment", "Clear appointment link")}
                    </Button>
                  ) : null}
                </div>
                {!isPhysician ? (
                  <div className="space-y-2">
                    <Label>{t("encounters.attendingPhysician")}</Label>
                    <p className="text-xs text-muted-foreground">{t("encounters.attendingPhysicianHint")}</p>
                    <SearchablePickList
                      items={doctorPickItems}
                      value={createClinicianId}
                      onValueChange={setCreateClinicianId}
                      searchPlaceholder={t("appointments.pickPhysician")}
                      placeholder={t("encounters.attendingPhysician")}
                      emptyMessage={t("encounters.noDoctors", "No doctor accounts in this organization.")}
                      localFilter
                      minSearchLength={0}
                      idleMessage={t("encounters.pickDoctorIdle", "Pick the attending doctor for this encounter.")}
                    />
                  </div>
                ) : null}
                <div className="space-y-2">
                  <Label required>{t("encounters.clinic", "Clinic")}</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={createClinicId}
                    onChange={(e) => setCreateClinicId(e.target.value)}
                  >
                    {clinics.map((c) => (
                      <option key={c.id} value={c.id}>
                        {formatClinicName(c, i18n.language)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label required>{t("encounters.visitType")}</Label>
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
                    createMut.isPending ||
                    (!isPhysician &&
                      !createClinicianId.trim() &&
                      !selectedAppointmentId.trim())
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
                </tr>
              </thead>
              <tbody>
                {isPending ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
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
                          className="max-w-[14rem] truncate border-primary/35 bg-primary/5 font-normal text-foreground"
                          title={formatClinicNameFields(e.clinicNameEn, e.clinicNameAr, i18n.language)}
                        >
                          {formatClinicNameFields(e.clinicNameEn, e.clinicNameAr, i18n.language)}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">{e.visitType}</td>
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
                    </tr>
                  ))}
                {!isPending && data.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                      {t("encounters.empty")}
                    </td>
                  </tr>
                ) : null}
                {!isPending && data.length > 0 && filteredEncounters.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
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
    </div>
  );
}
