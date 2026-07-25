import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  AppointmentStatusBadge,
  appointmentCalendarEventChipClassName,
} from "@/components/appointment-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useAppointmentsQuery, useClinicsQuery } from "@/lib/api-hooks";
import type { AppointmentDto } from "@/lib/api-types";
import {
  appointmentCalendarMode,
  appointmentCalendarRequiresClinicSelection,
  appointmentCalendarShowsClinicFilter,
} from "@/lib/appointment-calendar-policy";
import {
  buildMonthGrid,
  isSameLocalDateIso,
  parseLocalDateIso,
  sameLocalDay,
  toLocalDateIso,
  visibleGridBounds,
  WEEKDAY_KEYS,
} from "@/lib/appointment-calendar-utils";
import { formatClinicName, formatClinicNameFields, localeForLanguage } from "@/lib/locale-display";
import { resolvePatientListLabel } from "@/lib/patient-display";
import { nativeSelectClassName } from "@/lib/form-control-styles";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";

const MAX_EVENTS_IN_CELL = 2;
const MAX_EVENTS_IN_CELL_LG = 3;

function appointmentsForDay(items: AppointmentDto[], day: Date): AppointmentDto[] {
  const key = toLocalDateIso(day);
  return items
    .filter((a) => toLocalDateIso(new Date(a.startsAt)) === key)
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
}

function groupAppointmentsByDay(items: AppointmentDto[]): Map<string, AppointmentDto[]> {
  const map = new Map<string, AppointmentDto[]>();
  for (const a of items) {
    const key = toLocalDateIso(new Date(a.startsAt));
    const list = map.get(key) ?? [];
    list.push(a);
    map.set(key, list);
  }
  for (const [key, list] of map) {
    list.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
    map.set(key, list);
  }
  return map;
}

function calendarEventTitle(
  a: AppointmentDto,
  loc: string,
  mode: "physician" | "clinic" | "organization",
  language: string,
): string {
  const patient = resolvePatientListLabel({
    patientId: a.patientId,
    patientMrn: a.patientMrn,
    patientName: a.patientName,
  });
  const time = new Date(a.startsAt).toLocaleTimeString(loc, { hour: "numeric", minute: "2-digit" });
  const clinic = formatClinicNameFields(a.clinicNameEn, a.clinicNameAr, language);
  if (mode === "clinic" && a.clinicianName) {
    return `${time} · ${patient.text} · ${a.clinicianName}`;
  }
  if (mode === "organization") {
    const who = a.clinicianName ? ` · ${a.clinicianName}` : "";
    return `${time} · ${patient.text} · ${clinic}${who}`;
  }
  if (mode === "physician") {
    return `${time} · ${patient.text}`;
  }
  return `${time} · ${patient.text}`;
}

