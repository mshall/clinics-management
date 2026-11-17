import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { assertCanAssignGroupAdminRole, assertCanCreateGroupAdminRole } from "./group-admin-role-policy";

const groupAdminActor: JwtUser = {
  userId: "ga-1",
  tenantId: "t1",
  email: "admin@test.com",
  role: UserRole.GROUP_ADMIN,
};

test("rejects creating group admin without org admin actor", () => {
  assert.throws(() => assertCanCreateGroupAdminRole(UserRole.GROUP_ADMIN), BadRequestException);
});

test("allows org admin to create another group admin", () => {
  assert.doesNotThrow(() => assertCanCreateGroupAdminRole(UserRole.GROUP_ADMIN, groupAdminActor));
});

test("allows creating other roles without actor", () => {
  assert.doesNotThrow(() => assertCanCreateGroupAdminRole(UserRole.NURSE));
});

test("rejects promoting to group admin without org admin actor", () => {
  assert.throws(() => assertCanAssignGroupAdminRole(UserRole.NURSE, UserRole.GROUP_ADMIN), BadRequestException);
});

test("allows org admin to promote to group admin", () => {
  assert.doesNotThrow(() => assertCanAssignGroupAdminRole(UserRole.NURSE, UserRole.GROUP_ADMIN, groupAdminActor));
});

test("allows keeping group admin role on edit", () => {
  assert.doesNotThrow(() => assertCanAssignGroupAdminRole(UserRole.GROUP_ADMIN, UserRole.GROUP_ADMIN));
});

test("allows demoting group admin", () => {
  assert.doesNotThrow(() => assertCanAssignGroupAdminRole(UserRole.GROUP_ADMIN, UserRole.CLINIC_ADMIN));
});