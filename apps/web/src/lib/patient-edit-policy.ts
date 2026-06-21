import type { DemoRole } from "@/lib/roles";

const PATIENT_EDIT_ROLES: ReadonlySet<DemoRole> = new Set([
  "group_admin",
  "clinic_assistant",
  "branch_manager",
  "clinic_admin",
]);

export function canEditPatientDetails(role: DemoRole | undefined): boolean {
  if (!role) return false;
  return PATIENT_EDIT_ROLES.has(role);
}
