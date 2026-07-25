import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { assertHrCanAssignLoginRole } from "./hr-employee-provisioning-policy";

test("HR may assign clinic staff roles", () => {
  assert.doesNotThrow(() => assertHrCanAssignLoginRole(UserRole.NURSE));
  assert.doesNotThrow(() => assertHrCanAssignLoginRole(UserRole.PHYSICIAN));
});

test("HR cannot assign org-wide roles", () => {
  assert.throws(() => assertHrCanAssignLoginRole(UserRole.HR_OFFICER), ForbiddenException);
  assert.throws(() => assertHrCanAssignLoginRole(UserRole.GROUP_ADMIN), ForbiddenException);
});
