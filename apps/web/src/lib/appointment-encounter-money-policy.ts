import type { MoneyVisibilityOverrides } from "@/lib/money-visibility-policy";
import { appointmentFeeEditForUser, encounterFeeEditForUser } from "@/lib/money-visibility-policy";
import type { DemoRole } from "@/lib/roles";

export function canEditAppointmentFees(
  role: DemoRole | undefined,
  overrides?: MoneyVisibilityOverrides | null,
): boolean {
  return appointmentFeeEditForUser(role, overrides);
}

export function canEditEncounterVisitFees(
  role: DemoRole | undefined,
  overrides?: MoneyVisibilityOverrides | null,
): boolean {
  return encounterFeeEditForUser(role, overrides);
}