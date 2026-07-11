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

/** Organization login roles that must have a linked HR employee record. */
export const TENANT_USER_EMPLOYEE_ROLES = new Set<UserRole>([
  ...CLINIC_EMPLOYEE_ROLES,
  UserRole.GROUP_ADMIN,
  UserRole.GROUP_SUPERVISOR,
  UserRole.CALL_CENTER,
  UserRole.HR_OFFICER,
  UserRole.FINANCE_OFFICER,
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
    case UserRole.GROUP_ADMIN:
      return "Group Administrator";
    case UserRole.GROUP_SUPERVISOR:
      return "Group Supervisor";
    case UserRole.CALL_CENTER:
      return "Call Center";
    case UserRole.HR_OFFICER:
      return "HR Officer";
    case UserRole.FINANCE_OFFICER:
      return "Finance Officer";
    default:
      return "Staff";
  }
}

function splitDisplayName(displayName: string): { firstNameEn: string; lastNameEn: string } {
  const parts = displayName.trim().split(/\s+/);
  const firstNameEn = parts[0] ?? displayName;
  const lastNameEn = parts.slice(1).join(" ") || "Staff";
  return { firstNameEn, lastNameEn };
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

/**
 * Links an existing employee (by userId or matching unlinked email) or creates one.
 * Every tenant user in TENANT_USER_EMPLOYEE_ROLES gets a strict HR employee mapping.
 */
export async function ensureUserEmployeeRecord(
  tx: Prisma.TransactionClient,
  tenantId: string,
  user: { id: string; email: string; displayName: string; role: UserRole },
  primaryClinicId?: string | null,
): Promise<void> {
  if (!TENANT_USER_EMPLOYEE_ROLES.has(user.role)) return;

  const clinicId = primaryClinicId ?? (await resolvePrimaryClinicForUser(tx, tenantId, user.id));
  if (!clinicId) return;

  const { firstNameEn, lastNameEn } = splitDisplayName(user.displayName);
  const syncData = {
    clinicId,
    email: user.email,
    jobTitle: jobTitleForRole(user.role),
    firstNameEn,
    lastNameEn,
  };

  const linked = await tx.employee.findFirst({ where: { userId: user.id } });
  if (linked) {
    await tx.employee.update({
      where: { id: linked.id },
      data: syncData,
    });
    return;
  }

  const email = user.email.toLowerCase().trim();
  if (email) {
    const orphanByEmail = await tx.employee.findFirst({
      where: {
        tenantId,
        userId: null,
        email: { equals: email, mode: "insensitive" },
      },
    });
    if (orphanByEmail) {
      await tx.employee.update({
        where: { id: orphanByEmail.id },
        data: { ...syncData, userId: user.id },
      });
      return;
    }
  }

  await tx.employee.create({
    data: {
      tenantId,
      userId: user.id,
      employeeNumber: await nextStandardEmployeeNumber(tx, tenantId),
      phone: "+0000000000",
      employmentType: EmploymentType.FULL_TIME,
      hireDate: new Date(),
      salaryBase: 0,
      ...syncData,
    },
  });
}

/** @deprecated Use ensureUserEmployeeRecord */
export async function syncLinkedEmployeeClinic(
  tx: Prisma.TransactionClient,
  tenantId: string,
  user: { id: string; email: string; displayName: string; role: UserRole },
  primaryClinicId: string | null,
): Promise<void> {
  await ensureUserEmployeeRecord(tx, tenantId, user, primaryClinicId);
}

/** Ensures organization login accounts have linked HR employee records. */
export async function ensureClinicStaffEmployeeRecords(prisma: PrismaService, tenantId: string): Promise<void> {
  const users = await prisma.user.findMany({
    where: {
      tenantId,
      role: { in: [...TENANT_USER_EMPLOYEE_ROLES] },
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
      await ensureUserEmployeeRecord(tx, tenantId, user, clinicId);
    });
  }
}
