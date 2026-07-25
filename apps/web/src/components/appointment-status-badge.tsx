import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

/** Tailwind classes for appointment workflow statuses (used across the app). */
/** Compact colored chip for in-month calendar cells (Apple-style event pills). */
export function appointmentCalendarEventChipClassName(status: string): string {
  const u = status.toUpperCase();
  switch (u) {
    case "COMPLETED":
      return "bg-emerald-600 text-white dark:bg-emerald-600";
    case "CANCELLED":
      return "bg-red-600/85 text-white line-through dark:bg-red-600/85";
    case "CONFIRMED":
      return "bg-sky-600 text-white dark:bg-sky-600";
    case "CHECKED_IN":
      return "bg-violet-600 text-white dark:bg-violet-600";
    case "SCHEDULED":
      return "bg-orange-500 text-white dark:bg-orange-500";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function appointmentStatusClassName(status: string): string {
  const u = status.toUpperCase();
  switch (u) {
    case "COMPLETED":
      return "border-transparent bg-emerald-600 text-white shadow-sm dark:bg-emerald-600 dark:text-white";
    case "CANCELLED":
      return "border-transparent bg-red-600 text-white shadow-sm dark:bg-red-600 dark:text-white";
    case "CONFIRMED":
      return "border-transparent bg-sky-600 text-white shadow-sm dark:bg-sky-600 dark:text-white";
    case "CHECKED_IN":
      return "border-transparent bg-violet-600 text-white shadow-sm dark:bg-violet-600 dark:text-white";
    case "SCHEDULED":
      return "border-transparent bg-orange-500 text-white shadow-sm dark:bg-orange-500 dark:text-white";
    default:
      return "border-transparent bg-muted text-muted-foreground";
  }
}

export function appointmentStatusLabel(status: string, t: TFunction): string {
  const u = status.toUpperCase();
  switch (u) {
    case "COMPLETED":
      return t("appointments.statusCompleted", "Completed");
    case "CANCELLED":
      return t("appointments.statusCancelled", "Cancelled");
    case "CONFIRMED":
      return t("appointments.statusConfirmed", "Confirmed");
    case "CHECKED_IN":
      return t("appointments.statusCheckedIn", "Checked in");
    case "SCHEDULED":
      return t("appointments.statusScheduled", "Scheduled");
    default:
      return status;
  }
}

export function AppointmentStatusBadge({ status, className }: { status: string; className?: string }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold",
        appointmentStatusClassName(status),
        className
      )}
    >
      {appointmentStatusLabel(status, t)}
    </span>
  );
}
