import { BadRequestException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { hasRole } from "./effective-roles";

function actorMayGrantGroupAdmin(actor?: JwtUser | null): boolean {
  return Boolean(actor && hasRole(actor, UserRole.GROUP_ADMIN));
}

/** Group administrators may be added by an existing group administrator; others cannot promote or create them. */
export function assertCanAssignGroupAdminRole(
  existingRole: UserRole,
  nextRole: UserRole,
  actor?: JwtUser | null,
): void {
  if (nextRole === UserRole.GROUP_ADMIN && existingRole !== UserRole.GROUP_ADMIN && !actorMayGrantGroupAdmin(actor)) {
    throw new BadRequestException(
      "Only an organization administrator can assign the group administrator role.",
    );
  }
}

export function assertCanCreateGroupAdminRole(role: UserRole, actor?: JwtUser | null): void {
  if (role === UserRole.GROUP_ADMIN && !actorMayGrantGroupAdmin(actor)) {
    throw new BadRequestException(
      "Only an organization administrator can create another group administrator account.",
    );
  }
}
