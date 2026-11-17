import { CommissionChargeStatus } from "@prisma/client";

export const ACTIVE_COMMISSION_CHARGE_STATUSES: ReadonlySet<CommissionChargeStatus> = new Set([
  CommissionChargeStatus.PENDING,
  CommissionChargeStatus.CONFIRMED,
  CommissionChargeStatus.DISPUTED,
  CommissionChargeStatus.BILLED,
]);

export function isActiveCommissionChargeStatus(status: CommissionChargeStatus): boolean {
  return ACTIVE_COMMISSION_CHARGE_STATUSES.has(status);
}