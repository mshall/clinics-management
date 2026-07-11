import { BadRequestException } from "@nestjs/common";
import { Prisma, UserRole } from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service";

type DbClient = Prisma.TransactionClient | PrismaService;

export async function assertTenantUserDeletable(
  client: DbClient,
  userId: string,
  options?: { actorUserId?: string },
): Promise<void> {
  if (options?.actorUserId && options.actorUserId === userId) {
    throw new BadRequestException("You cannot delete your own account");
  }
  const user = await client.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!user) return;
  if (user.role === UserRole.PLATFORM_SUPER_ADMIN) {
    throw new BadRequestException("Cannot delete platform super administrators");
  }
  const [encounters, appointments, operations] = await Promise.all([
    client.encounter.count({ where: { clinicianId: userId } }),
    client.appointment.count({ where: { clinicianId: userId } }),
    client.operation.count({ where: { clinicianId: userId } }),
  ]);
  if (encounters + appointments + operations > 0) {
    throw new BadRequestException(
      "Cannot delete a user linked to encounters, appointments, or operations. Reassign clinical records first.",
    );
  }
}

/** Syncs clinic assignment scopes for a tenant user (e.g. physicians with multiple clinics). */
export async function syncUserClinicAdminScopes(
  tx: Prisma.TransactionClient,
  tenantId: string,
  userId: string,
  clinicIds: string[],
): Promise<void> {
  await tx.clinicAdminScope.deleteMany({ where: { tenantId, userId } });
  if (!clinicIds.length) return;
  for (const cid of clinicIds) {
    const c = await tx.clinic.findFirst({ where: { id: cid, tenantId } });
    if (!c) throw new BadRequestException(`Invalid clinicId: ${cid}`);
  }
  await tx.clinicAdminScope.createMany({
    data: clinicIds.map((clinicId) => ({ tenantId, userId, clinicId })),
    skipDuplicates: true,
  });
}

/** Deletes the HR employee row linked to a tenant user, if any. */
export async function deleteEmployeeForUser(
  tx: Prisma.TransactionClient,
  tenantId: string,
  userId: string,
): Promise<{ idDocRelativePath: string | null }> {
  const emp = await tx.employee.findFirst({
    where: { tenantId, userId },
    select: { id: true, idDocRelativePath: true },
  });
  if (!emp) return { idDocRelativePath: null };
  const idDocRelativePath = emp.idDocRelativePath;
  await tx.employee.delete({ where: { id: emp.id } });
  return { idDocRelativePath };
}

/** Deletes a tenant login user after validation (e.g. when removing a linked employee). */
export async function deleteUserLinkedToEmployee(
  tx: Prisma.TransactionClient,
  tenantId: string,
  userId: string,
  actorUserId?: string,
): Promise<void> {
  const user = await tx.user.findFirst({ where: { id: userId, tenantId }, select: { id: true } });
  if (!user) return;
  await assertTenantUserDeletable(tx, userId, { actorUserId });
  await tx.user.delete({ where: { id: userId } });
}
