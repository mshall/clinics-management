import { ForbiddenException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { isPlatformSuperAdmin } from "../common/platform-super-admin";
import { PrismaService } from "../prisma/prisma.service";

const CLINIC_FISCAL_ROLES = new Set<UserRole>([
  UserRole.GROUP_ADMIN,
  UserRole.CLINIC_ADMIN,
  UserRole.BRANCH_MANAGER,
]);

export async function assertFiscalDeviceAccess(
  prisma: PrismaService,
  user: JwtUser,
  clinicId: string,
  tenantId: string,
): Promise<void> {
  if (isPlatformSuperAdmin(user)) return;
  if (!user.tenantId || user.tenantId !== tenantId) throw new ForbiddenException();
  if (!user.role || !CLINIC_FISCAL_ROLES.has(user.role)) throw new ForbiddenException("Insufficient permissions");

  if (user.role === UserRole.GROUP_ADMIN) return;

  const scope = await prisma.clinicAdminScope.findFirst({
    where: { userId: user.userId, clinicId, tenantId },
    select: { id: true },
  });
  if (!scope) throw new ForbiddenException("Clinic scope required");
}