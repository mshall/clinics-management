import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { CreateActionButton } from "@/components/create-action-button";
import { AppointmentCreateWizard } from "@/features/appointments/appointment-create-wizard";
import { AppointmentDeleteConfirmDialog, type AppointmentDeleteTarget } from "@/features/appointments/appointment-delete-confirm-dialog";
import { AppointmentsCalendarPanel } from "@/features/appointments/appointments-calendar-panel";
import { SearchablePickList } from "@/components/searchable-pick-list";
import { FilterTh, SortableTh } from "@/components/sortable-th";
import { type SortOrder } from "@/components/sort-utils";
import { toggleSort } from "@/components/sort-utils";
import { ResponsiveTable } from "@/components/responsive-table";
import { TablePagination } from "@/components/table-pagination";
import { AppointmentStatusBadge } from "@/components/appointment-status-badge";
import { appointmentStatusLabel } from "@/components/appointment-status";
import { PageHeader } from "@/brand/ui-kit";
import { TableSkeleton } from "@/components/skeleton";
import { NoShowRiskChip } from "@/components/no-show-risk-chip";
import { DepositBadge } from "@/components/deposit-badge";
import { AppointmentSourceBadges } from "@/components/appointment-source-badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppointmentsQuery, useClinicsQuery, usePatientsQuery } from "@/lib/api-hooks";
import { canDeleteAppointment } from "@/lib/appointment-delete-policy";
import { ApiError, apiDelete } from "@/lib/http";
import { resolvePatientListLabel } from "@/lib/patient-display";
import { formatClinicName, formatClinicNameFields, localeForLanguage } from "@/lib/locale-display";
import { columnFilterIncludes } from "@/lib/utils";
import { canMutateAppointmentsNav } from "@/lib/nav-tab-access-policy";
import { useAuthStore } from "@/stores/auth-store";
import { filterFieldClassName, filterToolbarClassName, nativeSelectClassName } from "@/lib/form-control-styles";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function AppointmentsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeView = searchParams.get("view") === "calendar" ? "calendar" : "list";
  const setActiveView = (view: "list" | "calendar") => {
    if (view === "calendar") setSearchParams({ view: "calendar" }, { replace: true });
    else setSearchParams({}, { replace: true });
  };
  const qc = useQueryClient();
  const authUser = useAuthStore((s) => s.user);
  const canBookAppointments = canMutateAppointmentsNav(
    authUser?.role,
    authUser?.navTabKeys,
    authUser?.navTabAccessModes,
  );
  const isPhysician = authUser?.role === "physician";
  const canDelete = canDeleteAppointment(authUser?.role);
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
  // Quick-book from the calendar time grid: /appointments?book=1&start=… opens the wizard.
  useEffect(() => {
    if (searchParams.get("book") !== "1" || !canBookAppointments) return;
    setShowBookPanel(true);
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, canBookAppointments]);
  // Power-user shortcut: N opens/closes the booking wizard (desktop, when no field has focus).
  useEffect(() => {
    if (isPhysician || !canBookAppointments) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.key.toLowerCase() !== "n" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.closest("[role=dialog]"))) return;
      e.preventDefault();
      setShowBookPanel((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isPhysician, canBookAppointments]);
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

  const clinicItems = useMemo(
    () => clinics.map((c) => ({ value: c.id, label: formatClinicName(c, i18n.language) })),
    [clinics, i18n.language],
  );

  const [appointmentToDelete, setAppointmentToDelete] = useState<AppointmentDeleteTarget | null>(null);

  const deleteMut = useMutation({
    mutationFn: (appointmentId: string) => apiDelete(`/api/v1/appointments/${appointmentId}`),
    onSuccess: () => {
      setAppointmentToDelete(null);
      void qc.invalidateQueries({ queryKey: ["appointments"] });
      void qc.invalidateQueries({ queryKey: ["dashboard", "kpis"] });
      toast.success(t("appointments.deleteSuccess", "Appointment deleted."));
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

  const listColSpan = canDelete ? 5 : 4;

  return (
    <div className="space-y-6">
      <PageHeader
        title={isPhysician ? t("appointments.myTitle", "My appointments") : t("appointments.title")}
        description={
          isPhysician
            ? t("appointments.subtitlePhysician", "Appointments where you are the assigned doctor. Use the date range to focus on upcoming visits.")
            : t("appointments.subtitle")
        }
      />

      {isError ? <p className="text-sm text-destructive">{error instanceof Error ? error.message : t("common.error")}</p> : null}

      <Tabs value={activeView} onValueChange={(v) => setActiveView(v as "list" | "calendar")} className="space-y-4">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="list">{t("appointments.listTab", "List")}</TabsTrigger>
          <TabsTrigger value="calendar">{t("appointments.calendarTab", "Calendar")}</TabsTrigger>
        </TabsList>

        <TabsContent value="calendar" className="mt-0">
          <AppointmentsCalendarPanel />
        </TabsContent>

        <TabsContent value="list" className="mt-0 space-y-6">
      {isPhysician ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("appointments.dateRange", "Date range")}</CardTitle>
          </CardHeader>
          <CardContent className={filterToolbarClassName}>
            <div className={filterFieldClassName}>
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
            <div className={filterFieldClassName}>
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
            <div className={filterFieldClassName}>
              <Label htmlFor="phys-apt-status">{t("appointments.status")}</Label>
              <select
                id="phys-apt-status"
                className={nativeSelectClassName}
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
          {canBookAppointments ? (
          <CreateActionButton type="button" onClick={() => setShowBookPanel(true)}>
            {t("appointments.showBook", "Book an appointment")}
          </CreateActionButton>
          ) : null}
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

      {canBookAppointments ? (
        <AppointmentCreateWizard open={showBookPanel} onOpenChange={setShowBookPanel} />
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
                    <td colSpan={listColSpan} className="p-0">
                      <TableSkeleton rows={7} cols={4} />
                    </td>
                  </tr>
                ) : null}
                {!isPending && rows.length === 0 ? (
                  <tr>
                    <td colSpan={listColSpan} className="px-3 py-8 text-center text-muted-foreground">
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
                      className="cursor-pointer border-t border-border/70 transition-colors hover:bg-accent/40 focus-visible:bg-accent/40"
                      onClick={() => navigate(`/appointments/${a.id}`)}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter" || ev.key === " ") {
                          ev.preventDefault();
                          navigate(`/appointments/${a.id}`);
                        }
                      }}
                    >
                      <td className="max-w-40 px-3 py-2 sm:max-w-[16rem]">
                        {(() => {
                          const r = resolvePatientListLabel({
                            patientId: a.patientId,
                            patientMrn: a.patientMrn,
                            patientName: a.patientName,
                            registryLabel: patientLabel.get(a.patientId),
                          });
                          if (r.isIdFallback) return <span className="font-mono text-muted-foreground ltr-nums">{r.text}</span>;
                          const [mrn, ...nameParts] = r.text.split(" — ");
                          return nameParts.length ? (
                            <>
                              <span className="sr-only">{r.text}</span>
                              <span aria-hidden className="block truncate text-sm font-medium">{nameParts.join(" — ")}</span>
                              <span aria-hidden className="block text-xs text-muted-foreground ltr-nums">{mrn}</span>
                            </>
                          ) : (
                            r.text
                          );
                        })()}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-sm">
                        <div className="font-medium ltr-nums">{new Intl.DateTimeFormat(localeForLanguage(i18n.language), { dateStyle: "medium" }).format(new Date(a.startsAt))}</div>
                        <div className="text-xs text-muted-foreground ltr-nums">{new Intl.DateTimeFormat(localeForLanguage(i18n.language), { timeStyle: "short" }).format(new Date(a.startsAt))}</div>
                      </td>
                      <td className="px-3 py-2">
                        <Badge
                          variant="outline"
                          className="max-w-56 truncate border-primary/35 bg-primary/5 font-normal text-foreground"
                          title={clinicLabel ?? undefined}
                        >
                          {clinicLabel ?? (
                            <span className="font-mono ltr-nums text-muted-foreground">{a.clinicId.slice(0, 8)}…</span>
                          )}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <AppointmentStatusBadge status={a.status} />
                          <NoShowRiskChip risk={a.noShowRisk} />
                          <DepositBadge deposit={a.deposit} />
                          <AppointmentSourceBadges
                            bookingSource={a.bookingSource}
                            isNewPatientAtBooking={a.isNewPatientAtBooking}
                          />
                        </div>
                      </td>
                      {canDelete ? (
                        <td className="px-3 py-2 text-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            aria-label={t("appointments.delete", "Delete")}
                            disabled={deleteMut.isPending}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setAppointmentToDelete({
                                id: a.id,
                                patientName: a.patientName,
                                patientMrn: a.patientMrn,
                                startsAt: a.startsAt,
                                endsAt: a.endsAt,
                                clinicianName: a.clinicianName,
                                status: a.status,
                                clinicId: a.clinicId,
                                clinicNameEn: a.clinicNameEn,
                                clinicNameAr: a.clinicNameAr,
                                clinicLabel,
                              });
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      ) : null}
                    </tr>
                    );
                  })}
                {!isPending && rows.length > 0 && filteredAppointments.length === 0 ? (
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
        </TabsContent>
      </Tabs>

      <AppointmentDeleteConfirmDialog
        open={appointmentToDelete != null}
        onOpenChange={(open) => {
          if (!open && !deleteMut.isPending) setAppointmentToDelete(null);
        }}
        appointment={appointmentToDelete}
        pending={deleteMut.isPending}
        onConfirm={() => {
          if (appointmentToDelete) deleteMut.mutate(appointmentToDelete.id);
        }}
      />
    </div>
  );
}
