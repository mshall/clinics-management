import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { assertCanAssignGroupAdminRole, assertCanCreateGroupAdminRole } from "./group-admin-role-policy";

test("rejects creating a group admin through tenant user creation", () => {
  assert.throws(() => assertCanCreateGroupAdminRole(UserRole.GROUP_ADMIN), BadRequestException);
});

test("allows creating other roles", () => {
  assert.doesNotThrow(() => assertCanCreateGroupAdminRole(UserRole.NURSE));
});

test("rejects promoting a non-group-admin to group admin", () => {
  assert.throws(() => assertCanAssignGroupAdminRole(UserRole.NURSE, UserRole.GROUP_ADMIN), BadRequestException);
});

test("allows keeping group admin role on edit", () => {
  assert.doesNotThrow(() => assertCanAssignGroupAdminRole(UserRole.GROUP_ADMIN, UserRole.GROUP_ADMIN));
});

test("allows demoting group admin", () => {
  assert.doesNotThrow(() => assertCanAssignGroupAdminRole(UserRole.GROUP_ADMIN, UserRole.CLINIC_ADMIN));
});
