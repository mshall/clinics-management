import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { assertAssistantAccess, assistantRoleSlugForRole } from "./assistant-access";
import { messageAllowedForNav, requiredNavKeysForMessage } from "./assistant-scope";

test("assistant role slugs", () => {
  assert.equal(assistantRoleSlugForRole(UserRole.GROUP_ADMIN), "group_admin");
  assert.equal(assistantRoleSlugForRole(UserRole.NURSE), "nurse");
  assert.equal(assistantRoleSlugForRole(UserRole.PLATFORM_SUPER_ADMIN), "platform_super_admin");
});

test("assertAssistantAccess requires tenant except platform super admin", () => {
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
  assert.equal(
    assertAssistantAccess({
      userId: "u",
      tenantId: null,
      email: "a@b.com",
      role: UserRole.PLATFORM_SUPER_ADMIN,
    }),
    "platform_super_admin",
  );
});

test("scope blocks admin topics without admin nav", () => {
  const msg = "How do I set TRN and VAT?";
  assert.ok(requiredNavKeysForMessage(msg).includes("admin"));
  assert.equal(messageAllowedForNav(msg, ["patients", "profile"]), false);
  assert.equal(messageAllowedForNav(msg, ["admin", "profile"]), true);
});
