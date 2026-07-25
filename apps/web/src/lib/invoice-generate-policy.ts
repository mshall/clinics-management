import type { DemoRole } from "@/lib/roles";

/** Roles that may generate patient invoices from encounters or operations. */
const INVOICE_GENERATE_ROLES: ReadonlySet<DemoRole> = new Set([
  "group_admin",
  "group_supervisor",
  "branch_manager",
  "clinic_admin",
  "clinic_assistant",
  "receptionist",
  "call_center",
  "physician",
  "finance_officer",
]);

export function canGenerateInvoice(role: DemoRole | undefined): boolean {
  if (!role) return false;
  return INVOICE_GENERATE_ROLES.has(role);
}
