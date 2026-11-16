import type { MoneyAccessOverride } from "@/lib/money-access-override";
import { moneyEditFromOverride, moneyVisibilityFromOverride } from "@/lib/money-access-override";
import type { DemoRole } from "@/lib/roles";

export type FinancialVisibilityOverride = MoneyAccessOverride;

export type MoneyVisibilityOverrides = {
  operations: MoneyAccessOverride;
  encounters: MoneyAccessOverride;
  appointments: MoneyAccessOverride;
};

const OPERATION_MONEY_ROLES = new Set<DemoRole>([
  "group_admin",
  "group_supervisor",
  "finance_officer",
  "clinic_admin",
]);

const ENCOUNTER_MONEY_ROLES = new Set<DemoRole>([
  "group_admin",
  "group_supervisor",
  "finance_officer",
  "clinic_admin",
  "receptionist",
  "clinic_assistant",
  "branch_manager",
  "physician",
]);

const APPOINTMENT_FEE_EDIT_ROLES = new Set<DemoRole>([
  "group_admin",
  "group_supervisor",
  "finance_officer",
  "clinic_admin",
  "receptionist",
  "clinic_assistant",
  "branch_manager",
]);

const ENCOUNTER_FEE_EDIT_ROLES = new Set<DemoRole>([
  ...APPOINTMENT_FEE_EDIT_ROLES,
  "physician",
]);

export function operationMoneyVisibleForUser(
  role: DemoRole | undefined,
  overrides?: MoneyVisibilityOverrides | null,
): boolean {
  const roleDefault = role != null && OPERATION_MONEY_ROLES.has(role);
  return moneyVisibilityFromOverride(overrides?.operations ?? "ROLE_DEFAULT", roleDefault);
}

export function showOperationMoneyColumnsForUser(
  role: DemoRole | undefined,
  overrides?: MoneyVisibilityOverrides | null,
): boolean {
  const roleDefault = operationMoneyVisibleForUser(role, null) || role === "physician";
  return moneyVisibilityFromOverride(overrides?.operations ?? "ROLE_DEFAULT", roleDefault);
}

export function encounterMoneyVisibleForUser(
  role: DemoRole | undefined,
  overrides?: MoneyVisibilityOverrides | null,
): boolean {
  const roleDefault = role != null && ENCOUNTER_MONEY_ROLES.has(role);
  return moneyVisibilityFromOverride(overrides?.encounters ?? "ROLE_DEFAULT", roleDefault);
}

export function appointmentMoneyVisibleForUser(
  role: DemoRole | undefined,
  overrides?: MoneyVisibilityOverrides | null,
): boolean {
  const roleDefault =
    (role != null && ENCOUNTER_MONEY_ROLES.has(role)) || (role != null && OPERATION_MONEY_ROLES.has(role));
  return moneyVisibilityFromOverride(overrides?.appointments ?? "ROLE_DEFAULT", roleDefault);
}

export function operationFeeEditForUser(
  role: DemoRole | undefined,
  overrides?: MoneyVisibilityOverrides | null,
): boolean {
  const roleDefault = role != null && OPERATION_MONEY_ROLES.has(role);
  return moneyEditFromOverride(overrides?.operations ?? "ROLE_DEFAULT", roleDefault);
}

export function appointmentFeeEditForUser(
  role: DemoRole | undefined,
  overrides?: MoneyVisibilityOverrides | null,
): boolean {
  const roleDefault = role != null && APPOINTMENT_FEE_EDIT_ROLES.has(role);
  return moneyEditFromOverride(overrides?.appointments ?? "ROLE_DEFAULT", roleDefault);
}

export function encounterFeeEditForUser(
  role: DemoRole | undefined,
  overrides?: MoneyVisibilityOverrides | null,
): boolean {
  const roleDefault = role != null && ENCOUNTER_FEE_EDIT_ROLES.has(role);
  return moneyEditFromOverride(overrides?.encounters ?? "ROLE_DEFAULT", roleDefault);
}