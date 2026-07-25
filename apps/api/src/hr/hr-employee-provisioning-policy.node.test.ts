import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { assertHrCanAssignLoginRole, assertCanEditGroupAdminEmployeeProfile, assertHrCanDeactivateOrArchiveLinkedUser } from "./hr-employee-provisioning-policy";

test("HR may assign clinic staff roles", () => {
  assert.doesNotThrow(() => assertHrCanAssignLoginRole(UserRole.NURSE));
  assert.doesNotThrow(() => assertHrCanAssignLoginRole(UserRole.PHYSICIAN));
});

test("HR cannot assign org-wide roles", () => {
  assert.throws(() => assertHrCanAssignLoginRole(UserRole.HR_OFFICER), ForbiddenException);
  assert.throws(() => assertHrCanAssignLoginRole(UserRole.GROUP_ADMIN), ForbiddenException);
});

test("group admin linked users cannot be deactivated/archived via HR except by another group admin or platform super admin", () => {
  const linked = { id: "u-target", role: UserRole.GROUP_ADMIN };
  assert.throws(
    () =>
      assertHrCanDeactivateOrArchiveLinkedUser(
        { userId: "u-hr", email: "hr@demo.com", role: UserRole.HR_OFFICER },
        linked,
      ),
    ForbiddenException,
  );
  assert.throws(
    () =>
      assertHrCanDeactivateOrArchiveLinkedUser(
        { userId: "u-target", email: "admin@demo.com", role: UserRole.GROUP_ADMIN },
        { id: "u-target", role: UserRole.GROUP_ADMIN },
      ),
    ForbiddenException,
  );
  assert.doesNotThrow(() =>
    assertHrCanDeactivateOrArchiveLinkedUser(
      { userId: "u-other-admin", email: "admin2@demo.com", role: UserRole.GROUP_ADMIN },
      linked,
    ),
  );
  assert.doesNotThrow(() =>
    assertHrCanDeactivateOrArchiveLinkedUser(
      { userId: "u-super", email: "superadmin@kiorly.com", role: UserRole.PLATFORM_SUPER_ADMIN },
      linked,
    ),
  );
  assert.doesNotThrow(() =>
    assertHrCanDeactivateOrArchiveLinkedUser(
      { userId: "u-hr", email: "hr@demo.com", role: UserRole.HR_OFFICER },
      { id: "u-nurse", role: UserRole.NURSE },
    ),
  );
});

test("group admin employee profiles are read-only for HR; group admins and platform super admin may edit", () => {
  const linked = { id: "u-target", role: UserRole.GROUP_ADMIN };
  assert.throws(
    () =>
      assertCanEditGroupAdminEmployeeProfile(
        { userId: "u-hr", email: "hr@demo.com", role: UserRole.HR_OFFICER },
        linked,
      ),
    ForbiddenException,
  );
  assert.throws(
    () =>
      assertCanEditGroupAdminEmployeeProfile(
        { userId: "u-clinic", email: "clinic@demo.com", role: UserRole.CLINIC_ADMIN },
        linked,
      ),
    ForbiddenException,
  );
  assert.doesNotThrow(() =>
    assertCanEditGroupAdminEmployeeProfile(
      { userId: "u-self", email: "admin@demo.com", role: UserRole.GROUP_ADMIN },
      linked,
    ),
  );
  assert.doesNotThrow(() =>
    assertCanEditGroupAdminEmployeeProfile(
      { userId: "u-other-admin", email: "admin2@demo.com", role: UserRole.GROUP_ADMIN },
      linked,
    ),
  );
  assert.doesNotThrow(() =>
    assertCanEditGroupAdminEmployeeProfile(
      { userId: "u-super", email: "superadmin@kiorly.com", role: UserRole.PLATFORM_SUPER_ADMIN },
      linked,
    ),
  );
  assert.doesNotThrow(() =>
    assertCanEditGroupAdminEmployeeProfile(
      { userId: "u-hr", email: "hr@demo.com", role: UserRole.HR_OFFICER },
      { id: "u-nurse", role: UserRole.NURSE },
    ),
  );
});
