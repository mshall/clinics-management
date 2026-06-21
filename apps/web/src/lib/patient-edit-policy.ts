import type { DemoRole } from "@/lib/roles";

const PATIENT_STAFF_ROLES: ReadonlySet<DemoRole> = new Set([
  "group_admin",
  "clinic_assistant",
  "branch_manager",
  "clinic_admin",
]);

export function canEditPatientDetails(role: DemoRole | undefined): boolean {
  if (!role) return false;
  return PATIENT_STAFF_ROLES.has(role);
}

export function canDeletePatient(role: DemoRole | undefined): boolean {
  return canEditPatientDetails(role);
}
