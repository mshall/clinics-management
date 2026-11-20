import type { MoneyVisibilityOverrides } from "@/lib/money-visibility-policy";
import {
  operationFeeEditForUser,
  operationMoneyVisibleForUser,
  showOperationMoneyColumnsForUser,
} from "@/lib/money-visibility-policy";
import type { NavTabAccessMode } from "@/lib/nav-tab-access-policy";
import { canInitiateOperation } from "@/lib/operation-stage-policy";
import type { DemoRole } from "@/lib/roles";

const OPERATION_MONEY_ROLES = new Set<DemoRole>([
  "group_admin",
  "group_supervisor",
  "finance_officer",
  "clinic_admin",
]);

/** Revenue / period stats on the operations page. */
export function canViewOperationSummaryMoney(
  role: DemoRole | undefined,
  overrides?: MoneyVisibilityOverrides | null,
): boolean {
  if (overrides) return operationMoneyVisibleForUser(role, overrides);
  return role != null && OPERATION_MONEY_ROLES.has(role);
}

/** Fee fields on create / edit / complete dialogs. */
export function canEditOperationFees(
  role: DemoRole | undefined,
  overrides?: MoneyVisibilityOverrides | null,
): boolean {
  return operationFeeEditForUser(role, overrides);
}

/** Money columns: privileged roles see all rows; physicians only their assignments (per-row API flag). */
export function showOperationMoneyColumns(
  role: DemoRole | undefined,
  overrides?: MoneyVisibilityOverrides | null,
): boolean {
  if (overrides) return showOperationMoneyColumnsForUser(role, overrides);
  return canViewOperationSummaryMoney(role) || role === "physician";
}

/** Schedule a new operation (stage 1). Call center cannot initiate. */
export function canCreateOperation(
  role: DemoRole | undefined,
  navTabKeys?: string[] | null,
  navTabAccessModes?: Record<string, NavTabAccessMode> | null,
  additionalRoles?: DemoRole[] | null,
): boolean {
  return canInitiateOperation(role, navTabKeys, navTabAccessModes, additionalRoles);
}

/** @deprecated Prefer `operation.financialsVisible` from the API for row-level display. */
export function canViewOperationMoney(
  role: DemoRole | undefined,
  overrides?: MoneyVisibilityOverrides | null,
): boolean {
  return canViewOperationSummaryMoney(role, overrides);
}