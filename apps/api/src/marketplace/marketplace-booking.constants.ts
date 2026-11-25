import { policyNumber } from "../markets/clinic-policy";
/** Default slot hold TTL when commercial config does not override (KX-04). */
export const DEFAULT_SLOT_HOLD_MINUTES = 5;
/** Live default: CLINIC_SLOT_HOLD_MINUTES (clamped 2 to 15), else 5. */
export const defaultSlotHoldMinutes = (): number => policyNumber("slotHoldMinutes");

export const SLOT_TAKEN_CODE = "SLOT_TAKEN";

export const MARKETPLACE_BOOKING_CONFIRM_TIMEOUT_TOPIC = "MARKETPLACE_BOOKING_CONFIRM_TIMEOUT";