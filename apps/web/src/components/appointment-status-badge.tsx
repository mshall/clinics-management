import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

/** Tailwind classes for appointment workflow statuses (used across the app). */
/** Compact colored chip for in-month calendar cells (Apple-style event pills). */
export function appointmentCalendarEventChipClassName(status: string): string {
  switch (status.toUpperCase()) {
    case "COMPLETED":
      return "bg-[hsl(var(--success))] text-white dark:text-[#0C0D1F]";
    case "CANCELLED":
      return "bg-[hsl(var(--danger-text))]/85 text-white line-through dark:text-[#0C0D1F]";
    case "CONFIRMED":
      return "bg-[hsl(var(--info))] text-white dark:text-[#0C0D1F]";
    case "CHECKED_IN":
      return "bg-primary text-primary-foreground";
    case "SCHEDULED":
      return "bg-kx-neutral-600 text-white dark:bg-kx-neutral-400 dark:text-[#0C0D1F]";
    default:
      return "bg-muted text-muted-foreground";
  }
}

/** Soft semantic chip per workflow status (never coral: coral is brand, not state). */
export function appointmentStatusClassName(status: string): string {
  switch (status.toUpperCase()) {
    case "COMPLETED":
      return "border-transparent bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))] ring-1 ring-inset ring-[hsl(var(--success)/0.25)]";
    case "CANCELLED":
      return "border-transparent bg-[hsl(var(--danger-text)/0.12)] text-[hsl(var(--danger-text))] ring-1 ring-inset ring-[hsl(var(--danger-text)/0.28)]";
    case "CONFIRMED":
      return "border-transparent bg-[hsl(var(--info)/0.12)] text-[hsl(var(--info))] ring-1 ring-inset ring-[hsl(var(--info)/0.25)]";
    case "CHECKED_IN":
      return "border-transparent bg-accent text-accent-foreground ring-1 ring-inset ring-primary/25";
    case "SCHEDULED":
      return "border-transparent bg-muted text-foreground ring-1 ring-inset ring-border";
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
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        appointmentStatusClassName(status),
        className
      )}
    >
      {appointmentStatusLabel(status, t)}
    </span>
  );
}
