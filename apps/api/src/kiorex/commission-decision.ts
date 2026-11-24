import { AcquisitionOrigin, BookingSource, CommissionDecisionKind, Prisma } from "@prisma/client";
import { computeInputsHash } from "../growth/acquisition-contract";
import { isCommissionChargeableBooking } from "../appointments/booking-attribution";

/**
 * GRW-P1-D2 commission decision (ARCH 6.7). Pure, deterministic, versioned. It decides nothing new about money: it EXPLAINS the existing rules
 * (new patient, Kiorex source, follow-up) and adds ONE way to be non-chargeable (origin PROVIDER_LED). Evidence can only remove a fee, never add one.
 */
export const COMMISSION_POLICY_ID = "CP1";

/**
 * Policy version = policy id + the effective date of the newest fee rate IN FORCE at attendance (validFrom <= at < validTo), read from the existing
 * KiorexCommissionRate rows. When a rate is superseded or ended the version changes, so a re-check-in under new rates appends a fresh decision.
 */
export function commissionPolicyVersion(rates: ReadonlyArray<{ validFrom: Date; validTo?: Date | null }>, at: Date): string {
  let best: Date | null = null;
  for (const r of rates) if (r.validFrom <= at && (!r.validTo || r.validTo > at) && (!best || r.validFrom > best)) best = r.validFrom;
  return `${COMMISSION_POLICY_ID}@${best ? best.toISOString().slice(0, 10) : "base"}`;
}

export const DECISION_REASON = {
  PROVIDER_LED: "PROVIDER_LED",
  CLINIC_LINK_CHANNEL: "CLINIC_LINK_CHANNEL",
  FOLLOW_UP_VISIT: "FOLLOW_UP_VISIT",
  RETURNING_PATIENT: "RETURNING_PATIENT",
  SOURCE_NOT_COMMISSIONABLE: "SOURCE_NOT_COMMISSIONABLE",
  NO_RATE_CONFIGURED: "NO_RATE_CONFIGURED",
  NO_MARKET: "NO_MARKET",
  KIOREX_NEW_PATIENT: "KIOREX_NEW_PATIENT",
  MARKETPLACE_ORIGIN: "MARKETPLACE_ORIGIN",
  UNATTRIBUTED_TREATED_AS_MARKETPLACE: "UNATTRIBUTED_TREATED_AS_MARKETPLACE",
  PROVIDER_LED_EVIDENCE: "PROVIDER_LED_EVIDENCE",
  MANUAL_OVERRIDE: "MANUAL_OVERRIDE",
} as const;

export interface GateInput {
  origin: AcquisitionOrigin | null | undefined;
  bookingSource: BookingSource;
  isNewPatient: boolean | null | undefined;
  /** BR55: care-plan visit number > 1. */
  followUpVisit: boolean;
}

/** Ordered, de-duplicated reasons; CHARGE only when none of the exclusion reasons apply. Same input => same output. */
export function decideCommissionGate(i: GateInput): { decision: "CHARGE" | "NO_CHARGE"; reasonCodes: string[] } {
  const r: string[] = [];
  if (i.origin === AcquisitionOrigin.PROVIDER_LED) r.push(DECISION_REASON.PROVIDER_LED);
  if (i.bookingSource === BookingSource.CLINIC_LINK) r.push(DECISION_REASON.CLINIC_LINK_CHANNEL);
  if (i.followUpVisit) r.push(DECISION_REASON.FOLLOW_UP_VISIT);
  if (!i.isNewPatient) r.push(DECISION_REASON.RETURNING_PATIENT);
  if (i.bookingSource !== BookingSource.CLINIC_LINK && !isCommissionChargeableBooking(i.bookingSource, true, null)) r.push(DECISION_REASON.SOURCE_NOT_COMMISSIONABLE);
  if (r.length) return { decision: "NO_CHARGE", reasonCodes: r };
  return { decision: "CHARGE", reasonCodes: [DECISION_REASON.KIOREX_NEW_PATIENT, i.origin === AcquisitionOrigin.MARKETPLACE ? DECISION_REASON.MARKETPLACE_ORIGIN : DECISION_REASON.UNATTRIBUTED_TREATED_AS_MARKETPLACE] };
}

