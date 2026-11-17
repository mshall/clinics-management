import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";

type Props = {
  bookingSource?: string | null;
  isNewPatientAtBooking?: boolean | null;
  className?: string;
};

export function AppointmentSourceBadges({ bookingSource, isNewPatientAtBooking, className }: Props) {
  const { t } = useTranslation();
  if (!bookingSource && isNewPatientAtBooking == null) return null;

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
    </span>
  );
}