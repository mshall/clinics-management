import { ChevronLeft, ChevronRight } from "lucide-react";
import { AppointmentTimeGrid } from "./appointments-time-grid";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  AppointmentStatusBadge,
  appointmentCalendarEventChipClassName,
  statusDotClass,
} from "@/components/appointment-status-badge";
import { NoShowRiskChip } from "@/components/no-show-risk-chip";
import { Button } from "@/components/ui/button";
import { TableSkeleton } from "@/components/skeleton";
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
  appointmentIntervalsOverlap,
  effectiveAppointmentEnd,
  formatAppointmentTimeRange,
} from "@/lib/appointment-scheduling";
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
import { canMutateAppointmentsNav } from "@/lib/nav-tab-access-policy";

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

function appointmentsOverlap(a: AppointmentDto, b: AppointmentDto): boolean {
  if (a.clinicianId !== b.clinicianId) return false;
  const aStart = new Date(a.startsAt);
  const aEnd = effectiveAppointmentEnd(a);
  const bStart = new Date(b.startsAt);
  const bEnd = effectiveAppointmentEnd(b);
  return appointmentIntervalsOverlap(aStart, aEnd, bStart, bEnd);
}

function countOverlappingOthers(apt: AppointmentDto, all: AppointmentDto[]): number {
  return all.filter((o) => o.id !== apt.id && appointmentsOverlap(apt, o)).length;
}

