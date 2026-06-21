import { ForbiddenException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import type { JwtUser } from "../../auth/jwt-user";
import { isPlatformSuperAdmin } from "../../common/platform-super-admin";

export function assertExplorerTenant(user: JwtUser): string {
  if (user.tenantId != null) return user.tenantId;
  throw new ForbiddenException(
    "Data explorer requires organization membership; platform operators should use /admin/platform APIs",
  );
}

export function assertDataExplorerAccess(user: JwtUser): void {
  if (isPlatformSuperAdmin(user)) return;
  if (user.role === UserRole.GROUP_ADMIN && user.tenantId) return;
  throw new ForbiddenException("Only group administrators or platform super administrators can use the data explorer");
}

export function isDataExplorerPlatformOperator(user: JwtUser): boolean {
  return isPlatformSuperAdmin(user);
}
