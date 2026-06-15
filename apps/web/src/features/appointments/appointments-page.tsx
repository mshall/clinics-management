import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { CreateActionButton } from "@/components/create-action-button";
import { SearchablePickList, type PickListItem } from "@/components/searchable-pick-list";
import { FilterTh, SortableTh, toggleSort, type SortOrder } from "@/components/sortable-th";
import { ResponsiveTable } from "@/components/responsive-table";
import { TablePagination } from "@/components/table-pagination";
import { AppointmentStatusBadge, appointmentStatusLabel } from "@/components/appointment-status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppointmentsQuery, useClinicsQuery, usePatientsQuery, useUsersQuery } from "@/lib/api-hooks";
import { ApiError, apiPost } from "@/lib/http";
import { resolvePatientListLabel, patientToPickListItem } from "@/lib/patient-display";
import { formatClinicName, formatClinicNameFields, formatUserRole, localeForLanguage } from "@/lib/locale-display";
import { columnFilterIncludes } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";

function toAppointmentIso(localDatetime: string): string {
  const d = new Date(localDatetime);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid date or time");
  return d.toISOString();
}

export function AppointmentsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const authUser = useAuthStore((s) => s.user);
  const isPhysician = authUser?.role === "physician";
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortBy, setSortBy] = useState("startsAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [fltFrom, setFltFrom] = useState("");
  const [fltTo, setFltTo] = useState("");
  const [fltMrn, setFltMrn] = useState("");
  const [fltStatus, setFltStatus] = useState("");
  const [fltClinicId, setFltClinicId] = useState("");
  const [showSearchPanel, setShowSearchPanel] = useState(false);
  const [showBookPanel, setShowBookPanel] = useState(false);
  const [afClinic, setAfClinic] = useState("");
  const [afStarts, setAfStarts] = useState("");
  const [afPatient, setAfPatient] = useState("");
  const [afStatus, setAfStatus] = useState("");

  useEffect(() => {
    if (!isPhysician) return;
    setSortOrder("asc");
    setFltFrom((prev) => prev || new Date().toISOString().slice(0, 10));
  }, [isPhysician]);

  const listParams = useMemo(
    () => ({
      page,
      pageSize,
      sortBy,
      sortOrder,
      from: fltFrom || undefined,
      to: fltTo || undefined,
      patientMrn: fltMrn || undefined,
      status: fltStatus || undefined,
      clinicId: fltClinicId || undefined,
    }),
    [page, pageSize, sortBy, sortOrder, fltFrom, fltTo, fltMrn, fltStatus, fltClinicId]
  );

  const { data: aptData, isPending, isError, error } = useAppointmentsQuery(listParams);

  const onSort = (column: string) => {
    const next = toggleSort(sortBy, sortOrder, column);
    setSortBy(next.sortBy);
    setSortOrder(next.sortOrder);
    setPage(1);
  };
  const rows = aptData?.items ?? [];
  const aptTotal = aptData?.total ?? 0;
  const aptTotalPages = aptData?.totalPages ?? 1;
  const { data: clinics = [] } = useClinicsQuery();
  const clinicById = useMemo(() => {
    const m = new Map<string, { en: string; ar: string }>();
    for (const c of clinics) m.set(c.id, { en: c.nameEn, ar: c.nameAr });
    return m;
  }, [clinics]);
  const { data: patData } = usePatientsQuery({ page: 1, pageSize: 200 });
  const patients = patData?.items ?? [];
  const patientLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of patients) m.set(p.id, `${p.mrn} — ${p.firstNameEn} ${p.lastNameEn}`);
    return m;
  }, [patients]);

  const filteredAppointments = useMemo(() => {
    const loc = localeForLanguage(i18n.language);
    return rows.filter((a) => {
      if (afClinic.trim()) {
        const row = clinicById.get(a.clinicId);
        const label = row ? formatClinicName({ nameEn: row.en, nameAr: row.ar }, i18n.language) : a.clinicId;
        if (!columnFilterIncludes(label, afClinic)) return false;
      }
      if (afStarts.trim()) {
        const ds = new Date(a.startsAt).toLocaleString(loc);
        if (!columnFilterIncludes(ds, afStarts) && !columnFilterIncludes(a.startsAt, afStarts)) return false;
      }
      if (afPatient.trim()) {
        const pText = resolvePatientListLabel({
          patientId: a.patientId,
          patientMrn: a.patientMrn,
          patientName: a.patientName,
          registryLabel: patientLabel.get(a.patientId),
        }).text;
        if (!columnFilterIncludes(pText, afPatient)) return false;
      }
      if (afStatus.trim() && !columnFilterIncludes(a.status, afStatus)) return false;
      return true;
    });
  }, [rows, afClinic, afStarts, afPatient, afStatus, i18n.language, patientLabel, clinicById]);

  const { data: userData } = useUsersQuery({ page: 1, pageSize: 100, enabled: showBookPanel && !isPhysician });
  const users = userData?.items ?? [];
  const physicians = users.filter((u) => u.role === "PHYSICIAN");

  const [clinicId, setClinicId] = useState("");
  const [patientId, setPatientId] = useState("");
  const [clinicianId, setClinicianId] = useState("");
  useEffect(() => {
    if (authUser?.role === "physician" && authUser.id) setClinicianId(authUser.id);
  }, [authUser?.role, authUser?.id]);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [formErr, setFormErr] = useState<string | null>(null);
  const [bookOk, setBookOk] = useState<string | null>(null);

  const [bookPatientSearch, setBookPatientSearch] = useState("");
  const [debouncedBookPatient, setDebouncedBookPatient] = useState("");
  useEffect(() => {
    const tid = window.setTimeout(() => setDebouncedBookPatient(bookPatientSearch), 280);
    return () => window.clearTimeout(tid);
  }, [bookPatientSearch]);
  const { data: bookPatData, isPending: bookPatientsPending } = usePatientsQuery({
    search: debouncedBookPatient.trim() || undefined,
    page: 1,
    pageSize: 100,
    enabled: showBookPanel,
  });
  const bookPatients = bookPatData?.items ?? [];
  const bookPatientItems: PickListItem[] = useMemo(
    () => bookPatients.map((p) => patientToPickListItem(p)),
    [bookPatients]
  );

  const clinicItems: PickListItem[] = useMemo(
    () => clinics.map((c) => ({ value: c.id, label: formatClinicName(c, i18n.language) })),
    [clinics, i18n.language],
  );
  const physicianItems: PickListItem[] = useMemo(
    () => physicians.map((u) => ({ value: u.id, label: u.displayName, hint: formatUserRole(u.role, t) })),
    [physicians, t],
  );

  const createMut = useMutation({
    mutationFn: () => {
      if (!clinicId || !patientId || !clinicianId) throw new Error("Select clinic, patient, and clinician.");
      if (!start?.trim() || !end?.trim()) throw new Error("Start and end date/time are required.");
      const startsAt = toAppointmentIso(start);
      const endsAt = toAppointmentIso(end);
      if (new Date(endsAt) <= new Date(startsAt)) throw new Error("End must be after start.");
      return apiPost("/api/v1/appointments", {
        clinicId,
        patientId,
        clinicianId,
        startsAt,
        endsAt,
      });
    },
    onSuccess: () => {
      setFormErr(null);
      setBookOk(t("appointments.bookedOk", "Appointment created."));
      setPatientId("");
      setBookPatientSearch("");
      setDebouncedBookPatient("");
      setStart("");
      setEnd("");
      void qc.invalidateQueries({ queryKey: ["appointments"] });
      void qc.invalidateQueries({ queryKey: ["dashboard", "kpis"] });
    },
    onError: (e: unknown) => {
      setBookOk(null);
      if (e instanceof ApiError && e.body && typeof e.body === "object" && "message" in e.body) {
        setFormErr(String((e.body as { message?: unknown }).message));
      } else setFormErr(e instanceof Error ? e.message : String(e));
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {isPhysician ? t("appointments.myTitle", "My appointments") : t("appointments.title")}
        </h1>
        <p className="text-muted-foreground">
          {isPhysician
            ? t(
                "appointments.subtitlePhysician",
                "Appointments where you are the assigned doctor. Use the date range to focus on upcoming visits."
              )
            : t("appointments.subtitle")}
        </p>
      </div>

      {isError ? <p className="text-sm text-destructive">{error instanceof Error ? error.message : t("common.error")}</p> : null}

      {isPhysician ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("appointments.dateRange", "Date range")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label htmlFor="phys-apt-from">{t("appointments.filterFrom", "From date")}</Label>
              <Input
                id="phys-apt-from"
                className="ltr-nums"
                type="date"
                value={fltFrom}
                onChange={(e) => {
                  setFltFrom(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="phys-apt-to">{t("appointments.filterTo", "To date")}</Label>
              <Input
                id="phys-apt-to"
                className="ltr-nums"
                type="date"
                value={fltTo}
                onChange={(e) => {
                  setFltTo(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="phys-apt-status">{t("appointments.status")}</Label>
              <select
                id="phys-apt-status"
                className="flex h-9 min-w-[160px] rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                value={fltStatus}
                onChange={(e) => {
                  setFltStatus(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">{t("appointments.anyStatus", "Any status")}</option>
                {(["SCHEDULED", "CONFIRMED", "CHECKED_IN", "CANCELLED", "COMPLETED"] as const).map((s) => (
                  <option key={s} value={s}>
                    {appointmentStatusLabel(s, t)}
                  </option>
                ))}
              </select>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant={showSearchPanel ? "default" : "outline"} onClick={() => setShowSearchPanel((s) => !s)}>
            {showSearchPanel ? t("appointments.hideSearch", "Hide search") : t("appointments.showSearch", "Search appointments")}
          </Button>
          <CreateActionButton type="button" onClick={() => setShowBookPanel((s) => !s)}>
            {showBookPanel ? t("appointments.hideBook", "Hide booking") : t("appointments.showBook", "Book an appointment")}
          </CreateActionButton>
        </div>
      )}

      {!isPhysician && showSearchPanel ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("appointments.filters", "Search appointments")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label>{t("appointments.filterFrom", "From date")}</Label>
              <Input className="ltr-nums" type="date" value={fltFrom} onChange={(e) => { setFltFrom(e.target.value); setPage(1); }} />
            </div>
            <div className="space-y-2">
              <Label>{t("appointments.filterTo", "To date")}</Label>
              <Input className="ltr-nums" type="date" value={fltTo} onChange={(e) => { setFltTo(e.target.value); setPage(1); }} />
            </div>
            <div className="space-y-2">
              <Label>{t("appointments.patientMrn", "Patient MRN")}</Label>
              <Input className="ltr-nums" value={fltMrn} onChange={(e) => { setFltMrn(e.target.value); setPage(1); }} placeholder="MRN-" />
            </div>
            <div className="space-y-2">
              <Label>{t("appointments.status")}</Label>
              <SearchablePickList
                items={[
                  { value: "", label: t("appointments.anyStatus", "Any status") },
                  ...(["SCHEDULED", "CONFIRMED", "CHECKED_IN", "CANCELLED", "COMPLETED"] as const).map((s) => ({
                    value: s,
                    label: appointmentStatusLabel(s, t),
                  })),
                ]}
                value={fltStatus}
                onValueChange={(v) => {
                  setFltStatus(v);
                  setPage(1);
                }}
                searchPlaceholder={t("appointments.filterStatus", "Type to filter status…")}
                placeholder={t("appointments.status")}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("appointments.clinic")}</Label>
              <SearchablePickList
                items={[{ value: "", label: t("appointments.allClinics", "All clinics") }, ...clinicItems]}
                value={fltClinicId}
                onValueChange={(v) => {
                  setFltClinicId(v);
                  setPage(1);
                }}
                searchPlaceholder={t("appointments.filterClinic", "Type clinic name…")}
                placeholder={t("appointments.clinic")}
              />
            </div>
          </CardContent>
        </Card>
      ) : null}

      {!isPhysician && showBookPanel ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("appointments.book")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {bookOk ? <p className="text-sm text-emerald-600 sm:col-span-full dark:text-emerald-400">{bookOk}</p> : null}
            {formErr ? <p className="text-sm text-destructive sm:col-span-full">{formErr}</p> : null}
            <div className="space-y-2 sm:col-span-2">
              <Label required>{t("appointments.clinic")}</Label>
              <SearchablePickList
                items={clinicItems}
                value={clinicId}
                onValueChange={setClinicId}
                searchPlaceholder={t("appointments.filterClinic", "Type clinic name…")}
                placeholder={t("appointments.pick")}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label required>{t("appointments.patient")}</Label>
              <p className="text-xs text-muted-foreground">{t("encounters.selectPatientHint")}</p>
              <SearchablePickList
                items={bookPatientItems}
                value={patientId}
                onValueChange={setPatientId}
                onSearchQueryChange={setBookPatientSearch}
                searchPlaceholder={t("encounters.patientSearchPlaceholder")}
                placeholder={t("appointments.pick")}
                emptyMessage={
                  bookPatientsPending ? t("common.loading") : t("encounters.noPatientsMatch", "No patients match.")
                }
                localFilter={false}
                minSearchLength={1}
                idleMessage={t("encounters.patientSearchIdle", "Start typing to show matching patients.")}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label required>{t("appointments.clinician")}</Label>
              <SearchablePickList
                items={physicianItems}
                value={clinicianId}
                onValueChange={setClinicianId}
                searchPlaceholder={t("appointments.filterPhysician", "Type physician name…")}
                placeholder={t("appointments.pickPhysician")}
                emptyMessage={t("appointments.noPhysicians", "No physicians found.")}
              />
            </div>
            <div className="space-y-2">
              <Label required>{t("appointments.starts")}</Label>
              <Input className="ltr-nums" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label required>{t("appointments.ends")}</Label>
              <Input className="ltr-nums" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
            <div className="flex flex-wrap items-end gap-2 sm:col-span-2">
              <CreateActionButton
                type="button"
                disabled={!clinicId || !patientId || !clinicianId || !start || !end || createMut.isPending}
                onClick={() => {
                  setFormErr(null);
                  setBookOk(null);
                  createMut.mutate();
                }}
              >
                {t("appointments.create")}
              </CreateActionButton>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">
            {isPhysician ? t("appointments.myList", "My schedule") : t("appointments.list")}
          </CardTitle>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            disabled={!afClinic.trim() && !afStarts.trim() && !afPatient.trim() && !afStatus.trim()}
            onClick={() => {
              setAfClinic("");
              setAfStarts("");
              setAfPatient("");
              setAfStatus("");
            }}
          >
            {t("patients.clearColFilters", "Clear column filters")}
          </Button>
        </CardHeader>
        <CardContent>
          <ResponsiveTable>
            <table className="w-full min-w-[960px] text-sm">
              <thead className="bg-muted/60">
                <tr>
                  <FilterTh label={t("appointments.patient")} value={afPatient} onChange={setAfPatient} />
                  <SortableTh
                    label={t("appointments.starts")}
                    column="startsAt"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={onSort}
                    filterValue={afStarts}
                    onFilterChange={setAfStarts}
                  />
                  <FilterTh label={t("appointments.clinic")} value={afClinic} onChange={setAfClinic} />
                  <SortableTh
                    label={t("appointments.status")}
                    column="status"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={onSort}
                    filterValue={afStatus}
                    onFilterChange={setAfStatus}
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
                {!isPending && rows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                      {isPhysician
                        ? t("appointments.myEmpty", "No appointments assigned to you in this period.")
                        : t("appointments.empty", "No appointments found.")}
                    </td>
                  </tr>
                ) : null}
                {!isPending &&
                  filteredAppointments.map((a) => {
                    const cRow = clinicById.get(a.clinicId);
                    const clinicLabel =
                      formatClinicNameFields(a.clinicNameEn, a.clinicNameAr, i18n.language, cRow ? formatClinicName({ nameEn: cRow.en, nameAr: cRow.ar }, i18n.language) : a.clinicId);
                    return (
                    <tr
                      key={a.id}
                      role="link"
                      tabIndex={0}
                      className="cursor-pointer border-t border-border transition-colors hover:bg-muted/50"
                      onClick={() => navigate(`/appointments/${a.id}`)}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter" || ev.key === " ") {
                          ev.preventDefault();
                          navigate(`/appointments/${a.id}`);
                        }
                      }}
                    >
                      <td className="max-w-[10rem] truncate px-3 py-2 text-xs sm:max-w-[14rem]">
                        {(() => {
                          const r = resolvePatientListLabel({
                            patientId: a.patientId,
                            patientMrn: a.patientMrn,
                            patientName: a.patientName,
                            registryLabel: patientLabel.get(a.patientId),
                          });
                          return r.isIdFallback ? (
                            <span className="font-mono text-muted-foreground ltr-nums">{r.text}</span>
                          ) : (
                            r.text
                          );
                        })()}
                      </td>
                      <td className="px-3 py-2 ltr-nums text-xs">
                        {new Date(a.startsAt).toLocaleString(localeForLanguage(i18n.language))}
                      </td>
                      <td className="px-3 py-2">
                        <Badge
                          variant="outline"
                          className="max-w-[14rem] truncate border-primary/35 bg-primary/5 font-normal text-foreground"
                          title={clinicLabel ?? undefined}
                        >
                          {clinicLabel ?? (
                            <span className="font-mono ltr-nums text-muted-foreground">{a.clinicId.slice(0, 8)}…</span>
                          )}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        <AppointmentStatusBadge status={a.status} />
                      </td>
                    </tr>
                    );
                  })}
                {!isPending && rows.length > 0 && filteredAppointments.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
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
            total={aptTotal}
            totalPages={aptTotalPages}
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
