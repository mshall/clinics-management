import { Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { appointmentStatusClassName } from "@/components/appointment-status";
import { AppointmentStatusBadge } from "@/components/appointment-status-badge";
import type { AppointmentDto } from "@/lib/api-types";
import { effectiveAppointmentEnd } from "@/lib/appointment-scheduling";
import { sameLocalDay, toLocalDateIso } from "@/lib/appointment-calendar-utils";
import { formatClinicNameFields } from "@/lib/locale-display";
import { resolvePatientListLabel } from "@/lib/patient-display";
import { cn } from "@/lib/utils";
import { placeDay } from "@/features/appointments/appointments-time-grid-utils";

const HOUR_PX = 64;
const SLOT_MIN = 30;

const TINT: Record<string, string> = {
  COMPLETED: "border-s-[hsl(var(--success))] bg-[hsl(var(--success)/0.10)]",
  CANCELLED: "border-s-[hsl(var(--danger-text))] bg-[hsl(var(--danger-text)/0.08)] opacity-75",
  CONFIRMED: "border-s-[hsl(var(--info))] bg-[hsl(var(--info)/0.10)]",
  CHECKED_IN: "border-s-primary bg-accent",
  SCHEDULED: "border-s-[hsl(var(--muted-foreground))] bg-card",
};

export function AppointmentTimeGrid({
  days,
  appointments,
  locale,
  language,
  showClinic,
  onOpen,
  onQuickBook,
  canBook,
}: {
  days: Date[];
  appointments: AppointmentDto[];
  locale: string;
  language: string;
  showClinic: boolean;
  onOpen: (id: string) => void;
  onQuickBook?: (startLocalIso: string) => void;
  canBook: boolean;
}) {
  const { t } = useTranslation();
  const today = useMemo(() => new Date(), []);
  const [now, setNow] = useState(() => new Date());
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(h);
  }, []);

  const byDay = useMemo(() => {
    const m = new Map<string, AppointmentDto[]>();
    for (const a of appointments) {
      const k = toLocalDateIso(new Date(a.startsAt));
      m.set(k, [...(m.get(k) ?? []), a]);
    }
    return m;
  }, [appointments]);

  const { startHour, endHour } = useMemo(() => {
    let lo = 8;
    let hi = 20;
    for (const d of days) {
      for (const a of byDay.get(toLocalDateIso(d)) ?? []) {
        lo = Math.min(lo, new Date(a.startsAt).getHours());
        hi = Math.max(hi, effectiveAppointmentEnd(a).getHours() + 1);
      }
    }
    return { startHour: lo, endHour: Math.min(24, hi) };
  }, [days, byDay]);

  // Open scrolled to the working day (first visit or now, whichever is earlier).
  const firstHour = useMemo(() => {
    let f = now.getHours();
    for (const d of days) for (const a of byDay.get(toLocalDateIso(d)) ?? []) f = Math.min(f, new Date(a.startsAt).getHours());
    return f;
  }, [days, byDay, now]);
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = Math.max(0, (firstHour - startHour - 0.5) * HOUR_PX);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days[0]?.getTime(), days.length]);

  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const height = hours.length * HOUR_PX;
  const hourFmt = new Intl.DateTimeFormat(locale, { hour: "numeric" });
  const timeFmt = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" });
  const dayFmt = new Intl.DateTimeFormat(locale, { weekday: "short" });
  const dateFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  const nowTop = ((now.getHours() + now.getMinutes() / 60) - startHour) * HOUR_PX;
  const cols = days.length;

  return (
    <div ref={scroller} className="max-h-[calc(100vh-15rem)] min-h-104 overflow-auto" data-testid="appointments-time-grid">
      <div className="min-w-176">
        {/* Sticky day header */}
        <div className="sticky top-0 z-5 grid border-b border-border bg-card/95 backdrop-blur-sm" style={{ gridTemplateColumns: `3.5rem repeat(${cols}, minmax(0, 1fr))` }}>
          <div />
          {days.map((d) => {
            const isToday = sameLocalDay(d, today);
            return (
              <div key={d.toISOString()} className="border-s border-border/60 px-2 py-2 text-center">
                <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground rtl:normal-case rtl:tracking-normal">{dayFmt.format(d)}</div>
                <div className={cn("mx-auto mt-0.5 inline-flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-sm font-semibold ltr-nums", isToday ? "bg-primary text-primary-foreground" : "text-foreground")}>{dateFmt.format(d)}</div>
              </div>
            );
          })}
        </div>

        <div className="relative grid" style={{ gridTemplateColumns: `3.5rem repeat(${cols}, minmax(0, 1fr))`, height }}>
          <div className="relative">
            {hours.map((h, i) => (
              <div key={h} className="absolute inset-e-2 -translate-y-1/2 text-[11px] text-muted-foreground ltr-nums" style={{ top: i * HOUR_PX }}>
                {i > 0 ? hourFmt.format(new Date(2000, 0, 1, h)) : ""}
              </div>
            ))}
          </div>
          {days.map((d) => {
            const placed = placeDay(byDay.get(toLocalDateIso(d)) ?? []);
            const isToday = sameLocalDay(d, today);
            return (
              <div key={d.toISOString()} className={cn("relative border-s border-border/60", isToday && "bg-primary/3")}>
                {hours.map((h, i) => (
                  <div key={h} className="absolute inset-x-0 border-t border-border/50" style={{ top: i * HOUR_PX, height: HOUR_PX }}>
                    {canBook && onQuickBook
                      ? [0, 30].map((m) => (
                          <button
                            key={m}
                            type="button"
                            tabIndex={-1}
                            aria-label={`${t("appointments.quickBook", "Quick book")} ${timeFmt.format(new Date(2000, 0, 1, h, m))}`}
                            className="group/slot absolute inset-x-0 flex items-center justify-center text-primary opacity-0 transition-opacity hover:bg-primary/5 hover:opacity-100 focus-visible:opacity-100"
                            style={{ top: (m / 60) * HOUR_PX, height: (SLOT_MIN / 60) * HOUR_PX }}
                            onClick={() => {
                              const s = new Date(d);
                              s.setHours(h, m, 0, 0);
                              const p = (n: number) => String(n).padStart(2, "0");
                              onQuickBook(`${toLocalDateIso(s)}T${p(h)}:${p(m)}`);
                            }}
                          >
                            <Plus className="size-3.5" aria-hidden />
                          </button>
                        ))
                      : null}
                  </div>
                ))}
                {placed.map((p) => {
                  const top = Math.max(0, ((p.start.getHours() + p.start.getMinutes() / 60) - startHour) * HOUR_PX);
                  const h = Math.max(26, ((p.end.getTime() - p.start.getTime()) / 3_600_000) * HOUR_PX - 2);
                  const patient = resolvePatientListLabel({ patientId: p.a.patientId, patientMrn: p.a.patientMrn, patientName: p.a.patientName });
                  const name = patient.text.split(" — ").slice(1).join(" — ") || patient.text;
                  return (
                    <button
                      key={p.a.id}
                      type="button"
                      data-status={p.a.status}
                      onClick={() => onOpen(p.a.id)}
                      title={`${timeFmt.format(p.start)}–${timeFmt.format(p.end)} · ${patient.text}`}
                      className={cn(
                        "absolute z-1 overflow-hidden rounded-md border border-border/70 border-s-[3px] px-1.5 py-1 text-start shadow-kx-1 transition-[box-shadow,transform] duration-150 hover:z-3 hover:shadow-kx-2 focus-visible:z-3",
                        TINT[p.a.status.toUpperCase()] ?? TINT.SCHEDULED,
                      )}
                      style={{ top, height: h, insetInlineStart: `calc(${(p.col / p.cols) * 100}% + 2px)`, width: `calc(${100 / p.cols}% - 4px)` }}
                    >
                      <span className="block truncate text-xs font-semibold leading-tight">{name}</span>
                      {h > 38 ? <span className="block truncate text-[11px] leading-tight text-muted-foreground ltr-nums">{timeFmt.format(p.start)}–{timeFmt.format(p.end)}</span> : null}
                      {h > 58 ? (
                        <span className="mt-1 block">
                          {showClinic ? <span className="mb-1 block truncate text-[11px] text-muted-foreground">{formatClinicNameFields(p.a.clinicNameEn, p.a.clinicNameAr, language)}</span> : null}
                          <AppointmentStatusBadge status={p.a.status} className={cn("px-1.5 py-0 text-[10px]", appointmentStatusClassName(p.a.status))} />
                        </span>
                      ) : null}
                    </button>
                  );
                })}
                {isToday && nowTop >= 0 && nowTop <= height ? (
                  <div aria-hidden className="pointer-events-none absolute inset-x-0 z-4 flex items-center" style={{ top: nowTop }}>
                    <span className="size-2 -ms-1 rounded-full bg-[hsl(var(--ring))]" />
                    <span className="h-px flex-1 bg-[hsl(var(--ring))]" />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
