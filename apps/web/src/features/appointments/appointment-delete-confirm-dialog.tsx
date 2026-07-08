import { useTranslation } from "react-i18next";
import { AppointmentStatusBadge } from "@/components/appointment-status-badge";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { formatClinicNameFields, localeForLanguage } from "@/lib/locale-display";

export type AppointmentDeleteTarget = {
  id: string;
  patientName?: string | null;
  patientMrn?: string | null;
  startsAt: string;
  endsAt?: string | null;
  clinicianName?: string | null;
  status: string;
  clinicId: string;
  clinicNameEn?: string | null;
  clinicNameAr?: string | null;
  clinicLabel?: string | null;
};

type AppointmentDeleteConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment: AppointmentDeleteTarget | null;
  pending?: boolean;
  onConfirm: () => void;
};

function formatWhen(startsAt: string, endsAt: string | null | undefined, locale: string): string {
  const start = new Date(startsAt);
  const end = endsAt ? new Date(endsAt) : null;
  const startText = start.toLocaleString(locale);
  if (!end || Number.isNaN(end.getTime())) return startText;
  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();
  const endText = sameDay
    ? end.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })
    : end.toLocaleString(locale);
  return `${startText} – ${endText}`;
}

export function AppointmentDeleteConfirmDialog({
  open,
  onOpenChange,
  appointment,
  pending = false,
  onConfirm,
}: AppointmentDeleteConfirmDialogProps) {
  const { t, i18n } = useTranslation();
  const locale = localeForLanguage(i18n.language);

  const patientLabel =
    appointment?.patientName?.trim() ||
    (appointment?.patientMrn ? appointment.patientMrn : t("appointments.patient", "Patient"));

  const clinicLabel =
    appointment?.clinicLabel ??
    (appointment
      ? formatClinicNameFields(
          appointment.clinicNameEn,
          appointment.clinicNameAr,
          i18n.language,
          appointment.clinicId,
        )
      : null);

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
      title={t("appointments.deleteConfirmTitle", "Delete appointment?")}
      description={t(
        "appointments.deleteConfirmIntro",
        "This booking will be permanently removed. This action cannot be undone.",
      )}
      confirmLabel={t("appointments.deleteConfirmAction", "Delete appointment")}
      cancelLabel={t("common.cancel", "Cancel")}
      pending={pending}
      onConfirm={onConfirm}
      details={
        appointment ? (
          <dl className="space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("appointments.patient", "Patient")}
                </dt>
                <dd className="font-medium text-foreground">{patientLabel}</dd>
                {appointment.patientMrn ? (
                  <dd className="text-xs text-muted-foreground ltr-nums">{appointment.patientMrn}</dd>
                ) : null}
              </div>
              <AppointmentStatusBadge status={appointment.status} />
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("appointments.starts", "Starts")}
              </dt>
              <dd className="ltr-nums text-foreground">
                {formatWhen(appointment.startsAt, appointment.endsAt, locale)}
              </dd>
            </div>
            {clinicLabel ? (
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("appointments.clinic", "Clinic")}
                </dt>
                <dd>{clinicLabel}</dd>
              </div>
            ) : null}
            {appointment.clinicianName ? (
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("appointments.clinician", "Doctor")}
                </dt>
                <dd>{appointment.clinicianName}</dd>
              </div>
            ) : null}
          </dl>
        ) : null
      }
    />
  );
}
