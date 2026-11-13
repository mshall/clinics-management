import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { assertAssistantAccess, assistantPersonaForRole } from "./assistant-access";

test("assistant personas", () => {
  assert.equal(assistantPersonaForRole(UserRole.GROUP_ADMIN), "organization_admin");
  assert.equal(assistantPersonaForRole(UserRole.PHYSICIAN), "physician");
  assert.equal(assistantPersonaForRole(UserRole.NURSE), null);
});

test("assertAssistantAccess requires tenant", () => {
  assert.throws(
    () =>
      assertAssistantAccess({
        userId: "u",
        tenantId: null,
        email: "a@b.com",
        role: UserRole.GROUP_ADMIN,
      }),
    ForbiddenException,
  );
});
