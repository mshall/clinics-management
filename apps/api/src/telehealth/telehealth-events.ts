import { BookingSource, type Prisma } from "@prisma/client";
import { joinWindow } from "./telehealth-window";
import { patientJoinUrl } from "./telehealth-token";

/**
 * Outbox payloads for telehealth (ADR-039). Proposed contract schemas: Docs/contracts/telehealth-contract-change.md.
 * Carries ids only; the join URL is a bearer link, sent to Kiorex (the patient's own app) and INTERNAL consumers, never logged.
 */
export const TELEHEALTH_EVENT = {
  CREATED: "telehealth.session.created",
  STARTED: "telehealth.session.started",
  ENDED: "telehealth.session.ended",
  MISSED: "telehealth.session.missed",
} as const;

type SessionLike = { id: string; patientId: string; linkVersion: number; status: string; mode: string };
type AptLike = { id: string; clinicId: string; startsAt: Date; endsAt: Date | null; externalReference: string | null };

export function telehealthBlock(session: SessionLike, apt: Pick<AptLike, "startsAt" | "endsAt">) {
  const w = joinWindow(apt.startsAt, apt.endsAt);
  return {
    sessionId: session.id,
    status: session.status,
    mode: session.mode,
    linkVersion: session.linkVersion,
    joinUrl: patientJoinUrl(session),
    opensAt: w.opensAt.toISOString(),
    closesAt: w.closesAt.toISOString(),
  };
}

function base(session: SessionLike, apt: AptLike) {
  return {
    sessionId: session.id,
    appointmentId: apt.id,
    clinicId: apt.clinicId,
    externalReference: apt.externalReference,
    serviceLocation: "VIDEO" as const,
    visitType: "TELEHEALTH" as const,
  };
}

export const telehealthCreatedData = (s: SessionLike, a: AptLike) => ({ ...base(s, a), ...telehealthBlock(s, a) });
export const telehealthStartedData = (s: SessionLike, a: AptLike, startedAt: Date) => ({ ...base(s, a), status: s.status, startedAt: startedAt.toISOString() });
export const telehealthEndedData = (s: SessionLike, a: AptLike, i: { endedAt: Date; endReason: string; attended: boolean }) => ({
  ...base(s, a), status: s.status, endedAt: i.endedAt.toISOString(), endReason: i.endReason, attended: i.attended,
});
/** absentParty = who never showed. Doctor absent => appointment stays open for staff review and the patient is NOT charged. */
export const telehealthMissedData = (s: SessionLike, a: AptLike, i: { missedAt: Date; absentParty: "PATIENT" | "CLINICIAN" }) => ({
  ...base(s, a), status: s.status, missedAt: i.missedAt.toISOString(), absentParty: i.absentParty, patientCharged: false as const, needsStaffReview: i.absentParty === "CLINICIAN",
});

export function outboxTargetFor(bookingSource: BookingSource, platformIntegrationClientId: string | null): "KIOREX" | "INTERNAL" {
  return platformIntegrationClientId || bookingSource === BookingSource.KIOREX_MARKETPLACE || bookingSource === BookingSource.KIOREX_WHATSAPP ? "KIOREX" : "INTERNAL";
}

export async function enqueueTelehealthEvent(
  tx: Pick<Prisma.TransactionClient, "outboxEvent">,
  i: { tenantId: string; type: string; sessionId: string; data: Record<string, unknown>; bookingSource: BookingSource; platformIntegrationClientId: string | null },
): Promise<void> {
  await tx.outboxEvent.create({
    data: {
      tenantId: i.tenantId,
      type: i.type,
      aggregateType: "TelehealthSession",
      aggregateId: i.sessionId,
      payload: { ...i.data, aggregateType: "TelehealthSession", aggregateId: i.sessionId } as Prisma.InputJsonValue,
      target: outboxTargetFor(i.bookingSource, i.platformIntegrationClientId),
      status: "PENDING",
      attempts: 0,
      nextAttemptAt: new Date(),
    },
  });
}