function calendarEventTitle(
  a: AppointmentDto,
  loc: string,
  mode: "physician" | "clinic" | "organization",
  language: string,
  overlapCount = 0,
): string {
  const patient = resolvePatientListLabel({
    patientId: a.patientId,
    patientMrn: a.patientMrn,
    patientName: a.patientName,
  });
  const time = formatAppointmentTimeRange(a.startsAt, a.endsAt, loc);
  const clinic = formatClinicNameFields(a.clinicNameEn, a.clinicNameAr, language);
  const overlapSuffix = overlapCount > 0 ? ` · +${overlapCount}` : "";
  if (mode === "clinic" && a.clinicianName) {
    return `${time} · ${patient.text} · ${a.clinicianName}${overlapSuffix}`;
  }
  if (mode === "organization") {
    const who = a.clinicianName ? ` · ${a.clinicianName}` : "";
    return `${time} · ${patient.text} · ${clinic}${who}${overlapSuffix}`;
  }
  if (mode === "physician") {
    return `${time} · ${patient.text}${overlapSuffix}`;
  }
  return `${time} · ${patient.text}${overlapSuffix}`;
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
  const [view, setView] = useState<"month" | "week" | "day">(() => { try { const v = localStorage.getItem("cms-cal-view"); return v === "week" || v === "day" ? v : "month"; } catch { return "month"; } });
  useEffect(() => { try { localStorage.setItem("cms-cal-view", view); } catch { /* ignore */ } }, [view]);

  useEffect(() => {
    if (!requiresClinicSelection || clinicId || clinics.length === 0) return;
    setClinicId(clinics[0]!.id);
  }, [requiresClinicSelection, clinicId, clinics]);

  const range = useMemo(() => visibleGridBounds(cursor.year, cursor.month), [cursor.year, cursor.month]);
  const canQuickBook = mode !== "physician" && canMutateAppointmentsNav(role, authUser?.navTabKeys, authUser?.navTabAccessModes);
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
  // Week/day navigation keeps the fetched month in sync with the visible date (the month grid covers whole weeks).
  const shiftDays = (delta: number) => {
    const d = parseLocalDateIso(selectedDayIso);
    d.setDate(d.getDate() + delta);
    setSelectedDayIso(toLocalDateIso(d));
    setCursor({ year: d.getFullYear(), month: d.getMonth() });
  };
  const shift = (dir: 1 | -1) => (view === "month" ? shiftMonth(dir) : shiftDays(dir * (view === "week" ? 7 : 1)));
  const weekDays = useMemo(() => {
    const d = parseLocalDateIso(selectedDayIso);
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => { const x = new Date(monday); x.setDate(monday.getDate() + i); return x; });
  }, [selectedDayIso]);
  const gridDays = view === "week" ? weekDays : [selectedDay];
  const periodLabel = view === "month"
    ? monthLabel
    : view === "day"
      ? selectedDay.toLocaleDateString(loc, { weekday: "long", day: "numeric", month: "long" })
      : `${weekDays[0]!.toLocaleDateString(loc, { day: "numeric", month: "short" })} – ${weekDays[6]!.toLocaleDateString(loc, { day: "numeric", month: "short" })}`;

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
        <CardHeader className="space-y-0 border-b border-border/60 bg-card pb-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-1">
              <Button type="button" variant="ghost" size="icon" className="size-9 min-h-9 min-w-9 rounded-full md:size-9 md:min-h-9" onClick={() => shift(-1)}>
                <ChevronLeft className="h-5 w-5 rtl-flip" aria-hidden />
                <span className="sr-only">{t("appointments.calendarPrev", "Previous month")}</span>
              </Button>
              <p className="min-w-38 text-center text-lg font-semibold tracking-tight sm:text-xl" aria-live="polite">
                {periodLabel} <span className="font-medium text-muted-foreground ltr-nums">{yearLabel}</span>
              </p>
              <Button type="button" variant="ghost" size="icon" className="size-9 min-h-9 min-w-9 rounded-full md:size-9 md:min-h-9" onClick={() => shift(1)}>
                <ChevronRight className="h-5 w-5 rtl-flip" aria-hidden />
                <span className="sr-only">{t("appointments.calendarNext", "Next month")}</span>
              </Button>
            </div>
            {showClinicFilter ? (
              <div className="flex min-w-0 items-center gap-2">
                <Label htmlFor="calendar-clinic" className="text-xs text-muted-foreground">{t("appointments.clinic")}</Label>
                <select
                  id="calendar-clinic"
                  className={cn(nativeSelectClassName, "h-9 min-h-9 w-auto max-w-[16rem] py-1 md:h-9")}
                  value={clinicId}
                  onChange={(e) => setClinicId(e.target.value)}
                >
                  {mode === "organization" ? <option value="">{t("appointments.allClinics", "All clinics")}</option> : null}
                  {clinics.length === 0 ? (
                    <option value="">{t("appointments.noClinics", "No clinics")}</option>
                  ) : (
                    clinics.map((c) => (
                      <option key={c.id} value={c.id}>{formatClinicName(c, i18n.language)}</option>
                    ))
                  )}
                </select>
              </div>
            ) : null}
            <div className="ms-auto flex items-center gap-2">
              <div role="group" aria-label={t("kx2.calendarView", "Calendar view")} className="inline-flex rounded-lg border border-border bg-card p-0.5 text-xs shadow-kx-1">
                {(["month", "week", "day"] as const).map((v) => (
                  <button key={v} type="button" aria-pressed={view === v} data-testid={`calendar-view-${v}`} onClick={() => setView(v)} className={cn("rounded-md px-2.5 py-1.5 font-medium transition-colors", view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                    {t(`kx2.view.${v}`, v === "month" ? "Month" : v === "week" ? "Week" : "Day")}
                  </button>
                ))}
              </div>
              <Button type="button" variant="outline" size="sm" onClick={goToToday}>
                {t("appointments.today", "Today")}
              </Button>
            </div>
          </div>
          <CardTitle className="sr-only">
            {mode === "physician"
              ? t("appointments.calendarMyTitle", "My calendar")
              : mode === "organization"
                ? t("appointments.calendarOrgTitle", "Organization calendar")
                : t("appointments.calendarClinicTitle", "Clinic calendar")}
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-0 p-0">
          {!calendarEnabled ? (
            <p className="p-4 text-sm text-muted-foreground">
              {t("appointments.calendarPickClinic", "Select a clinic to load the calendar.")}
            </p>
          ) : isPending ? (
            <div className="p-4"><TableSkeleton rows={8} cols={7} /></div>
          ) : view !== "month" ? (
            <AppointmentTimeGrid
              days={gridDays}
              appointments={items}
              locale={loc}
              language={i18n.language}
              showClinic={mode === "organization"}
              onOpen={openAppointment}
              canBook={canQuickBook}
              onQuickBook={(startIso) => navigate(`/appointments?book=1&start=${encodeURIComponent(startIso)}`)}
            />
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
                        "group relative flex min-h-21 flex-col border-b border-r border-border/60 p-1 touch-manipulation sm:min-h-25 lg:min-h-30 lg:p-1.5",
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
                            isToday && "bg-primary font-semibold text-primary-foreground shadow-xs",
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
                          {visibleMobile.map((a) => {
                            const overlaps = countOverlappingOthers(a, dayAppointmentsCell);
                            return (
                            <button
                              key={a.id}
                              type="button"
                              title={calendarEventTitle(a, loc, mode, i18n.language, overlaps)}
                              className={cn(
                                "w-full truncate rounded-[4px] px-1 py-0.5 text-start text-[10px] font-medium leading-tight sm:text-[11px]",
                                appointmentCalendarEventChipClassName(a.status),
                                overlaps > 0 && "ring-1 ring-inset ring-[hsl(var(--warning)/0.5)]",
                              )}
                              onClick={(e) => {
                                e.stopPropagation();
                                openAppointment(a.id);
                              }}
                            >
                              {calendarEventTitle(a, loc, mode, i18n.language, overlaps)}
                            </button>
                          );})}
                          {overflowMobile > 0 ? (
                            <span className="px-0.5 text-[10px] font-medium text-muted-foreground ltr-nums">
                              {t("appointments.calendarMoreEvents", "+{{count}} more", { count: overflowMobile })}
                            </span>
                          ) : null}
                        </div>

                        <div className="hidden min-h-0 flex-1 flex-col gap-0.5 overflow-hidden lg:flex">
                          {visibleLg.map((a) => {
                            const overlaps = countOverlappingOthers(a, dayAppointmentsCell);
                            return (
                            <button
                              key={a.id}
                              type="button"
                              title={calendarEventTitle(a, loc, mode, i18n.language, overlaps)}
                              className={cn(
                                "w-full truncate rounded-[4px] px-1.5 py-0.5 text-start text-[11px] font-medium leading-tight",
                                appointmentCalendarEventChipClassName(a.status),
                                overlaps > 0 && "ring-1 ring-inset ring-[hsl(var(--warning)/0.5)]",
                              )}
                              onClick={(e) => {
                                e.stopPropagation();
                                openAppointment(a.id);
                              }}
                            >
                              {calendarEventTitle(a, loc, mode, i18n.language, overlaps)}
                            </button>
                          );})}
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
                      const overlapCount = countOverlappingOthers(a, dayAppointments);
                      return (
                        <li key={a.id}>
                          <button
                            type="button"
                            className={cn(
                              "flex w-full gap-3 rounded-xl border border-border/80 bg-card p-3 text-start touch-manipulation transition-colors hover:bg-muted/40 active:bg-muted/60 sm:items-center sm:p-4",
                              overlapCount > 0 && "border-[hsl(var(--warning)/0.4)] bg-amber-500/5",
                            )}
                            onClick={() => openAppointment(a.id)}
                          >
                            <span
                              className={cn(
                                "mt-1 w-1 shrink-0 self-stretch rounded-full sm:mt-0 sm:h-12",
                                statusDotClass(a.status),
                              )}
                              aria-hidden
                            />
                            <div className="min-w-0 flex-1 space-y-1">
                              <p className="text-sm font-semibold ltr-nums sm:text-base">
                                {formatAppointmentTimeRange(a.startsAt, a.endsAt, loc)}
                              </p>
                              {overlapCount > 0 ? (
                                <p className="text-xs font-medium text-[hsl(var(--warning))] ">
                                  {t(
                                    "appointments.calendarSharedSlot",
                                    "Shared time slot with {{count}} other patient(s)",
                                    { count: overlapCount },
                                  )}
                                </p>
                              ) : null}
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
                            <div className="flex shrink-0 flex-col items-end gap-1">
                              <AppointmentStatusBadge status={a.status} className="hidden sm:inline-flex" />
                              <NoShowRiskChip risk={a.noShowRisk} interactive={false} />
                            </div>
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
