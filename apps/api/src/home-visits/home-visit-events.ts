/**
 * Pure builders for the Rev 2.3 outbox payloads (`data` of the contract envelope). Each is validated against the
 * kiorex-contracts 1.5.0 JSON Schema in `home-visit-events.node.test.ts`. By contract these payloads NEVER carry an
 * address, coordinates, a phone number, a patient name or free text.
 */
export type AbortReasonCategory = "THREAT_OR_VIOLENCE" | "UNSAFE_ENVIRONMENT" | "PATIENT_IMPAIRED_OR_AGGRESSIVE" | "OTHER";
export const ABORT_REASON_CATEGORIES: readonly AbortReasonCategory[] = ["THREAT_OR_VIOLENCE", "UNSAFE_ENVIRONMENT", "PATIENT_IMPAIRED_OR_AGGRESSIVE", "OTHER"];

const iso = (d: Date) => d.toISOString();

type Base = { appointmentId: string; clinicId: string; externalReference: string | null };

export function homeVisitAssignedData(i: Base & { clinicianId: string; displayName: string; photoUrl?: string | null; badge?: string | null; profession?: string | null; assignedAt: Date }) {
  return {
    appointmentId: i.appointmentId,
    clinicId: i.clinicId,
    externalReference: i.externalReference,
    serviceLocation: "HOME" as const,
    assignee: {
      clinicianId: i.clinicianId,
      displayName: i.displayName,
      photoUrl: i.photoUrl ?? null,
      badge: i.badge ?? null,
      ...(i.profession ? { profession: i.profession } : {}),
    },
    assignedAt: iso(i.assignedAt),
  };
}

export function homeVisitEnRouteData(i: Base & { enRouteAt: Date; etaMinutes?: number | null }) {
  return {
    appointmentId: i.appointmentId,
    clinicId: i.clinicId,
    externalReference: i.externalReference,
    serviceLocation: "HOME" as const,
    enRouteAt: iso(i.enRouteAt),
    ...(i.etaMinutes != null ? { etaMinutes: Math.max(0, Math.min(480, Math.round(i.etaMinutes))) } : {}),
  };
}

/** BR61 — never a no-show, deposit held for review (never auto-forfeit). Reason is a category, never free text. */
export function homeVisitAbortedUnsafeData(i: Base & { abortedAt: Date; reasonCategory: AbortReasonCategory; district?: string | null }) {
  return {
    appointmentId: i.appointmentId,
    clinicId: i.clinicId,
    externalReference: i.externalReference,
    serviceLocation: "HOME" as const,
    abortedAt: iso(i.abortedAt),
    reasonCategory: i.reasonCategory,
    noShow: false as const,
    depositAction: "HOLD_FOR_REVIEW" as const,
    ...(i.district ? { district: i.district } : {}),
  };
}

export type SafetyAlertEventKind = "TIMER_EXPIRED" | "SOS" | "UNSAFE_ABORT";

/** KX-09 §04 — delivered <= 60 s to the org safety contact; Kiorex ops also notified for Kiorex bookings. */
export function safetyAlertRaisedData(i: { alertId: string; clinicId: string; appointmentId: string; externalReference: string | null; kind: SafetyAlertEventKind; raisedAt: Date; district?: string | null; kiorexBooking: boolean }) {
  return {
    alertId: i.alertId,
    clinicId: i.clinicId,
    appointmentId: i.appointmentId,
    externalReference: i.externalReference,
    kind: i.kind,
    raisedAt: iso(i.raisedAt),
    deliverTo: i.kiorexBooking ? (["ORG_SAFETY_CONTACT", "KIOREX_OPS"] as const) : (["ORG_SAFETY_CONTACT"] as const),
    deliverWithinSeconds: 60 as const,
    ...(i.district ? { district: i.district } : {}),
  };
}

export function carePlanConfirmedData(i: { carePlanId: string; clinicId: string; requestRef?: string | null; confirmedAt: Date; visits: { appointmentId: string; startsAt: Date; endsAt: Date }[] }) {
  return {
    carePlanId: i.carePlanId,
    clinicId: i.clinicId,
    requestRef: i.requestRef ?? null,
    edition: "NURSE" as const,
    confirmedAt: iso(i.confirmedAt),
    visits: i.visits.map((v) => ({ appointmentId: v.appointmentId, startsAt: iso(v.startsAt), endsAt: iso(v.endsAt) })),
  };
}

export type CarePlanEndReason = "COMPLETED" | "CANCELLED_BY_PATIENT" | "CANCELLED_BY_PROVIDER" | "EXPIRED";

export function carePlanEndedData(i: { carePlanId: string; clinicId: string; requestRef?: string | null; endedAt: Date; reason: CarePlanEndReason; visitsCompleted: number; cancelledAppointmentIds: string[] }) {
  return {
    carePlanId: i.carePlanId,
    clinicId: i.clinicId,
    requestRef: i.requestRef ?? null,
    endedAt: iso(i.endedAt),
    reason: i.reason,
    visitsCompleted: i.visitsCompleted,
    cancelledAppointmentIds: i.cancelledAppointmentIds,
  };
}

/** KX-09 §04 / PT04 — ids and a consent token only; never diagnosis or notes. */
export function referralIssuedData(i: { referralId: string; fromClinicId: string; toClinicId?: string; toProfession?: string; patientRef: string; referrerId: string; consentToken: string; issuedAt: Date; expiresAt?: Date; secureLink?: string }) {
  return {
    referralId: i.referralId,
    fromClinicId: i.fromClinicId,
    ...(i.toClinicId ? { toClinicId: i.toClinicId } : {}),
    ...(i.toProfession ? { toProfession: i.toProfession } : {}),
    patientRef: i.patientRef,
    referrerId: i.referrerId,
    consentToken: i.consentToken,
    issuedAt: iso(i.issuedAt),
    ...(i.expiresAt ? { expiresAt: iso(i.expiresAt) } : {}),
    ...(i.secureLink ? { secureLink: i.secureLink } : {}),
  };
}

/** KX-09 §04 / BR57 — signed order version + expiry + consent token; the medicine lines travel only via the secure link. */
export function medicationOrderSharedData(i: { orderId: string; fromClinicId: string; toClinicId?: string; patientRef: string; prescriberId: string; orderVersion: number; signedAt: Date; expiresAt: Date; consentToken: string; secureLink?: string }) {
  return {
    orderId: i.orderId,
    fromClinicId: i.fromClinicId,
    ...(i.toClinicId ? { toClinicId: i.toClinicId } : {}),
    patientRef: i.patientRef,
    prescriberId: i.prescriberId,
    orderVersion: i.orderVersion,
    signedAt: iso(i.signedAt),
    expiresAt: iso(i.expiresAt),
    consentToken: i.consentToken,
    ...(i.secureLink ? { secureLink: i.secureLink } : {}),
  };
}

/** Map the free-text unsafe-abort reason the clinician typed to the closed category set (the text itself stays inside Kiorly). */
export function abortCategoryFrom(input: string | undefined | null): AbortReasonCategory {
  const v = (input ?? "").trim().toUpperCase();
  return (ABORT_REASON_CATEGORIES as readonly string[]).includes(v) ? (v as AbortReasonCategory) : "OTHER";
}
