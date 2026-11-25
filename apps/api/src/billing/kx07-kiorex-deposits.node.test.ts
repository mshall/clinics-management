import assert from "node:assert/strict";
import { test } from "node:test";
import { AppointmentStatus } from "@prisma/client";
import { depositOutcomeFor } from "./deposit-settlement.service";
import { reconcilePayouts } from "./kiorex-deposits.service";

test("held deposit outcome follows the appointment and the cancellation policy", () => {
  const s = (status: AppointmentStatus, depositRefundable: boolean | null = null) => depositOutcomeFor({ status, depositRefundable });
  assert.equal(s(AppointmentStatus.CONFIRMED), "WAIT");
  assert.equal(s(AppointmentStatus.SCHEDULED), "WAIT");
  assert.equal(s(AppointmentStatus.CHECKED_IN), "APPLY");
  assert.equal(s(AppointmentStatus.COMPLETED), "APPLY");
  assert.equal(s(AppointmentStatus.CANCELLED, true), "RELEASE");
  assert.equal(s(AppointmentStatus.CANCELLED, null), "RELEASE", "unknown policy decision → patient gets the money back");
  assert.equal(s(AppointmentStatus.CANCELLED, false), "FORFEIT");
  assert.equal(s(AppointmentStatus.NO_SHOW), "FORFEIT");
  assert.equal(depositOutcomeFor(null), "WAIT");
});

test("payout reconciliation: collected − refunded = due; due − paid = outstanding", () => {
  const t = reconcilePayouts({
    deposits: [{ amount: 100 }, { amount: 150.5 }],
    releasedDeposits: [{ amount: 50 }],
    kiorexRefunds: [{ amount: 20.25 }],
    payouts: [{ amount: 100 }],
  });
  assert.deepEqual(t, { collected: 250.5, refunded: 70.25, netDue: 180.25, payoutsReceived: 100, outstanding: 80.25 });
});

test("tender of a Kiorex deposit (contracts 1.12.0) is validated: minor units that add up to the amount, no other key; absent is fine", async () => {
  const { parseTender } = await import("./kiorex-deposits.service");
  assert.equal(parseTender(undefined, 300), null);
  assert.deepEqual(parseTender({ cardMinor: 20000, patientCreditMinor: 5000, sponsoredDiscountMinor: 5000 }, 300), { cardMinor: 20000, patientCreditMinor: 5000, sponsoredDiscountMinor: 5000 });
  assert.deepEqual(parseTender({ cardMinor: 30000 }, 300), { cardMinor: 30000, patientCreditMinor: 0, sponsoredDiscountMinor: 0 });
  for (const bad of [{ cardMinor: 29999 }, { cardMinor: -1, patientCreditMinor: 30001 }, { cardMinor: 300.5 }, { cardMinor: 30000, wallet: 1 }, "x", []]) {
    assert.throws(() => parseTender(bad, 300), (e: { getResponse?: () => { code?: string } }) => ["TENDER_INVALID", "TENDER_MISMATCH"].includes(e.getResponse?.().code ?? ""), JSON.stringify(bad));
  }
});
