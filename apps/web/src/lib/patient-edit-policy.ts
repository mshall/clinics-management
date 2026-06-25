import type { DemoRole } from "@/lib/roles";

/** Roles that may edit or delete patients from the registry (list + profile). */
const PATIENT_MANAGE_ROLES: ReadonlySet<DemoRole> = new Set([
  "group_admin",
  "group_supervisor",
  "clinic_admin",
  "clinic_assistant",
  "branch_manager",
  "call_center",
]);

export function canEditPatientDetails(role: DemoRole | undefined): boolean {
  if (!role) return false;
  return PATIENT_MANAGE_ROLES.has(role);
}

export function canDeletePatient(role: DemoRole | undefined): boolean {
  return canEditPatientDetails(role);
}

export function canManagePatientsInList(role: DemoRole | undefined): boolean {
  return canEditPatientDetails(role);
}
