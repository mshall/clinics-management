import { AppointmentStatus } from "@prisma/client";
import {
  KIOREX_CANCELLATION_POLICY_DEFAULTS,
  kiorexCancellationPolicySchema,
  safeParseCommercialConfig,
  type KiorexCancellationPolicy,
} from "../markets/commercial-config.schema";

export const CANCELLED_BY = {
  PATIENT: "PATIENT",
  CLINIC: "CLINIC",
  SYSTEM: "SYSTEM",
} as const;

export const POLICY_ERROR = {
  CANCELLATION_WINDOW_CLOSED: "CANCELLATION_WINDOW_CLOSED",
  RESCHEDULE_WINDOW_CLOSED: "RESCHEDULE_WINDOW_CLOSED",
  RESCHEDULE_LIMIT_REACHED: "RESCHEDULE_LIMIT_REACHED",
  BOOKING_NOT_CHANGEABLE: "BOOKING_NOT_CHANGEABLE",
} as const;

const CHANGEABLE_STATUSES = new Set<AppointmentStatus>([AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED]);

const HOUR_MS = 3_600_000;

/** Market pack default, overlaid with the clinic's partial override (KX-06). */
export function resolveKiorexCancellationPolicy(
  marketCommercialConfig: unknown,
  clinicOverride: unknown,
): KiorexCancellationPolicy {
  const parsed = safeParseCommercialConfig(marketCommercialConfig);
  const base = (parsed.success && parsed.data.kiorex.cancellationPolicy) || KIOREX_CANCELLATION_POLICY_DEFAULTS;
  const override = kiorexCancellationPolicySchema.partial().safeParse(clinicOverride ?? {});
  return { ...base, ...(override.success ? override.data : {}) };
}

export function hoursUntil(startsAt: Date, now: Date): number {
  return (startsAt.getTime() - now.getTime()) / HOUR_MS;
}

export type PolicyDecision =
  | { allowed: true; depositRefundable: boolean }
  | { allowed: false; code: (typeof POLICY_ERROR)[keyof typeof POLICY_ERROR] };

export function evaluatePatientCancel(
  policy: KiorexCancellationPolicy,
  appt: { status: AppointmentStatus; startsAt: Date },
  now: Date,
): PolicyDecision {
  if (!CHANGEABLE_STATUSES.has(appt.status)) return { allowed: false, code: POLICY_ERROR.BOOKING_NOT_CHANGEABLE };
  const h = hoursUntil(appt.startsAt, now);
  if (h < policy.patientCancelMinHours) return { allowed: false, code: POLICY_ERROR.CANCELLATION_WINDOW_CLOSED };
  return { allowed: true, depositRefundable: h >= policy.depositRefundMinHours };
}

export function evaluatePatientReschedule(
  policy: KiorexCancellationPolicy,
  appt: { status: AppointmentStatus; startsAt: Date; rescheduleCount: number },
  now: Date,
): PolicyDecision {
  if (!CHANGEABLE_STATUSES.has(appt.status)) return { allowed: false, code: POLICY_ERROR.BOOKING_NOT_CHANGEABLE };
  if (hoursUntil(appt.startsAt, now) < policy.patientRescheduleMinHours) {
    return { allowed: false, code: POLICY_ERROR.RESCHEDULE_WINDOW_CLOSED };
  }
  if (appt.rescheduleCount >= policy.maxPatientReschedules) {
    return { allowed: false, code: POLICY_ERROR.RESCHEDULE_LIMIT_REACHED };
  }
  return { allowed: true, depositRefundable: true };
}
