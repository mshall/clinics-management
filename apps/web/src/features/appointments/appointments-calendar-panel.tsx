import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { AppointmentStatusBadge } from "@/components/appointment-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useAppointmentsQuery, useClinicsQuery } from "@/lib/api-hooks";
import type { AppointmentDto } from "@/lib/api-types";
import {
  appointmentCalendarMode,
  appointmentCalendarShowsClinicFilter,
} from "@/lib/appointment-calendar-policy";
import {
  buildMonthGrid,
  isSameLocalDateIso,
  monthBounds,
  parseLocalDateIso,
  sameLocalDay,
  toLocalDateIso,
  WEEKDAY_KEYS,
} from "@/lib/appointment-calendar-utils";
import { formatClinicName, formatClinicNameFields, localeForLanguage } from "@/lib/locale-display";
import { resolvePatientListLabel } from "@/lib/patient-display";
import { nativeSelectClassName } from "@/lib/form-control-styles";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";

function appointmentsForDay(items: AppointmentDto[], day: Date): AppointmentDto[] {
  const key = toLocalDateIso(day);
  return items
    .filter((a) => toLocalDateIso(new Date(a.startsAt)) === key)
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
}

export function AppointmentsCalendarPanel() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const authUser = useAuthStore((s) => s.user);
  const role = authUser?.role;
  const mode = appointmentCalendarMode(role);
  const showClinicFilter = appointmentCalendarShowsClinicFilter(role);
  const loc = localeForLanguage(i18n.language);

  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(() => ({ year: today.getFullYear(), month: today.getMonth() }));
  const [selectedDayIso, setSelectedDayIso] = useState(() => toLocalDateIso(today));
  const { data: clinics = [] } = useClinicsQuery();
  const [clinicId, setClinicId] = useState("");

  useEffect(() => {
    if (!showClinicFilter || clinicId || clinics.length === 0) return;
    setClinicId(clinics[0]!.id);
  }, [showClinicFilter, clinicId, clinics]);

  const range = useMemo(() => monthBounds(cursor.year, cursor.month), [cursor.year, cursor.month]);
  const calendarEnabled = mode === "physician" || Boolean(clinicId);

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
  const selectedDay = parseLocalDateIso(selectedDayIso);
  const dayAppointments = useMemo(() => appointmentsForDay(items, selectedDay), [items, selectedDay]);
  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleDateString(loc, {
    month: "long",
    year: "numeric",
  });

  const countByDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of items) {
      const k = toLocalDateIso(new Date(a.startsAt));
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [items]);

  const shiftMonth = (delta: number) => {
    setCursor((prev) => {
      const d = new Date(prev.year, prev.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  const openAppointment = (id: string) => {
    navigate(`/appointments/${id}`);
  };

  return (
    <div className="space-y-4">
      {isError ? (
        <p className="text-sm text-destructive">{error instanceof Error ? error.message : t("common.error")}</p>
      ) : null}

      <Card>
        <CardHeader className="space-y-3 pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">
              {mode === "physician"
                ? t("appointments.calendarMyTitle", "My calendar")
                : t("appointments.calendarClinicTitle", "Clinic calendar")}
            </CardTitle>
            <div className="flex items-center gap-1">
              <Button type="button" variant="outline" size="icon" className="h-9 w-9" onClick={() => shiftMonth(-1)}>
                <ChevronLeft className="h-4 w-4" aria-hidden />
                <span className="sr-only">{t("appointments.calendarPrev", "Previous month")}</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 min-w-[10rem] px-3 font-medium"
                onClick={() => {
                  const now = new Date();
                  setCursor({ year: now.getFullYear(), month: now.getMonth() });
                  setSelectedDayIso(toLocalDateIso(now));
                }}
              >
                {t("appointments.today", "Today")}
              </Button>
              <Button type="button" variant="outline" size="icon" className="h-9 w-9" onClick={() => shiftMonth(1)}>
                <ChevronRight className="h-4 w-4" aria-hidden />
                <span className="sr-only">{t("appointments.calendarNext", "Next month")}</span>
              </Button>
            </div>
          </div>
          <p className="text-sm font-medium ltr-nums text-foreground">{monthLabel}</p>
          {showClinicFilter ? (
            <div className="space-y-1.5">
              <Label htmlFor="calendar-clinic">{t("appointments.clinic")}</Label>
              <select
                id="calendar-clinic"
                className={cn(nativeSelectClassName, "max-w-full sm:max-w-md")}
                value={clinicId}
                onChange={(e) => setClinicId(e.target.value)}
              >
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
                {t("appointments.calendarClinicHint", "All appointments at the selected clinic for this month.")}
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {t("appointments.calendarPhysicianHint", "Appointments assigned to you across your clinic network.")}
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {!calendarEnabled ? (
            <p className="text-sm text-muted-foreground">{t("appointments.calendarPickClinic", "Select a clinic to load the calendar.")}</p>
          ) : isPending ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : (
            <>
              <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
                {WEEKDAY_KEYS.map((key) => (
                  <div
                    key={key}
                    className="px-0.5 py-1 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs"
                  >
                    {t(`appointments.weekday.${key}`, key)}
                  </div>
                ))}
                {grid.map((day, idx) => {
                  if (!day) {
                    return <div key={`pad-${idx}`} className="min-h-11 sm:min-h-14" aria-hidden />;
                  }
                  const iso = toLocalDateIso(day);
                  const count = countByDay.get(iso) ?? 0;
                  const isSelected = isSameLocalDateIso(selectedDayIso, day);
                  const isToday = sameLocalDay(day, today);
                  return (
                    <button
                      key={iso}
                      type="button"
                      className={cn(
                        "flex min-h-11 flex-col items-center justify-start rounded-md border border-transparent px-0.5 py-1 text-center touch-manipulation transition-colors sm:min-h-14 sm:px-1",
                        isSelected && "border-primary bg-primary/10 ring-1 ring-primary/30",
                        !isSelected && "hover:bg-muted/60 active:bg-muted",
                        isToday && !isSelected && "border-border bg-muted/40",
                      )}
                      onClick={() => setSelectedDayIso(iso)}
                    >
                      <span className={cn("text-xs font-medium ltr-nums sm:text-sm", isToday && "text-primary")}>
                        {day.getDate()}
                      </span>
                      {count > 0 ? (
                        <span className="mt-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground ltr-nums">
                          {count > 9 ? "9+" : count}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>

              <div className="border-t border-border pt-4">
                <h3 className="mb-3 text-sm font-semibold">
                  {selectedDay.toLocaleDateString(loc, {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </h3>
                {dayAppointments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("appointments.calendarDayEmpty", "No appointments this day.")}</p>
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
                            className="flex w-full flex-col gap-2 rounded-lg border border-border bg-card p-3 text-start touch-manipulation transition-colors hover:bg-muted/50 active:bg-muted sm:flex-row sm:items-center sm:justify-between"
                            onClick={() => openAppointment(a.id)}
                          >
                            <div className="min-w-0 flex-1 space-y-1">
                              <p className="text-sm font-semibold ltr-nums">
                                {start.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" })}
                                {" – "}
                                {end.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" })}
                              </p>
                              <p className="truncate text-sm">{patient.text}</p>
                              {mode === "clinic" && a.clinicianName ? (
                                <p className="truncate text-xs text-muted-foreground">{a.clinicianName}</p>
                              ) : null}
                              {mode === "physician" ? (
                                <p className="truncate text-xs text-muted-foreground">
                                  {formatClinicNameFields(a.clinicNameEn, a.clinicNameAr, i18n.language)}
                                </p>
                              ) : null}
                            </div>
                            <AppointmentStatusBadge status={a.status} className="self-start sm:self-center" />
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
