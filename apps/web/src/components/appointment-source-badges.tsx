import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";

type Props = {
  bookingSource?: string | null;
  isNewPatientAtBooking?: boolean | null;
  patientProfileComplete?: boolean | null;
  className?: string;
};

export function AppointmentSourceBadges({
  bookingSource,
  isNewPatientAtBooking,
  patientProfileComplete,
  className,
}: Props) {
  const { t } = useTranslation();
  if (!bookingSource && isNewPatientAtBooking == null && patientProfileComplete !== false) return null;

  const isKiorex =
    bookingSource === "KIOREX_MARKETPLACE" || bookingSource === "KIOREX_WHATSAPP";

  return (
    <span className={`inline-flex flex-wrap items-center gap-1 ${className ?? ""}`}>
      {isKiorex ? (
        <Badge variant="secondary" className="gap-1 font-normal">
          <img src="/logo.svg" alt="" className="size-3.5 object-contain" width={14} height={14} />
          {t(`appointments.bookingSource.${bookingSource}`, bookingSource ?? "")}
        </Badge>
      ) : bookingSource ? (
        <Badge variant="outline" className="font-normal text-xs">
          {t(`appointments.bookingSource.${bookingSource}`, bookingSource)}
        </Badge>
      ) : null}
      {isNewPatientAtBooking ? (
        <Badge variant="default" className="font-normal text-xs">
          {t("appointments.newPatientChip", "New")}
        </Badge>
      ) : null}
      {patientProfileComplete === false ? (
        <Badge variant="outline" className="border-amber-500/60 font-normal text-xs text-amber-800 dark:text-amber-200">
          {t("appointments.profileIncompleteChip", "Profile incomplete")}
        </Badge>
      ) : null}
    </span>
  );
}