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
