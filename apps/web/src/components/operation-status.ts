import type { TFunction } from "i18next";

export function operationStatusLabel(status: string, t: TFunction): string {
  const u = status.toUpperCase();
  switch (u) {
    case "BOOKED":
    case "SCHEDULED":
      return t("operations.statusBooked", "Booked");
    case "PRE_OP":
      return t("operations.statusPreOp", "Pre-op");
    case "IN_PROGRESS":
      return t("operations.statusInProgress", "In progress");
    case "RECOVERY":
      return t("operations.statusRecovery", "Recovery");
    case "DISCHARGED":
    case "COMPLETED":
      return t("operations.statusDischarged", "Discharged");
    case "CANCELLED":
      return t("operations.statusCancelled", "Cancelled");
    default:
      return status;
  }
}