export function AppointmentsCalendarPanel() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const authUser = useAuthStore((s) => s.user);
  const role = authUser?.role;
  const mode = appointmentCalendarMode(role);
  const showClinicFilter = appointmentCalendarShowsClinicFilter(role);
  const requiresClinicSelection = appointmentCalendarRequiresClinicSelection(role);
  const loc = localeForLanguage(i18n.language);

  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(() => ({ year: today.getFullYear(), month: today.getMonth() }));
  const [selectedDayIso, setSelectedDayIso] = useState(() => toLocalDateIso(today));
  const { data: clinics = [] } = useClinicsQuery();
  const [clinicId, setClinicId] = useState("");

  useEffect(() => {
    if (!requiresClinicSelection || clinicId || clinics.length === 0) return;
    setClinicId(clinics[0]!.id);
  }, [requiresClinicSelection, clinicId, clinics]);

  const range = useMemo(() => visibleGridBounds(cursor.year, cursor.month), [cursor.year, cursor.month]);
  const calendarEnabled = mode === "physician" || mode === "organization" || Boolean(clinicId);

  const { data, isPending, isError, error } = useAppointmentsQuery({
    page: 1,
    pageSize: 500,
    sortBy: "startsAt",
    sortOrder: "asc",
    from: range.from,
    to: range.to,
    clinicId: showClinicFilter ? clinicId || undefined : undefined,
    enabled: calendarEnabled,
  });

  const items = data?.items ?? [];
  const grid = useMemo(() => buildMonthGrid(cursor.year, cursor.month), [cursor.year, cursor.month]);
  const appointmentsByDay = useMemo(() => groupAppointmentsByDay(items), [items]);
  const selectedDay = parseLocalDateIso(selectedDayIso);
  const dayAppointments = useMemo(() => appointmentsForDay(items, selectedDay), [items, selectedDay]);

  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleDateString(loc, {
    month: "long",
  });
  const yearLabel = String(cursor.year);

  const shiftMonth = (delta: number) => {
    setCursor((prev) => {
      const d = new Date(prev.year, prev.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  const goToToday = () => {
    const now = new Date();
    setCursor({ year: now.getFullYear(), month: now.getMonth() });
    setSelectedDayIso(toLocalDateIso(now));
  };

  const openAppointment = (id: string) => {
    navigate(`/appointments/${id}`);
  };

  return (
    <div className="space-y-4">
      {isError ? (
        <p className="text-sm text-destructive">{error instanceof Error ? error.message : t("common.error")}</p>
      ) : null}

      <Card className="overflow-hidden">
        <CardHeader className="space-y-4 border-b border-border/60 bg-muted/20 pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <CardTitle className="text-base font-medium text-muted-foreground">
              {mode === "physician"
                ? t("appointments.calendarMyTitle", "My calendar")
                : mode === "organization"
                  ? t("appointments.calendarOrgTitle", "Organization calendar")
                  : t("appointments.calendarClinicTitle", "Clinic calendar")}
            </CardTitle>
            <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-primary" onClick={goToToday}>
              {t("appointments.today", "Today")}
            </Button>
          </div>

          <div className="flex items-center justify-center gap-2 sm:gap-4">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 rounded-full"
              onClick={() => shiftMonth(-1)}
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
              <span className="sr-only">{t("appointments.calendarPrev", "Previous month")}</span>
            </Button>
            <div className="min-w-0 flex-1 text-center">
              <p className="truncate text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{monthLabel}</p>
              <p className="text-sm font-medium text-muted-foreground ltr-nums sm:text-base">{yearLabel}</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 rounded-full"
              onClick={() => shiftMonth(1)}
            >
              <ChevronRight className="h-5 w-5" aria-hidden />
              <span className="sr-only">{t("appointments.calendarNext", "Next month")}</span>
            </Button>
          </div>

          {showClinicFilter ? (
            <div className="space-y-1.5">
              <Label htmlFor="calendar-clinic">{t("appointments.clinic")}</Label>
              <select
                id="calendar-clinic"
                className={cn(nativeSelectClassName, "max-w-full sm:max-w-md")}
                value={clinicId}
                onChange={(e) => setClinicId(e.target.value)}
              >
                {mode === "organization" ? (
                  <option value="">{t("appointments.allClinics", "All clinics")}</option>
                ) : null}
                {clinics.length === 0 ? (
                  <option value="">{t("appointments.noClinics", "No clinics")}</option>
                ) : (
                  clinics.map((c) => (
                    <option key={c.id} value={c.id}>
                      {formatClinicName(c, i18n.language)}
                    </option>
                  ))
                )}
              </select>
              <p className="text-xs text-muted-foreground">
                {mode === "organization"
                  ? t(
                      "appointments.calendarOrgHint",
                      "All organization appointments for this month. Filter by clinic if needed.",
                    )
                  : t("appointments.calendarClinicHint", "All appointments at the selected clinic for this month.")}
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {t("appointments.calendarPhysicianHint", "Appointments assigned to you across your clinic network.")}
            </p>
          )}
        </CardHeader>

        <CardContent className="space-y-0 p-0">
          {!calendarEnabled ? (
            <p className="p-4 text-sm text-muted-foreground">
              {t("appointments.calendarPickClinic", "Select a clinic to load the calendar.")}
            </p>
          ) : isPending ? (
            <p className="p-4 text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : (
            <>
              <div className="border-b border-border bg-muted/30">
                <div className="grid grid-cols-7">
                  {WEEKDAY_KEYS.map((key) => (
                    <div
                      key={key}
                      className="border-r border-border/60 px-1 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground last:border-r-0 sm:text-xs"
                    >
                      {t(`appointments.weekday.${key}`, key)}
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-7 bg-background">
                {grid.map((cell, idx) => {
                  const dayAppointmentsCell = appointmentsByDay.get(cell.iso) ?? [];
                  const isSelected = isSameLocalDateIso(selectedDayIso, cell.date);
                  const isToday = sameLocalDay(cell.date, today);
                  const visibleMobile = dayAppointmentsCell.slice(0, MAX_EVENTS_IN_CELL);
                  const visibleLg = dayAppointmentsCell.slice(0, MAX_EVENTS_IN_CELL_LG);
                  const overflowMobile = Math.max(0, dayAppointmentsCell.length - MAX_EVENTS_IN_CELL);
                  const overflowLg = Math.max(0, dayAppointmentsCell.length - MAX_EVENTS_IN_CELL_LG);

                  return (
                    <div
                      key={`${cell.iso}-${idx}`}
                      role="button"
                      tabIndex={0}
                      className={cn(
                        "group relative flex min-h-[5.25rem] flex-col border-b border-r border-border/60 p-1 touch-manipulation sm:min-h-[6.25rem] lg:min-h-[7.5rem] lg:p-1.5",
                        idx % 7 === 6 && "border-r-0",
                        !cell.inCurrentMonth && "bg-muted/15",
                        isSelected && "bg-primary/10 ring-1 ring-inset ring-primary/25",
                        !isSelected && "hover:bg-muted/35 active:bg-muted/50",
                      )}
                      onClick={() => setSelectedDayIso(cell.iso)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedDayIso(cell.iso);
                        }
                      }}
                    >
                      <div className="mb-0.5 flex items-start justify-end px-0.5 sm:justify-start">
                        <span
                          className={cn(
                            "inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-medium ltr-nums sm:h-7 sm:min-w-7 sm:text-sm",
                            isToday && "bg-red-500 font-semibold text-white shadow-sm",
                            !isToday && isSelected && "font-semibold text-primary",
                            !isToday && !isSelected && cell.inCurrentMonth && "text-foreground",
                            !cell.inCurrentMonth && "text-muted-foreground/45",
                          )}
                        >
                          {cell.date.getDate()}
                        </span>
                      </div>

                      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
                        <div className="flex flex-col gap-0.5 lg:hidden">
                          {visibleMobile.map((a) => (
                            <button
                              key={a.id}
                              type="button"
                              title={calendarEventTitle(a, loc, mode, i18n.language)}
                              className={cn(
                                "w-full truncate rounded-[4px] px-1 py-0.5 text-start text-[10px] font-medium leading-tight sm:text-[11px]",
                                appointmentCalendarEventChipClassName(a.status),
                              )}
                              onClick={(e) => {
                                e.stopPropagation();
                                openAppointment(a.id);
                              }}
                            >
                              {calendarEventTitle(a, loc, mode, i18n.language)}
                            </button>
                          ))}
                          {overflowMobile > 0 ? (
                            <span className="px-0.5 text-[10px] font-medium text-muted-foreground ltr-nums">
                              {t("appointments.calendarMoreEvents", "+{{count}} more", { count: overflowMobile })}
                            </span>
                          ) : null}
                        </div>

                        <div className="hidden min-h-0 flex-1 flex-col gap-0.5 overflow-hidden lg:flex">
                          {visibleLg.map((a) => (
                            <button
                              key={a.id}
                              type="button"
                              title={calendarEventTitle(a, loc, mode, i18n.language)}
                              className={cn(
                                "w-full truncate rounded-[4px] px-1.5 py-0.5 text-start text-[11px] font-medium leading-tight",
                                appointmentCalendarEventChipClassName(a.status),
                              )}
                              onClick={(e) => {
                                e.stopPropagation();
                                openAppointment(a.id);
                              }}
                            >
                              {calendarEventTitle(a, loc, mode, i18n.language)}
                            </button>
                          ))}
                          {overflowLg > 0 ? (
                            <span className="px-1 text-[11px] font-medium text-muted-foreground ltr-nums">
                              {t("appointments.calendarMoreEvents", "+{{count}} more", { count: overflowLg })}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="border-t border-border bg-muted/10 px-4 py-4 sm:px-5">
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("appointments.calendarDayAgenda", "Day agenda")}
                </h3>
                <p className="mb-4 text-base font-semibold sm:text-lg">
                  {selectedDay.toLocaleDateString(loc, {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
                {dayAppointments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("appointments.calendarDayEmpty", "No appointments this day.")}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {dayAppointments.map((a) => {
                      const patient = resolvePatientListLabel({
                        patientId: a.patientId,
                        patientMrn: a.patientMrn,
                        patientName: a.patientName,
                      });
                      const start = new Date(a.startsAt);
                      const end = new Date(a.endsAt);
                      return (
                        <li key={a.id}>
                          <button
                            type="button"
                            className="flex w-full gap-3 rounded-xl border border-border/80 bg-card p-3 text-start touch-manipulation transition-colors hover:bg-muted/40 active:bg-muted/60 sm:items-center sm:p-4"
                            onClick={() => openAppointment(a.id)}
                          >
                            <span
                              className={cn(
                                "mt-1 w-1 shrink-0 self-stretch rounded-full sm:mt-0 sm:h-12",
                                appointmentCalendarEventChipClassName(a.status),
                              )}
                              aria-hidden
                            />
                            <div className="min-w-0 flex-1 space-y-1">
                              <p className="text-sm font-semibold ltr-nums sm:text-base">
                                {start.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" })}
                                {" – "}
                                {end.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" })}
                              </p>
                              <p className="truncate text-sm font-medium">{patient.text}</p>
                              {mode === "clinic" && a.clinicianName ? (
                                <p className="truncate text-xs text-muted-foreground">{a.clinicianName}</p>
                              ) : null}
                              {mode === "organization" ? (
                                <>
                                  <p className="truncate text-xs text-muted-foreground">
                                    {formatClinicNameFields(a.clinicNameEn, a.clinicNameAr, i18n.language)}
                                  </p>
                                  {a.clinicianName ? (
                                    <p className="truncate text-xs text-muted-foreground">{a.clinicianName}</p>
                                  ) : null}
                                </>
                              ) : null}
                              {mode === "physician" ? (
                                <p className="truncate text-xs text-muted-foreground">
                                  {formatClinicNameFields(a.clinicNameEn, a.clinicNameAr, i18n.language)}
                                </p>
                              ) : null}
                            </div>
                            <AppointmentStatusBadge status={a.status} className="hidden shrink-0 sm:inline-flex" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
