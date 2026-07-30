import { CalendarClock } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppointmentStatusBadge } from "@/components/appointment-status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatAppointmentTimeRange } from "@/lib/appointment-scheduling";
import type { AppointmentDto } from "@/lib/api-types";
import { localeForLanguage } from "@/lib/locale-display";
import { resolvePatientListLabel } from "@/lib/patient-display";

type AppointmentOverlapConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conflicts: AppointmentDto[];
  pending?: boolean;
  onConfirm: () => void;
};

function ConflictItem({ conflict, locale }: { conflict: AppointmentDto; locale: string }) {
  const patient = resolvePatientListLabel({
    patientId: conflict.patientId,
    patientMrn: conflict.patientMrn,
    patientName: conflict.patientName,
  });

  return (
    <li className="rounded-md border border-border/80 bg-background px-3 py-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-foreground">{patient.text}</p>
          {conflict.patientMrn ? (
            <p className="text-xs text-muted-foreground ltr-nums">{conflict.patientMrn}</p>
          ) : null}
        </div>
        <AppointmentStatusBadge status={conflict.status} />
      </div>
      <p className="mt-2 text-sm ltr-nums text-muted-foreground">
        {formatAppointmentTimeRange(conflict.startsAt, conflict.endsAt, locale)}
      </p>
      {conflict.clinicianName ? (
        <p className="mt-1 text-xs text-muted-foreground">{conflict.clinicianName}</p>
      ) : null}
    </li>
  );
}

export function AppointmentOverlapConfirmDialog({
  open,
  onOpenChange,
  conflicts,
  pending = false,
  onConfirm,
}: AppointmentOverlapConfirmDialogProps) {
  const { t, i18n } = useTranslation();
  const locale = localeForLanguage(i18n.language);
  const [visibleCount, setVisibleCount] = useState(1);

  useEffect(() => {
    if (open) setVisibleCount(1);
  }, [open, conflicts]);

  const visibleConflicts = conflicts.slice(0, visibleCount);
  const hiddenCount = Math.max(0, conflicts.length - visibleCount);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      <DialogContent
        className="flex max-h-[min(90vh,28rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
        aria-describedby="overlap-confirm-description"
      >
        <div className="shrink-0 border-b border-border bg-muted/40 px-6 py-5">
          <DialogHeader className="space-y-3 text-start">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-foreground ring-4 ring-muted">
              <CalendarClock className="h-5 w-5" aria-hidden />
            </div>
            <DialogTitle className="text-start text-xl">
              {t("appointments.overlapConfirmTitle", "Time slot already booked")}
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-6 py-5">
          <p id="overlap-confirm-description" className="shrink-0 text-sm leading-relaxed text-muted-foreground">
            {t(
              "appointments.overlapConfirmIntro",
              "Another patient is already scheduled during this time. Would you like to book this patient at the same time as well?",
            )}
          </p>

          {conflicts.length > 0 ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-muted/40 text-sm">
              <ul className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
                {visibleConflicts.map((c) => (
                  <ConflictItem key={c.id} conflict={c} locale={locale} />
                ))}
              </ul>
              {hiddenCount > 0 ? (
                <div className="shrink-0 border-t border-border/80 px-4 py-2">
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto px-0 text-sm"
                    onClick={() => setVisibleCount((n) => n + 1)}
                  >
                    {t("appointments.overlapShowMoreBookings", "+{{count}} more booking(s)", { count: hiddenCount })}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border px-6 py-4">
          <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            {t("common.cancel", "Cancel")}
          </Button>
          <Button type="button" disabled={pending} onClick={onConfirm}>
            {t("appointments.overlapConfirmAction", "Book at this time")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
