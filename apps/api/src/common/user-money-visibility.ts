import { FinancialVisibilityOverride, UserRole, type Prisma } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { moneyEditFromOverride, moneyVisibilityFromOverride, normalizeMoneyAccessOverride } from "./money-access-override";
import {
  isOperationMoneyRole,
  operationFinancialsVisible,
  operationSummaryFinancialsVisible,
} from "../operations/operation-money-access";

export type UserMoneyVisibilityOverrides = {
  operations: FinancialVisibilityOverride;
  encounters: FinancialVisibilityOverride;
  appointments: FinancialVisibilityOverride;
};

export const DEFAULT_MONEY_VISIBILITY_OVERRIDES: UserMoneyVisibilityOverrides = {
  operations: FinancialVisibilityOverride.ROLE_DEFAULT,
  encounters: FinancialVisibilityOverride.ROLE_DEFAULT,
  appointments: FinancialVisibilityOverride.ROLE_DEFAULT,
};

type Db = Pick<Prisma.TransactionClient, "userMoneyVisibilityOverride">;

function mapOverridesRow(row: {
  operationsOverride: FinancialVisibilityOverride;
  encountersOverride: FinancialVisibilityOverride;
  appointmentsOverride: FinancialVisibilityOverride;
}): UserMoneyVisibilityOverrides {
  return {
    operations: normalizeMoneyAccessOverride(row.operationsOverride),
    encounters: normalizeMoneyAccessOverride(row.encountersOverride),
    appointments: normalizeMoneyAccessOverride(row.appointmentsOverride),
  };
}

export async function loadUserMoneyVisibilityOverrides(
  db: Db,
  tenantId: string,
  userId: string | undefined,
): Promise<UserMoneyVisibilityOverrides> {
  if (!userId) return { ...DEFAULT_MONEY_VISIBILITY_OVERRIDES };
  const row = await db.userMoneyVisibilityOverride.findFirst({
    where: { tenantId, userId },
    select: {
      operationsOverride: true,
      encountersOverride: true,
      appointmentsOverride: true,
    },
  });
  if (!row) return { ...DEFAULT_MONEY_VISIBILITY_OVERRIDES };
  return mapOverridesRow(row);
}

/** Front desk roles that see visit/appointment fees by default (call center books without fee UI). */
const ENCOUNTER_MONEY_FRONT_DESK: ReadonlySet<UserRole> = new Set([
  UserRole.RECEPTIONIST,
  UserRole.CLINIC_ASSISTANT,
  UserRole.BRANCH_MANAGER,
]);

/** Role-based visibility for encounter visit fees and balances (before user override). */
export function encounterFinancialsVisibleByRole(viewer: JwtUser | undefined, clinicianId: string): boolean {
  if (!viewer) return false;
  if (isOperationMoneyRole(viewer.role)) return true;
  if (viewer.role === UserRole.PHYSICIAN && viewer.userId === clinicianId) return true;
  if (ENCOUNTER_MONEY_FRONT_DESK.has(viewer.role)) return true;
  return false;
}

function encounterFeeEditByRole(viewer: JwtUser | undefined, clinicianId: string): boolean {
  return encounterFinancialsVisibleByRole(viewer, clinicianId);
}

function appointmentFeeEditByRole(viewer: JwtUser | undefined, clinicianId: string): boolean {
  return (
    encounterFinancialsVisibleByRole(viewer, clinicianId) ||
    operationSummaryFinancialsVisible(viewer?.role)
  );
}

export function encounterFinancialsVisible(
  viewer: JwtUser | undefined,
  clinicianId: string,
  overrides: UserMoneyVisibilityOverrides,
): boolean {
  return moneyVisibilityFromOverride(
    overrides.encounters,
    encounterFinancialsVisibleByRole(viewer, clinicianId),
  );
}

export function appointmentFinancialsVisible(
  viewer: JwtUser | undefined,
  clinicianId: string,
  overrides: UserMoneyVisibilityOverrides,
): boolean {
  const roleDefault =
    encounterFinancialsVisibleByRole(viewer, clinicianId) ||
    operationSummaryFinancialsVisible(viewer?.role);
  return moneyVisibilityFromOverride(overrides.appointments, roleDefault);
}

export function operationRowFinancialsVisible(
  viewer: JwtUser | undefined,
  clinicianId: string,
  overrides: UserMoneyVisibilityOverrides,
): boolean {
  return moneyVisibilityFromOverride(overrides.operations, operationFinancialsVisible(viewer, clinicianId));
}

export function operationSummaryFinancialsVisibleForViewer(
  viewer: JwtUser | undefined,
  overrides: UserMoneyVisibilityOverrides,
): boolean {
  return moneyVisibilityFromOverride(overrides.operations, operationSummaryFinancialsVisible(viewer?.role));
}

export function canEditOperationFeesForViewer(
  viewer: JwtUser | undefined,
  overrides: UserMoneyVisibilityOverrides,
): boolean {
  if (!viewer) return false;
  return moneyEditFromOverride(overrides.operations, isOperationMoneyRole(viewer.role));
}

export function canEditEncounterFeesForViewer(
  viewer: JwtUser | undefined,
  clinicianId: string,
  overrides: UserMoneyVisibilityOverrides,
): boolean {
  if (!viewer) return false;
  return moneyEditFromOverride(overrides.encounters, encounterFeeEditByRole(viewer, clinicianId));
}

export function canEditAppointmentFeesForViewer(
  viewer: JwtUser | undefined,
  clinicianId: string,
  overrides: UserMoneyVisibilityOverrides,
): boolean {
  if (!viewer) return false;
  return moneyEditFromOverride(overrides.appointments, appointmentFeeEditByRole(viewer, clinicianId));
}