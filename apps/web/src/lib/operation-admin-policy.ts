import type { DemoRole } from "@/lib/roles";

const OPERATIONS_ADMIN_EDIT_ROLES: ReadonlySet<DemoRole> = new Set([
  "group_admin",
  "clinic_admin",
  "branch_manager",
]);

export function canAdminEditCompletedOperation(role: DemoRole | undefined): boolean {
  if (!role) return false;
  return OPERATIONS_ADMIN_EDIT_ROLES.has(role);
}
