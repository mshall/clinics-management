import { mapApiRole, type DemoRole } from "@/lib/roles";

/** Roles that may permanently delete appointments / bookings. */
const APPOINTMENT_DELETE_ROLES: ReadonlySet<DemoRole> = new Set([
  "group_admin",
  "group_supervisor",
  "call_center",
]);

export function canDeleteAppointment(role: string | DemoRole | undefined | null): boolean {
  if (!role) return false;
  const raw = String(role).trim();
  if (APPOINTMENT_DELETE_ROLES.has(raw as DemoRole)) return true;
  return APPOINTMENT_DELETE_ROLES.has(mapApiRole(raw));
}
