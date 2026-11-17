/** Mirror API `normalizeOperationStatus` / `operationStatusIsEditable`. */
export function normalizeOperationStatus(status: string): string {
  const u = status.toUpperCase();
  if (u === "SCHEDULED") return "BOOKED";
  if (u === "COMPLETED") return "DISCHARGED";
  return u;
}

export function operationStatusIsEditable(status: string): boolean {
  const n = normalizeOperationStatus(status);
  return n === "BOOKED" || n === "PRE_OP";
}

export function operationCanOpenInWorkspace(status: string): boolean {
  return status.toUpperCase() !== "CANCELLED";
}

export function operationClinicalFormEditable(
  status: string,
  canAdminEditCompleted: boolean,
): boolean {
  if (operationStatusIsEditable(status)) return true;
  const n = normalizeOperationStatus(status);
  if ((n === "DISCHARGED" || status.toUpperCase() === "COMPLETED") && canAdminEditCompleted) return true;
  return false;
}

/** Booked / pre-op rows: edit affordances (status changes, clinical form, etc.). */
export function operationShowsBookedRowActions(status: string): boolean {
  return operationStatusIsEditable(status);
}

/** Mirror API `OPERATION_COMPLETE_ROLES` — call center may book but not complete. */
export function canMarkOperationCompleted(role: string | undefined): boolean {
  if (!role) return false;
  return role !== "call_center";
}

export function operationStatusIsDischarged(status: string): boolean {
  return normalizeOperationStatus(status) === "DISCHARGED";
}