import type { FieldVisit } from "./lifecycle";

/** BR52 / HVPRV01 — address and phone are masked 24 h after the visit ends. A safety control: no flag, no override. */
export const ADDRESS_MASK_AFTER_MS = 24 * 60 * 60 * 1000;

const REVEAL_STATES = new Set(["CONFIRMED", "ON_MY_WAY", "ARRIVED", "FINISHED", "ABORTED_UNSAFE"]);

export type Viewer = { userId: string; isOrgAdmin?: boolean };

/**
 * Who may see the patient's address and phone: the ASSIGNED clinician and organisation admins, only once the visit is
 * CONFIRMED, and not after the 24 h mask window that starts when the visit ends. Everyone else (including other nurses
 * and unassigned dispatchers) never sees it.
 */
export function canViewAddress(viewer: Viewer, visit: Pick<FieldVisit, "state" | "assignedClinicianId" | "endedAtMs">, nowMs: number): boolean {
  const entitled = viewer.isOrgAdmin === true || (visit.assignedClinicianId != null && visit.assignedClinicianId === viewer.userId);
  if (!entitled) return false;
  if (!REVEAL_STATES.has(visit.state)) return false;
  if (visit.endedAtMs != null && nowMs - visit.endedAtMs >= ADDRESS_MASK_AFTER_MS) return false;
  return true;
}

/** What an unentitled or expired viewer gets instead of the address: district only. */
export function maskedAddress(address: { districtId: string }): { districtId: string; masked: true } {
  return { districtId: address.districtId, masked: true };
}
