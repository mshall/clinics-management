import { EmploymentType, Prisma, UserRole } from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service";

export const CLINIC_EMPLOYEE_ROLES = new Set<UserRole>([
  UserRole.CLINIC_ADMIN,
  UserRole.BRANCH_MANAGER,
  UserRole.PHYSICIAN,
  UserRole.NURSE,
  UserRole.RECEPTIONIST,
  UserRole.CLINIC_ASSISTANT,
]);

type DbClient = Prisma.TransactionClient | PrismaService;

export function jobTitleForRole(role: UserRole): string {
  switch (role) {
    case UserRole.PHYSICIAN:
      return "Physician";
    case UserRole.NURSE:
      return "Nurse";
    case UserRole.RECEPTIONIST:
      return "Receptionist";
    case UserRole.CLINIC_ASSISTANT:
      return "Clinic Assistant";
    case UserRole.BRANCH_MANAGER:
      return "Branch Manager";
    case UserRole.CLINIC_ADMIN:
      return "Clinic Administrator";
    default:
      return "Staff";
  }
}

export async function nextStandardEmployeeNumber(client: DbClient, tenantId: string): Promise<string> {
  const rows = await client.employee.findMany({
    where: { tenantId, employeeNumber: { startsWith: "EMP-" } },
    select: { employeeNumber: true },
  });
  let max = 0;
  for (const r of rows) {
    const m = /^EMP-(\d+)$/i.exec(r.employeeNumber.trim());
    if (m) max = Math.max(max, Number.parseInt(m[1], 10));
  }
  return `EMP-${max + 1}`;
}

export async function resolvePrimaryClinicForUser(
  client: DbClient,
  tenantId: string,
  userId: string,
): Promise<string | null> {
  const scope = await client.clinicAdminScope.findFirst({
    where: { tenantId, userId },
    orderBy: { clinicId: "asc" },
    select: { clinicId: true },
  });
  if (scope) return scope.clinicId;

  const linked = await client.employee.findFirst({
    where: { tenantId, userId },
    select: { clinicId: true },
  });
  if (linked) return linked.clinicId;

  const fallback = await client.clinic.findFirst({
    where: { tenantId },
    orderBy: { nameEn: "asc" },
    select: { id: true },
  });
  return fallback?.id ?? null;
}

export async function syncLinkedEmployeeClinic(
  tx: Prisma.TransactionClient,
  tenantId: string,
  user: { id: string; email: string; displayName: string; role: UserRole },
  primaryClinicId: string | null,
): Promise<void> {
  if (!CLINIC_EMPLOYEE_ROLES.has(user.role)) return;
  const existing = await tx.employee.findFirst({ where: { userId: user.id } });
  if (!primaryClinicId) {
    if (existing) {
      await tx.employee.update({ where: { id: existing.id }, data: { userId: null } });
    }
    return;
  }
  const parts = user.displayName.trim().split(/\s+/);
  const firstNameEn = parts[0] ?? user.displayName;
  const lastNameEn = parts.slice(1).join(" ") || "Staff";
  if (existing) {
    await tx.employee.update({
      where: { id: existing.id },
      data: { clinicId: primaryClinicId, email: user.email, userId: user.id },
    });
    return;
  }
  await tx.employee.create({
    data: {
      tenantId,
      clinicId: primaryClinicId,
      userId: user.id,
      employeeNumber: await nextStandardEmployeeNumber(tx, tenantId),
      firstNameEn,
      lastNameEn,
      email: user.email,
      phone: "+0000000000",
      jobTitle: jobTitleForRole(user.role),
      employmentType: EmploymentType.FULL_TIME,
      hireDate: new Date(),
      salaryBase: 0,
    },
  });
}

/** Ensures clinic staff login accounts (physicians, nurses, etc.) have HR employee records. */
export async function ensureClinicStaffEmployeeRecords(prisma: PrismaService, tenantId: string): Promise<void> {
  const users = await prisma.user.findMany({
    where: {
      tenantId,
      role: { in: [...CLINIC_EMPLOYEE_ROLES] },
      employee: { is: null },
    },
    select: { id: true, email: true, displayName: true, role: true },
  });
  if (!users.length) return;

  for (const user of users) {
    const alreadyLinked = await prisma.employee.findFirst({
      where: { userId: user.id },
      select: { id: true },
    });
    if (alreadyLinked) continue;

    const clinicId = await resolvePrimaryClinicForUser(prisma, tenantId, user.id);
    if (!clinicId) continue;

    await prisma.$transaction(async (tx) => {
      await syncLinkedEmployeeClinic(tx, tenantId, user, clinicId);
    });
  }
}
