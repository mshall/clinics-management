import { BadRequestException } from "@nestjs/common";
import {
  EmployeeRecordStatus,
  EmployeeSeparationReason,
  Prisma,
  UserRole,
} from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service";

type DbClient = Prisma.TransactionClient | PrismaService;

export async function assertTenantUserDeletable(
  client: DbClient,
  userId: string,
  options?: { actorUserId?: string; allowClinicalRecords?: boolean },
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
  if (options?.allowClinicalRecords) return;
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

async function applyEmployeeDeactivation(
  tx: Prisma.TransactionClient,
  employeeId: string,
  resignationDate: Date,
): Promise<void> {
  const emp = await tx.employee.findUnique({
    where: { id: employeeId },
    select: { hireDate: true, recordStatus: true },
  });
  if (!emp) return;
  if (emp.recordStatus === EmployeeRecordStatus.INACTIVE) return;
  if (resignationDate < emp.hireDate) {
    throw new BadRequestException("Resignation date cannot be before hire date");
  }

  const openPeriod = await tx.employeeEmploymentPeriod.findFirst({
    where: { employeeId, endDate: null },
    orderBy: { startDate: "desc" },
  });
  if (openPeriod) {
    await tx.employeeEmploymentPeriod.update({
      where: { id: openPeriod.id },
      data: { endDate: resignationDate, separationReason: EmployeeSeparationReason.RESIGNATION },
    });
  } else {
    await tx.employeeEmploymentPeriod.create({
      data: {
        employeeId,
        startDate: emp.hireDate,
        endDate: resignationDate,
        separationReason: EmployeeSeparationReason.RESIGNATION,
      },
    });
  }
  await tx.employee.update({
    where: { id: employeeId },
    data: {
      recordStatus: EmployeeRecordStatus.INACTIVE,
      resignationDate,
      separationReason: EmployeeSeparationReason.RESIGNATION,
    },
  });
}

async function applyEmployeeReactivation(
  tx: Prisma.TransactionClient,
  employeeId: string,
  startDate: Date,
): Promise<void> {
  const emp = await tx.employee.findUnique({
    where: { id: employeeId },
    select: { recordStatus: true, resignationDate: true },
  });
  if (!emp || emp.recordStatus !== EmployeeRecordStatus.INACTIVE) return;
  startDate.setHours(0, 0, 0, 0);
  if (emp.resignationDate && startDate <= emp.resignationDate) {
    throw new BadRequestException("Reactivation date must be after the resignation date");
  }
  await tx.employeeEmploymentPeriod.create({
    data: { employeeId, startDate },
  });
  await tx.employee.update({
    where: { id: employeeId },
    data: {
      recordStatus: EmployeeRecordStatus.ACTIVE,
      resignationDate: null,
      separationReason: null,
      deletedAt: null,
    },
  });
}

export async function deactivateEmployeeRecord(
  tx: Prisma.TransactionClient,
  employeeId: string,
  resignationDate: Date,
): Promise<void> {
  await applyEmployeeDeactivation(tx, employeeId, resignationDate);
}

export async function reactivateEmployeeRecord(
  tx: Prisma.TransactionClient,
  employeeId: string,
  startDate: Date,
): Promise<void> {
  await applyEmployeeReactivation(tx, employeeId, startDate);
}

export async function deactivateUserAccount(
  tx: Prisma.TransactionClient,
  tenantId: string,
  userId: string,
  resignationDate: Date,
): Promise<void> {
  const user = await tx.user.findFirst({ where: { id: userId, tenantId } });
  if (!user) throw new BadRequestException("User not found");
  if (user.deletedAt) throw new BadRequestException("Archived users cannot be deactivated");
  if (user.deactivatedAt) throw new BadRequestException("User is already deactivated");

  await tx.user.update({
    where: { id: userId },
    data: { deactivatedAt: new Date() },
  });

  const emp = await tx.employee.findFirst({ where: { tenantId, userId } });
  if (emp && !emp.deletedAt) {
    await applyEmployeeDeactivation(tx, emp.id, resignationDate);
  }
}

export async function reactivateUserAccount(
  tx: Prisma.TransactionClient,
  tenantId: string,
  userId: string,
  startDate: Date,
): Promise<void> {
  const user = await tx.user.findFirst({ where: { id: userId, tenantId } });
  if (!user) throw new BadRequestException("User not found");
  if (user.deletedAt) throw new BadRequestException("Use restore for archived users");
  if (!user.deactivatedAt) throw new BadRequestException("User is not deactivated");

  await tx.user.update({
    where: { id: userId },
    data: { deactivatedAt: null },
  });

  const emp = await tx.employee.findFirst({ where: { tenantId, userId } });
  if (emp && !emp.deletedAt) {
    await applyEmployeeReactivation(tx, emp.id, startDate);
  }
}

export async function softDeleteEmployeeForUser(
  tx: Prisma.TransactionClient,
  tenantId: string,
  userId: string,
): Promise<void> {
  const now = new Date();
  const emp = await tx.employee.findFirst({ where: { tenantId, userId } });
  if (emp && !emp.deletedAt) {
    await tx.employee.update({
      where: { id: emp.id },
      data: { deletedAt: now },
    });
    if (emp.recordStatus === EmployeeRecordStatus.ACTIVE) {
      const resignationDate = new Date();
      resignationDate.setHours(0, 0, 0, 0);
      await applyEmployeeDeactivation(tx, emp.id, resignationDate);
    }
  }
}

export async function softDeleteUserLinkedToEmployee(
  tx: Prisma.TransactionClient,
  tenantId: string,
  userId: string,
  actorUserId?: string,
): Promise<void> {
  const user = await tx.user.findFirst({ where: { id: userId, tenantId } });
  if (!user || user.deletedAt) return;
  await assertTenantUserDeletable(tx, userId, { actorUserId, allowClinicalRecords: true });
  await tx.user.update({
    where: { id: userId },
    data: { deletedAt: new Date(), deactivatedAt: null },
  });
}

/** Soft-archive a tenant user and linked employee (reversible). */
export async function softDeleteTenantUser(
  tx: Prisma.TransactionClient,
  tenantId: string,
  userId: string,
  actorUserId?: string,
): Promise<void> {
  const user = await tx.user.findFirst({ where: { id: userId, tenantId } });
  if (!user) throw new BadRequestException("User not found");
  if (user.deletedAt) throw new BadRequestException("User is already archived");
  await assertTenantUserDeletable(tx, userId, { actorUserId, allowClinicalRecords: true });

  const now = new Date();
  await tx.user.update({
    where: { id: userId },
    data: { deletedAt: now, deactivatedAt: null },
  });
  await softDeleteEmployeeForUser(tx, tenantId, userId);
}

/** Soft-archive employee and linked user (reversible). */
export async function softDeleteLinkedEmployee(
  tx: Prisma.TransactionClient,
  tenantId: string,
  employeeId: string,
  actorUserId?: string,
): Promise<void> {
  const emp = await tx.employee.findFirst({ where: { id: employeeId, tenantId } });
  if (!emp) throw new BadRequestException("Employee not found");
  if (emp.deletedAt) throw new BadRequestException("Employee is already archived");

  const now = new Date();
  await tx.employee.update({
    where: { id: employeeId },
    data: { deletedAt: now },
  });
  if (emp.recordStatus === EmployeeRecordStatus.ACTIVE) {
    const resignationDate = new Date();
    resignationDate.setHours(0, 0, 0, 0);
    await applyEmployeeDeactivation(tx, employeeId, resignationDate);
  }
  if (emp.userId) {
    await softDeleteUserLinkedToEmployee(tx, tenantId, emp.userId, actorUserId);
  }
}

export async function restoreTenantUser(
  tx: Prisma.TransactionClient,
  tenantId: string,
  userId: string,
  reactivationStartDate: Date,
): Promise<void> {
  const user = await tx.user.findFirst({ where: { id: userId, tenantId } });
  if (!user) throw new BadRequestException("User not found");
  if (!user.deletedAt && !user.deactivatedAt) {
    throw new BadRequestException("User is already active");
  }

  await tx.user.update({
    where: { id: userId },
    data: { deletedAt: null, deactivatedAt: null },
  });

  const emp = await tx.employee.findFirst({ where: { tenantId, userId } });
  if (emp) {
    await tx.employee.update({
      where: { id: emp.id },
      data: { deletedAt: null },
    });
    if (emp.recordStatus === EmployeeRecordStatus.INACTIVE || user.deactivatedAt || user.deletedAt) {
      await applyEmployeeReactivation(tx, emp.id, reactivationStartDate);
    }
  }
}

export async function restoreEmployee(
  tx: Prisma.TransactionClient,
  tenantId: string,
  employeeId: string,
  reactivationStartDate: Date,
  actorUserId?: string,
): Promise<void> {
  const emp = await tx.employee.findFirst({ where: { id: employeeId, tenantId } });
  if (!emp) throw new BadRequestException("Employee not found");
  if (!emp.deletedAt && emp.recordStatus === EmployeeRecordStatus.ACTIVE) {
    throw new BadRequestException("Employee is already active");
  }

  await tx.employee.update({
    where: { id: employeeId },
    data: { deletedAt: null },
  });
  await applyEmployeeReactivation(tx, employeeId, reactivationStartDate);

  if (emp.userId) {
    const user = await tx.user.findFirst({ where: { id: emp.userId, tenantId } });
    if (user && (user.deletedAt || user.deactivatedAt)) {
      await tx.user.update({
        where: { id: emp.userId },
        data: { deletedAt: null, deactivatedAt: null },
      });
    }
  }
}

/** @deprecated Use softDeleteEmployeeForUser */
export async function deleteEmployeeForUser(
  tx: Prisma.TransactionClient,
  tenantId: string,
  userId: string,
): Promise<{ idDocRelativePath: string | null }> {
  await softDeleteEmployeeForUser(tx, tenantId, userId);
  return { idDocRelativePath: null };
}

/** @deprecated Use softDeleteUserLinkedToEmployee */
export async function deleteUserLinkedToEmployee(
  tx: Prisma.TransactionClient,
  tenantId: string,
  userId: string,
  actorUserId?: string,
): Promise<void> {
  await softDeleteUserLinkedToEmployee(tx, tenantId, userId, actorUserId);
}

export async function deactivateUserForEmployee(
  tx: Prisma.TransactionClient,
  tenantId: string,
  userId: string,
  resignationDate: Date,
): Promise<void> {
  const user = await tx.user.findFirst({ where: { id: userId, tenantId } });
  if (!user || user.deletedAt) return;
  if (!user.deactivatedAt) {
    await tx.user.update({
      where: { id: userId },
      data: { deactivatedAt: new Date() },
    });
  }
  const emp = await tx.employee.findFirst({ where: { tenantId, userId } });
  if (emp && !emp.deletedAt && emp.recordStatus === EmployeeRecordStatus.ACTIVE) {
    await applyEmployeeDeactivation(tx, emp.id, resignationDate);
  }
}

export async function reactivateUserForEmployee(
  tx: Prisma.TransactionClient,
  tenantId: string,
  userId: string,
  startDate: Date,
): Promise<void> {
  const user = await tx.user.findFirst({ where: { id: userId, tenantId } });
  if (!user || user.deletedAt) return;
  await tx.user.update({
    where: { id: userId },
    data: { deactivatedAt: null },
  });
  const emp = await tx.employee.findFirst({ where: { tenantId, userId } });
  if (emp && !emp.deletedAt && emp.recordStatus === EmployeeRecordStatus.INACTIVE) {
    await applyEmployeeReactivation(tx, emp.id, startDate);
  }
}
