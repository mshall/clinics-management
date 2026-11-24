/**
 * GRW-P2-S budget arithmetic (PURE). The budget of a promotion is the append-only sum of PromotionBudgetEntry rows:
 *   exposure = reserved + debited - released - reversed        (RC-S2: exposure <= cap at every point)
 * A reservation turns into a debit at completion by writing RELEASE (reason CONVERTED) and DEBIT of the same amount in one transaction, so a debit is never
 * counted twice and the formula above holds literally. A refund after completion writes REVERSE_DEBIT, which frees the budget again.
 * Money is in minor units (integers).
 */
export type BudgetEntryType = "RESERVE" | "RELEASE" | "DEBIT" | "REVERSE_DEBIT";
export interface BudgetEntryLike { type: BudgetEntryType; amountMinor: number }

export interface BudgetState { reservedMinor: number; releasedMinor: number; debitedMinor: number; reversedMinor: number; heldMinor: number; netDebitedMinor: number; exposureMinor: number; remainingMinor: number; capMinor: number }

export function budgetState(entries: readonly BudgetEntryLike[], capMinor: number): BudgetState {
  let reserved = 0, released = 0, debited = 0, reversed = 0;
  for (const e of entries) {
    if (!Number.isInteger(e.amountMinor) || e.amountMinor <= 0) throw new RangeError("budget entry amounts are positive integers");
    if (e.type === "RESERVE") reserved += e.amountMinor; else if (e.type === "RELEASE") released += e.amountMinor; else if (e.type === "DEBIT") debited += e.amountMinor; else reversed += e.amountMinor;
  }
  const exposure = reserved + debited - released - reversed;
  return { reservedMinor: reserved, releasedMinor: released, debitedMinor: debited, reversedMinor: reversed, heldMinor: reserved - released, netDebitedMinor: debited - reversed, exposureMinor: exposure, remainingMinor: capMinor - exposure, capMinor };
}

/** RC-S2 plus the sanity rules: exposure within [0, cap], nothing released that was not reserved, nothing reversed that was not debited. */
export function budgetInvariantViolations(entries: readonly BudgetEntryLike[], capMinor: number): string[] {
  const s = budgetState(entries, capMinor); const v: string[] = [];
  if (s.exposureMinor > capMinor) v.push("EXPOSURE_ABOVE_CAP");
  if (s.exposureMinor < 0) v.push("EXPOSURE_NEGATIVE");
  if (s.releasedMinor > s.reservedMinor) v.push("RELEASED_MORE_THAN_RESERVED");
  if (s.reversedMinor > s.debitedMinor) v.push("REVERSED_MORE_THAN_DEBITED");
  return v;
}

export const canReserve = (entries: readonly BudgetEntryLike[], capMinor: number, amountMinor: number) => amountMinor > 0 && budgetState(entries, capMinor).remainingMinor >= amountMinor;

/** Burn rate against plan: spend (net debited plus held) over the last `hours`, relative to cap spread evenly over the promotion window. > 1 means faster than plan. */
export function burnRatio(spentLastHoursMinor: number, hours: number, capMinor: number, windowHours: number): number {
  if (capMinor <= 0 || windowHours <= 0 || hours <= 0) return 0;
  const planPerHour = capMinor / windowHours;
  return spentLastHoursMinor / hours / planPerHour;
}
