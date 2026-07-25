import type { DemoRole } from "@/lib/roles";

/** Physician = own bookings; clinic = scoped clinic; organization = tenant-wide (optional clinic filter). */
export type AppointmentCalendarMode = "physician" | "clinic" | "organization";

const CLINIC_SCOPED_CALENDAR_ROLES: ReadonlySet<DemoRole> = new Set(["clinic_admin", "branch_manager"]);

/** Roles that list appointments org-wide on the API unless a clinic filter is applied. */
const ORG_WIDE_CALENDAR_ROLES: ReadonlySet<DemoRole> = new Set([
  "group_admin",
  "group_supervisor",
  "call_center",
  "clinic_assistant",
  "receptionist",
  "nurse",
  "hr_officer",
  "finance_officer",
]);

export function appointmentCalendarIsOrgWide(role: DemoRole | undefined): boolean {
  if (!role) return false;
  return ORG_WIDE_CALENDAR_ROLES.has(role);
}

export function appointmentCalendarMode(role: DemoRole | undefined): AppointmentCalendarMode {
  if (role === "physician") return "physician";
  if (appointmentCalendarIsOrgWide(role)) return "organization";
  return "clinic";
}

/** Clinic picker shown for staff views (includes optional "all clinics" for org-wide roles). */
export function appointmentCalendarShowsClinicFilter(role: DemoRole | undefined): boolean {
  if (!role) return false;
  return role !== "physician";
}

/** Clinic-scoped roles must pick a clinic before the grid loads. */
export function appointmentCalendarRequiresClinicSelection(role: DemoRole | undefined): boolean {
  if (!role || role === "physician") return false;
  return CLINIC_SCOPED_CALENDAR_ROLES.has(role);
}
