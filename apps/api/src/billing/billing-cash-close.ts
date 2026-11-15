import type { PaymentMethod } from "@prisma/client";

export type PaymentAllocationRow = { method: PaymentMethod; amount: number };

export function sumExpectedCashAndCard(allocations: PaymentAllocationRow[]): {
  expectedCash: number;
  expectedCard: number;
} {
  let expectedCash = 0;
  let expectedCard = 0;
  for (const a of allocations) {
    if (a.method === "CASH") expectedCash += a.amount;
    else if (a.method === "CARD") expectedCard += a.amount;
  }
  return { expectedCash, expectedCard };
}

export function flattenBillingPaymentAllocations(
  payments: { allocations: PaymentAllocationRow[] }[],
): PaymentAllocationRow[] {
  return payments.flatMap((p) => p.allocations);
}