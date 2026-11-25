import type { Prisma, SponsoredPromotion, SponsoredPromotionVersion } from "@prisma/client";
import { OutboxEventService } from "../messaging/outbox-event.service";

type Tx = Prisma.TransactionClient;
/** Outbox types of the promotion flows (contracts 1.12.0 event schemas; the outbox adds `aggregateType` and `aggregateId`). */
export const PROMOTION_EVENT = {
  UPDATED: "PROVIDER_PROMOTION_UPDATED",
  RESERVED: "SponsoredDiscountReserved",
  DEBITED: "SponsoredDiscountDebited",
  RELEASED: "SponsoredDiscountReleased",
  REVERSED: "SponsoredDiscountReversed",
} as const;
export const PROMOTION_AGGREGATE = "SponsoredPromotion";

/** The projection Kiorex keeps to quote and show "Discount sponsored by <clinic>". Public advertising text only; no budget, no wallet, no patient data. */
export function updatedPayload(p: Pick<SponsoredPromotion, "id" | "tenantId" | "status">, v: SponsoredPromotionVersion, clinicId: string | null, at = new Date(), extra?: { reviewKinds?: string[] }): Record<string, unknown> {
  const scope = v.scope as { doctorIds?: string[]; appointmentTypeIds?: string[]; careTypes?: string[] };
  return {
    promotionId: p.id, version: v.version, orgRef: p.tenantId, ...(clinicId ? { clinicId } : {}), status: p.status,
    discount: { kind: v.discountKind, value: v.discountValue, ...(v.maxPerBookingMinor ? { maxPerBookingMinor: v.maxPerBookingMinor } : {}) },
    scope: { doctorIds: scope.doctorIds ?? [], appointmentTypeIds: scope.appointmentTypeIds ?? [], careTypes: scope.careTypes ?? [] },
    startsAt: v.startsAt.toISOString(), endsAt: v.endsAt.toISOString(), patientCopy: { ar: v.patientCopyAr, en: v.patientCopyEn }, contentHash: v.contentHash, at: at.toISOString(),
    // additive fields the Kiorex review and quote need (contracts 1.12.1 request): the cap a reviewer weighs, the non-clinical eligibility rules, the funding mode, the reviews this version needs and the promotion name
    budgetCapMinor: v.budgetCapMinor, perPatientLimit: v.perPatientLimit, eligibility: v.eligibility, fundingMode: v.fundingMode,
    name: { ar: v.nameAr, en: v.nameEn }, ...(extra?.reviewKinds ? { reviewKinds: extra.reviewKinds } : {}),
  };
}

export interface DiscountEventFacts { promotionId: string; version: number; reservationRef: string; bookingRef: string; amountMinor: number; currency: string; reason?: string }
export const discountPayload = (f: DiscountEventFacts, at = new Date()): Record<string, unknown> => ({ ...f, at: at.toISOString() });

export async function enqueuePromotionEvent(outbox: OutboxEventService, tx: Tx, tenantId: string, type: string, promotionId: string, payload: Record<string, unknown>) {
  await outbox.enqueueEvent({ tenantId, type, aggregateType: PROMOTION_AGGREGATE, aggregateId: promotionId, payload }, tx);
}
