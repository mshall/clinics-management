import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { appointmentStatusClassName, appointmentStatusLabel, statusDotClass } from "@/components/appointment-status";

export function AppointmentStatusBadge({ status, className }: { status: string; className?: string }) {
  const { t } = useTranslation();
  return (
    <span
      data-status={status.toUpperCase()}
      className={cn(
        "inline-flex w-fit items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium",
        appointmentStatusClassName(status),
        className
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", statusDotClass(status))} />
      {appointmentStatusLabel(status, t)}
    </span>
  );
}
