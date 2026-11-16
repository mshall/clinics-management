import assert from "node:assert/strict";
import { test } from "node:test";
import { UserRole } from "@prisma/client";
import {
  canEditOperationFees,
  operationFinancialsVisible,
  operationSummaryFinancialsVisible,
} from "./operation-money-access";

const admin: Parameters<typeof operationFinancialsVisible>[0] = {
  userId: "admin-1",
  tenantId: "t1",
  email: "a@test.com",
  role: UserRole.GROUP_ADMIN,
};

const physicianSelf: Parameters<typeof operationFinancialsVisible>[0] = {
  userId: "phy-1",
  tenantId: "t1",
  email: "p@test.com",
  role: UserRole.PHYSICIAN,
};

const physicianOther: Parameters<typeof operationFinancialsVisible>[0] = {
  userId: "phy-2",
  tenantId: "t1",
  email: "p2@test.com",
  role: UserRole.PHYSICIAN,
};

test("summary money for finance, supervisor, group and clinic admin", () => {
  assert.equal(operationSummaryFinancialsVisible(UserRole.FINANCE_OFFICER), true);
  assert.equal(operationSummaryFinancialsVisible(UserRole.GROUP_SUPERVISOR), true);
  assert.equal(operationSummaryFinancialsVisible(UserRole.GROUP_ADMIN), true);
  assert.equal(operationSummaryFinancialsVisible(UserRole.CLINIC_ADMIN), true);
  assert.equal(operationSummaryFinancialsVisible(UserRole.RECEPTIONIST), false);
  assert.equal(operationSummaryFinancialsVisible(UserRole.PHYSICIAN), false);
});

test("row money for privileged roles and assigned physician only", () => {
  assert.equal(operationFinancialsVisible(admin, "phy-1"), true);
  assert.equal(operationFinancialsVisible(physicianSelf, "phy-1"), true);
  assert.equal(operationFinancialsVisible(physicianOther, "phy-1"), false);
  assert.equal(
    operationFinancialsVisible(
      { userId: "cc", tenantId: "t1", email: "c@test.com", role: UserRole.CALL_CENTER },
      "phy-1",
    ),
    false,
  );
});

test("fee edits only for money roles", () => {
  assert.equal(canEditOperationFees(admin), true);
  assert.equal(canEditOperationFees(physicianSelf), false);
});