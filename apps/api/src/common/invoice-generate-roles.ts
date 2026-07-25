import { ForbiddenException } from "@nestjs/common";
import { UserRole } from "@prisma/client";

/** Roles allowed to create and view patient invoices (not clinic branding settings). */
export const INVOICE_GENERATE_ROLES: ReadonlySet<UserRole> = new Set([
  UserRole.GROUP_ADMIN,
  UserRole.GROUP_SUPERVISOR,
  UserRole.BRANCH_MANAGER,
  UserRole.CLINIC_ADMIN,
  UserRole.CLINIC_ASSISTANT,
  UserRole.RECEPTIONIST,
  UserRole.CALL_CENTER,
  UserRole.PHYSICIAN,
  UserRole.FINANCE_OFFICER,
]);

export function assertCanGenerateInvoice(role: UserRole): void {
  if (!INVOICE_GENERATE_ROLES.has(role)) {
    throw new ForbiddenException("You do not have permission to generate invoices");
  }
}