export interface DecisionRowInput {
  tenantId: string;
  clinicId: string;
  appointmentId: string;
  policyVersion: string;
  origin: AcquisitionOrigin;
  bookingSource: BookingSource;
  isNewPatient: boolean;
  followUpVisit: boolean;
  decision: CommissionDecisionKind;
  reasonCodes: string[];
  rateId?: string | null;
  amount?: string | null;
  currency?: string | null;
  /** Anything else that influenced the outcome (fee base, attribution evidence hash). Included in the hash. */
  extra?: Record<string, unknown>;
}

export function decisionInputsHash(i: DecisionRowInput): string {
  return computeInputsHash({
    booking: {
      appointmentId: i.appointmentId,
      origin: i.origin,
      bookingSource: i.bookingSource,
      isNewPatient: i.isNewPatient,
      followUpVisit: i.followUpVisit,
      decision: i.decision,
      reasonCodes: i.reasonCodes,
      rateId: i.rateId ?? null,
      amount: i.amount ?? null,
      ...(i.extra ?? {}),
    },
    touches: [],
    policyVersion: i.policyVersion,
  });
}

/**
 * Append-only, idempotent write: `ON CONFLICT DO NOTHING` on (appointmentId, policyVersion), so retries and concurrent check-ins write one row and the
 * first outcome for a policy version stands. Returns the stored row (the existing one on a retry).
 */
export async function writeCommissionDecision(tx: Prisma.TransactionClient, i: DecisionRowInput) {
  await tx.kiorexCommissionDecision.createMany({
    data: [
      {
        tenantId: i.tenantId,
        clinicId: i.clinicId,
        appointmentId: i.appointmentId,
        policyVersion: i.policyVersion,
        origin: i.origin,
        bookingSource: i.bookingSource,
        isNewPatient: i.isNewPatient,
        decision: i.decision,
        reasonCodes: i.reasonCodes,
        rateId: i.rateId ?? null,
        amount: i.amount != null ? new Prisma.Decimal(i.amount) : null,
        currency: i.currency ?? null,
        inputsHash: decisionInputsHash(i),
      },
    ],
    skipDuplicates: true,
  });
  return tx.kiorexCommissionDecision.findUniqueOrThrow({ where: { appointmentId_policyVersion: { appointmentId: i.appointmentId, policyVersion: i.policyVersion } } });
}

/** Market handling of cancelled / no-show / refunded visits (`featureDefaults.kiorex.commissionHandling`); defaults equal today's behaviour. */
export interface CommissionHandling {
  /** REVERSE (default): a cancelled or no-show visit reverses its charge. KEEP: the charge stands. */
  cancelledNoShow: "REVERSE" | "KEEP";
  /** CREDIT (default): reversing an already-BILLED charge grants the wallet credit. NONE: no credit. */
  refunded: "CREDIT" | "NONE";
}
export const DEFAULT_COMMISSION_HANDLING: CommissionHandling = { cancelledNoShow: "REVERSE", refunded: "CREDIT" };

export function resolveCommissionHandling(featureDefaults: unknown): CommissionHandling {
  const root = featureDefaults && typeof featureDefaults === "object" && !Array.isArray(featureDefaults) ? (featureDefaults as Record<string, unknown>) : {};
  const k = root.kiorex && typeof root.kiorex === "object" ? (root.kiorex as Record<string, unknown>) : {};
  const h = k.commissionHandling && typeof k.commissionHandling === "object" ? (k.commissionHandling as Record<string, unknown>) : {};
  return {
    cancelledNoShow: h.cancelledNoShow === "KEEP" ? "KEEP" : "REVERSE",
    refunded: h.refunded === "NONE" ? "NONE" : "CREDIT",
  };
}
