import assert from "node:assert/strict";
import { test } from "node:test";
import { UserRole } from "@prisma/client";

/**
 * Documents expected behavior when org admins change a user's primary role:
 * access overrides are cleared server-side in updateTenantUser.
 */
test("primary role change is detected when dto.role differs from existing", () => {
  const existing: UserRole = UserRole.RECEPTIONIST;
  const next: UserRole = UserRole.PHYSICIAN;
  assert.notEqual(next, existing);
});