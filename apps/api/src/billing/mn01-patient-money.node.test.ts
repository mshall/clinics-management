import assert from "node:assert/strict";
import { test } from "node:test";
import { UserRole } from "@prisma/client";
import {
  canApproveRefunds,
  canHandlePatientMoney,
  isPackageExpired,
  packageSessionValue,
  refundApprovalThreshold,
  refundNeedsApproval,
  refundableRemaining,
  signedMovement,
} from "./patient-money";

test("refund approval threshold comes from the market pack with a default", () => {
  assert.equal(refundApprovalThreshold({ billing: { refundApprovalThreshold: 250 } }), 250);
  assert.equal(refundApprovalThreshold({}), 1000);
  assert.equal(refundApprovalThreshold({ billing: { refundApprovalThreshold: -5 } }), 1000);
});

test("only refunds above the threshold from non-approvers need approval", () => {
  assert.equal(refundNeedsApproval(1001, 1000, false), true);
  assert.equal(refundNeedsApproval(1000, 1000, false), false);
  assert.equal(refundNeedsApproval(5000, 1000, true), false);
});

test("refundable remaining ignores rejected refunds", () => {
  assert.equal(
    refundableRemaining(600, [
      { amount: 200, status: "COMPLETED" },
      { amount: 100, status: "PENDING_APPROVAL" },
      { amount: 300, status: "REJECTED" },
    ]),
    300,
  );
  assert.equal(refundableRemaining(100, [{ amount: 150, status: "COMPLETED" }]), 0);
});

test("package sessions sum exactly to the price paid", () => {
  const vals = [3, 2, 1].map((left) => packageSessionValue(100, 3, left));
  assert.deepEqual(vals, [33.33, 33.33, 33.34]);
  assert.equal(packageSessionValue(100, 3, 0), 0);
});

test("package expiry is inclusive of the expiry day", () => {
  assert.equal(isPackageExpired(new Date("2026-01-10"), new Date("2026-01-10T20:00:00Z")), false);
  assert.equal(isPackageExpired(new Date("2026-01-10"), new Date("2026-01-11T00:00:01Z")), true);
  assert.equal(isPackageExpired(null), false);
});

test("roles: desk records money, only approvers approve", () => {
  const desk = { role: UserRole.RECEPTIONIST, additionalRoles: [] };
  const doc = { role: UserRole.PHYSICIAN, additionalRoles: [] };
  const docOwner = { role: UserRole.PHYSICIAN, additionalRoles: [], isTenantOwner: true };
  assert.equal(canHandlePatientMoney(desk), true);
  assert.equal(canApproveRefunds(desk), false);
  assert.equal(canHandlePatientMoney(doc), false);
  assert.equal(canApproveRefunds(docOwner), true);
});

test("cash movement sign", () => {
  assert.equal(signedMovement("OUT", 50), -50);
  assert.equal(signedMovement("IN", 50), 50);
});
