import { ForbiddenException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { hasAnyRole, hasAnyRoleInSet, hasRole } from "./effective-roles";

/** Organization roles that may permanently delete appointments and encounters. */
export const ORG_CLINICAL_DELETE_ROLES: ReadonlySet<UserRole> = new Set([
  UserRole.GROUP_ADMIN,
  UserRole.GROUP_SUPERVISOR,
  UserRole.CALL_CENTER,
]);

export function assertOrgClinicalDeleteRole(
  viewer: JwtUser,
  resource: "appointments" | "encounters",
): void {
  if (!hasAnyRoleInSet(viewer, ORG_CLINICAL_DELETE_ROLES)) {
    throw new ForbiddenException(
      resource === "appointments"
        ? "Only group administrators, supervisors, and call center staff can delete appointments"
        : "Only group administrators, supervisors, and call center staff can delete encounters",
    );
  }
}
