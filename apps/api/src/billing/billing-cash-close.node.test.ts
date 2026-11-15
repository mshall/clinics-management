import assert from "node:assert/strict";
import { test } from "node:test";
import { PaymentMethod } from "@prisma/client";
import { sumExpectedCashAndCard } from "./billing-cash-close";

test("sums cash and card allocations", () => {
  const { expectedCash, expectedCard } = sumExpectedCashAndCard([
    { method: PaymentMethod.CASH, amount: 100 },
    { method: PaymentMethod.CARD, amount: 50 },
    { method: PaymentMethod.CASH, amount: 25 },
  ]);
  assert.equal(expectedCash, 125);
  assert.equal(expectedCard, 50);
});