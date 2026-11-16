import type { DemoRole } from "@/lib/roles";

const OPERATION_MONEY_ROLES = new Set<DemoRole>([
  "group_admin",
  "group_supervisor",
  "finance_officer",
  "clinic_admin",
]);

/** Revenue / period stats on the operations page. */
export function canViewOperationSummaryMoney(role: DemoRole | undefined): boolean {
  return role != null && OPERATION_MONEY_ROLES.has(role);
}

/** Fee fields on create / edit / complete dialogs. */
export function canEditOperationFees(role: DemoRole | undefined): boolean {
  return canViewOperationSummaryMoney(role);
}

/** Money columns: privileged roles see all rows; physicians only their assignments (per-row API flag). */
export function showOperationMoneyColumns(role: DemoRole | undefined): boolean {
  return canViewOperationSummaryMoney(role) || role === "physician";
}

export function canCreateOperation(role: DemoRole | undefined): boolean {
  if (!role) return false;
  const allowed = new Set<DemoRole>([
    "group_admin",
    "group_supervisor",
    "branch_manager",
    "clinic_admin",
    "clinic_assistant",
    "receptionist",
    "call_center",
  ]);
  return allowed.has(role);
}

/** @deprecated Prefer `operation.financialsVisible` from the API for row-level display. */
export function canViewOperationMoney(role: DemoRole | undefined): boolean {
  return canViewOperationSummaryMoney(role);
}