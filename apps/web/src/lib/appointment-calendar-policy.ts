import type { DemoRole } from "@/lib/roles";

/** Physician calendar = own bookings; clinic calendar = all bookings at a clinic. */
export type AppointmentCalendarMode = "physician" | "clinic";

export function appointmentCalendarMode(role: DemoRole | undefined): AppointmentCalendarMode {
  return role === "physician" ? "physician" : "clinic";
}

/** Roles that use a clinic picker on the calendar (org / front-desk views). */
export function appointmentCalendarShowsClinicFilter(role: DemoRole | undefined): boolean {
  if (!role) return false;
  return role !== "physician";
}
