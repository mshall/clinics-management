import { BadRequestException } from "@nestjs/common";
import { UserRole } from "@prisma/client";

/** Group administrators are provisioned with the organization, not created or promoted later. */
export function assertCanAssignGroupAdminRole(existingRole: UserRole, nextRole: UserRole): void {
  if (nextRole === UserRole.GROUP_ADMIN && existingRole !== UserRole.GROUP_ADMIN) {
    throw new BadRequestException(
      "Group administrator is assigned only when the organization is created. Existing users cannot be promoted to group administrator.",
    );
  }
}

export function assertCanCreateGroupAdminRole(role: UserRole): void {
  if (role === UserRole.GROUP_ADMIN) {
    throw new BadRequestException(
      "Group administrator accounts are created only when the organization is provisioned, not through user creation.",
    );
  }
}
