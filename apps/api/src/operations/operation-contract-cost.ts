import { BadRequestException } from "@nestjs/common";

/**
 * Fee editors may set totalCost = 0 only when the operation is marked as a
 * contract (تعاقد). Call-center / fee-deferred bookings pass feesDeferred=true
 * and may keep totalCost at 0 without the contract flag.
 */
export function assertOperationContractCost(opts: {
  totalCost: number;
  isContract: boolean;
  /** When true, zero without contract is allowed (fees filled in later). */
  feesDeferred?: boolean;
}): void {
  if (opts.feesDeferred) return;
  if (opts.totalCost > 0) return;
  if (opts.isContract && opts.totalCost === 0) return;
  throw new BadRequestException(
    "OPERATION_CONTRACT_REQUIRED_FOR_ZERO_COST: Total cost cannot be zero unless this operation is marked as a contract (تعاقد).",
  );
}

export function isZeroCostAllowedForComplete(totalCost: number, isContract: boolean): boolean {
  return isContract && totalCost === 0;
}
