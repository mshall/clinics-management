import { useTranslation } from "react-i18next";
import { appointmentStatusClassName } from "@/components/appointment-status";
import { cn } from "@/lib/utils";
import { operationStatusLabel } from "@/components/operation-status";

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
