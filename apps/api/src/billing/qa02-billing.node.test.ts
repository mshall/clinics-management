import assert from "node:assert/strict";
import { test } from "node:test";
import { PaymentMethod } from "@prisma/client";
import { BillingService } from "./billing.service";
import { flattenBillingPaymentAllocations } from "./billing-cash-close";

test("discountNeedsManagerApproval respects 15% threshold", () => {
  const svc = new BillingService({} as never);
  assert.equal(svc.discountNeedsManagerApproval(15), false);
  assert.equal(svc.discountNeedsManagerApproval(15.01), true);
  assert.equal(svc.discountNeedsManagerApproval(0), false);
});

test("flattenBillingPaymentAllocations unions split pay rows", () => {
  const flat = flattenBillingPaymentAllocations([
    {
      allocations: [
        { method: PaymentMethod.CASH, amount: 100 },
        { method: PaymentMethod.CARD, amount: 50 },
      ],
    },
    { allocations: [{ method: PaymentMethod.CASH, amount: 25 }] },
  ]);
  assert.equal(flat.length, 3);
  assert.equal(flat.filter((a) => a.method === PaymentMethod.CASH).reduce((s, a) => s + a.amount, 0), 125);
});