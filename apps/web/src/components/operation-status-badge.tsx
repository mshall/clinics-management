import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { appointmentStatusClassName } from "@/components/appointment-status-badge";
import { cn } from "@/lib/utils";

export function operationStatusLabel(status: string, t: TFunction): string {
  const u = status.toUpperCase();
  switch (u) {
    case "COMPLETED":
      return t("operations.statusCompleted", "Completed");
    case "CANCELLED":
      return t("operations.statusCancelled", "Cancelled");
    case "SCHEDULED":
      return t("operations.statusScheduled", "Scheduled");
    default:
      return status;
  }
}

export function OperationStatusBadge({ status, className }: { status: string; className?: string }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold",
        appointmentStatusClassName(status),
        className
      )}
    >
      {operationStatusLabel(status, t)}
    </span>
  );
}
