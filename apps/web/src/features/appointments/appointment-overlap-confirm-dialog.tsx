import { CalendarClock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppointmentStatusBadge } from "@/components/appointment-status-badge";
import { ConfirmDialog } from "@/components/confirm-dialog";
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

export function AppointmentOverlapConfirmDialog({
  open,
  onOpenChange,
  conflicts,
  pending = false,
  onConfirm,
}: AppointmentOverlapConfirmDialogProps) {
  const { t, i18n } = useTranslation();
  const locale = localeForLanguage(i18n.language);

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
      variant="default"
      icon={<CalendarClock className="h-5 w-5" aria-hidden />}
      title={t("appointments.overlapConfirmTitle", "Time slot already booked")}
      description={t(
        "appointments.overlapConfirmIntro",
        "Another patient is already scheduled during this time. Would you like to book this patient at the same time as well?",
      )}
      confirmLabel={t("appointments.overlapConfirmAction", "Book at this time")}
      cancelLabel={t("common.cancel", "Cancel")}
      pending={pending}
      onConfirm={onConfirm}
      details={
        conflicts.length > 0 ? (
          <ul className="space-y-3">
            {conflicts.map((c) => {
              const patient = resolvePatientListLabel({
                patientId: c.patientId,
                patientMrn: c.patientMrn,
                patientName: c.patientName,
              });
              return (
                <li key={c.id} className="rounded-md border border-border/80 bg-background px-3 py-2.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{patient.text}</p>
                      {c.patientMrn ? (
                        <p className="text-xs text-muted-foreground ltr-nums">{c.patientMrn}</p>
                      ) : null}
                    </div>
                    <AppointmentStatusBadge status={c.status} />
                  </div>
                  <p className="mt-2 text-sm ltr-nums text-muted-foreground">
                    {formatAppointmentTimeRange(c.startsAt, c.endsAt, locale)}
                  </p>
                  {c.clinicianName ? (
                    <p className="mt-1 text-xs text-muted-foreground">{c.clinicianName}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null
      }
    />
  );
}
