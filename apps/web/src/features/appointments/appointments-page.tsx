import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { SearchablePickList, type PickListItem } from "@/components/searchable-pick-list";
import { cn } from "@/lib/utils";
import { FilterTh, SortableTh, toggleSort, type SortOrder } from "@/components/sortable-th";
import { TablePagination } from "@/components/table-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAdminOverviewQuery, useAppointmentsQuery, useClinicsQuery, usePatientsQuery, useUsersQuery } from "@/lib/api-hooks";
import { ApiError, apiPost } from "@/lib/http";

function toAppointmentIso(localDatetime: string): string {
  const d = new Date(localDatetime);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid date or time");
  return d.toISOString();
}

export function AppointmentsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
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
  const clinicNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of clinics) m.set(c.id, c.nameEn);
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
    const loc = i18n.language === "ar" ? "ar-AE" : "en-AE";
    const n = (s: string) => s.trim().toLowerCase();
    const fc = n(afClinic);
    const fs = n(afStarts);
    const fp = n(afPatient);
    const fst = n(afStatus);
    return rows.filter((a) => {
      if (fc) {
        const cn = (clinicNameById.get(a.clinicId) ?? a.clinicId).toLowerCase();
        if (!cn.includes(fc)) return false;
      }
      if (fs) {
        const ds = new Date(a.startsAt).toLocaleString(loc).toLowerCase();
        if (!ds.includes(fs) && !a.startsAt.toLowerCase().includes(fs)) return false;
      }
      if (fp) {
        const label = (patientLabel.get(a.patientId) ?? a.patientId).toLowerCase();
        if (!label.includes(fp)) return false;
      }
      if (fst && !a.status.toLowerCase().includes(fst)) return false;
      return true;
    });
  }, [rows, afClinic, afStarts, afPatient, afStatus, i18n.language, patientLabel, clinicNameById]);

  const { data: userData } = useUsersQuery({ page: 1, pageSize: 100 });
  const users = userData?.items ?? [];
  const physicians = users.filter((u) => u.role === "PHYSICIAN");

  const [clinicId, setClinicId] = useState("");
  const [patientId, setPatientId] = useState("");
  const [clinicianId, setClinicianId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [formErr, setFormErr] = useState<string | null>(null);
  const [bookOk, setBookOk] = useState<string | null>(null);
  const [aptFee, setAptFee] = useState("");
  const adminOv = useAdminOverviewQuery();
  useEffect(() => {
    if (!showBookPanel) return;
    const d = adminOv.data?.currentTenant?.appointmentDefaultFee;
    if (d != null && Number.isFinite(Number(d))) setAptFee(String(d));
  }, [showBookPanel, adminOv.data?.currentTenant?.appointmentDefaultFee]);

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

  const clinicItems: PickListItem[] = useMemo(
    () => clinics.map((c) => ({ value: c.id, label: c.nameEn })),
    [clinics]
  );
  const physicianItems: PickListItem[] = useMemo(
    () => physicians.map((u) => ({ value: u.id, label: u.displayName, hint: u.role })),
    [physicians]
  );

  const createMut = useMutation({
    mutationFn: () => {
      if (!clinicId || !patientId || !clinicianId) throw new Error("Select clinic, patient, and clinician.");
      if (!start?.trim() || !end?.trim()) throw new Error("Start and end date/time are required.");
      const startsAt = toAppointmentIso(start);
      const endsAt = toAppointmentIso(end);
      if (new Date(endsAt) <= new Date(startsAt)) throw new Error("End must be after start.");
      const fee = Number.parseFloat(aptFee.trim() || "0");
      return apiPost("/api/v1/appointments", {
        clinicId,
        patientId,
        clinicianId,
        startsAt,
        endsAt,
        feeAmount: Number.isFinite(fee) && fee >= 0 ? fee : 0,
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
      void qc.invalidateQueries({ queryKey: ["revenue"] });
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
        <h1 className="text-2xl font-bold tracking-tight">{t("appointments.title")}</h1>
        <p className="text-muted-foreground">{t("appointments.subtitle")}</p>
      </div>

      {isError ? <p className="text-sm text-destructive">{error instanceof Error ? error.message : t("common.error")}</p> : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant={showSearchPanel ? "default" : "outline"} onClick={() => setShowSearchPanel((s) => !s)}>
          {showSearchPanel ? t("appointments.hideSearch", "Hide search") : t("appointments.showSearch", "Search appointments")}
        </Button>
        <Button type="button" variant={showBookPanel ? "default" : "outline"} onClick={() => setShowBookPanel((s) => !s)}>
          {showBookPanel ? t("appointments.hideBook", "Hide booking") : t("appointments.showBook", "Book an appointment")}
        </Button>
      </div>

      {showSearchPanel ? (
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
                  { value: "SCHEDULED", label: "SCHEDULED" },
                  { value: "CHECKED_IN", label: "CHECKED_IN" },
                  { value: "COMPLETED", label: "COMPLETED" },
                  { value: "CANCELLED", label: "CANCELLED" },
                  { value: "NO_SHOW", label: "NO_SHOW" },
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

      {showBookPanel ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("appointments.book")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {bookOk ? <p className="text-sm text-emerald-600 sm:col-span-full dark:text-emerald-400">{bookOk}</p> : null}
            {formErr ? <p className="text-sm text-destructive sm:col-span-full">{formErr}</p> : null}
            <div className="space-y-2 sm:col-span-2">
              <Label>{t("appointments.clinic")}</Label>
              <SearchablePickList
                items={clinicItems}
                value={clinicId}
                onValueChange={setClinicId}
                searchPlaceholder={t("appointments.filterClinic", "Type clinic name…")}
                placeholder={t("appointments.pick")}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>{t("appointments.patient")}</Label>
              <p className="text-xs text-muted-foreground">{t("encounters.selectPatientHint", "Search by name or MRN, then choose a row.")}</p>
              <Input
                className="ltr-nums"
                placeholder={t("encounters.patientSearchPlaceholder", "Type name or MRN to filter…")}
                value={bookPatientSearch}
                onChange={(e) => setBookPatientSearch(e.target.value)}
              />
              <div className="max-h-44 overflow-auto rounded-md border border-border">
                {bookPatientsPending ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">{t("common.loading")}</p>
                ) : bookPatients.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">{t("encounters.noPatientsMatch", "No patients match.")}</p>
                ) : (
                  bookPatients.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={cn(
                        "flex w-full flex-col gap-0.5 border-b border-border px-3 py-2 text-start text-sm last:border-b-0 hover:bg-muted/60",
                        patientId === p.id && "bg-muted/80"
                      )}
                      onClick={() => setPatientId(p.id)}
                    >
                      <span className="font-medium">
                        {p.firstNameEn} {p.lastNameEn}
                      </span>
                      <span className="text-xs text-muted-foreground ltr-nums">{p.mrn}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>{t("appointments.clinician")}</Label>
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
              <Label>{t("appointments.starts")}</Label>
              <Input className="ltr-nums" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t("appointments.ends")}</Label>
              <Input className="ltr-nums" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t("appointments.fee", "Appointment fee")}</Label>
              <Input
                className="ltr-nums"
                type="number"
                min="0"
                step="0.01"
                value={aptFee}
                onChange={(e) => setAptFee(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t("appointments.feeHint", "Default comes from admin tenant settings.")}</p>
            </div>
            <div className="flex flex-wrap items-end gap-2 sm:col-span-2">
              <Button
                type="button"
                disabled={!clinicId || !patientId || !clinicianId || !start || !end || createMut.isPending}
                onClick={() => {
                  setFormErr(null);
                  setBookOk(null);
                  createMut.mutate();
                }}
              >
                {t("appointments.create")}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">{t("appointments.list")}</CardTitle>
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
          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/60">
                <tr>
                  <FilterTh label={t("appointments.clinic")} value={afClinic} onChange={setAfClinic} />
                  <SortableTh
                    label={t("appointments.starts")}
                    column="startsAt"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={onSort}
                    filterValue={afStarts}
                    onFilterChange={setAfStarts}
                  />
                  <FilterTh label={t("appointments.patient")} value={afPatient} onChange={setAfPatient} />
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
                {!isPending &&
                  filteredAppointments.map((a) => (
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
                      <td className="max-w-[9rem] truncate px-3 py-2 text-xs text-muted-foreground sm:max-w-[12rem]">
                        {clinicNameById.get(a.clinicId) ?? (
                          <span className="font-mono ltr-nums">{a.clinicId.slice(0, 8)}…</span>
                        )}
                      </td>
                      <td className="px-3 py-2 ltr-nums text-xs">
                        {new Date(a.startsAt).toLocaleString(i18n.language === "ar" ? "ar-AE" : "en-AE")}
                      </td>
                      <td className="max-w-[10rem] truncate px-3 py-2 text-xs sm:max-w-[14rem]">
                        {patientLabel.get(a.patientId) ?? (
                          <span className="font-mono text-muted-foreground ltr-nums">{a.patientId.slice(0, 8)}…</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="secondary">{a.status}</Badge>
                      </td>
                    </tr>
                  ))}
                {!isPending && rows.length > 0 && filteredAppointments.length === 0 ? (
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
