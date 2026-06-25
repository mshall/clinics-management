import { mapApiRole, type DemoRole } from "@/lib/roles";

/** Roles that may edit or delete patients from the registry (list + profile). */
const PATIENT_MANAGE_ROLES: ReadonlySet<DemoRole> = new Set([
  "group_admin",
  "group_supervisor",
  "clinic_admin",
  "clinic_assistant",
  "branch_manager",
  "call_center",
]);

export function resolvePatientManageRole(role: string | DemoRole | undefined | null): DemoRole | undefined {
  if (!role) return undefined;
  const raw = String(role).trim();
  if (PATIENT_MANAGE_ROLES.has(raw as DemoRole)) return raw as DemoRole;
  const mapped = mapApiRole(raw);
  return PATIENT_MANAGE_ROLES.has(mapped) ? mapped : undefined;
}

export function canEditPatientDetails(role: string | DemoRole | undefined | null): boolean {
  const normalized = resolvePatientManageRole(role);
  if (!normalized) return false;
  return PATIENT_MANAGE_ROLES.has(normalized);
}

export function canDeletePatient(role: string | DemoRole | undefined | null): boolean {
  return canEditPatientDetails(role);
}

export function canManagePatientsInList(role: string | DemoRole | undefined | null): boolean {
  return canEditPatientDetails(role);
}
