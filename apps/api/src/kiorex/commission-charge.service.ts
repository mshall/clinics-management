import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { FeatureFlagsService, flagOn } from "../feature-flags/feature-flags-public";
import {
  AcquisitionOrigin,
  CommissionChargeStatus,
  CommissionDecisionKind,
  CommissionDisputeReason,
  CreditReason,
  Prisma,
  type KiorexCommissionCharge,
} from "@prisma/client";
import { recordLinkAttended } from "../growth/provider-links/link-attended";
import type { JwtUser } from "../auth/jwt-user";
import { parsePageParams } from "../common/pagination";
import { CreditWalletService } from "../credits/credit-wallet.service";
import { OutboxEventService } from "../messaging/outbox-event.service";
import { PrismaService } from "../prisma/prisma.service";
import { effectiveProfession } from "../scope-of-practice/scope-of-practice.service";
import { COMMISSION_ADJUSTED, COMMISSION_CHARGE_CREATED, COMMISSION_CHARGE_REVERSED } from "./commission-charge-topics";
import {
  DECISION_REASON,
  commissionPolicyVersion,
  decideCommissionGate,
  resolveCommissionHandling,
  writeCommissionDecision,
} from "./commission-decision";
import { isActiveCommissionChargeStatus } from "./commission-charge-status";
import { KiorexCommissionService } from "./kiorex-commission.service";
import { resolveDisputeDeadlineDays } from "./kiorex-commission-config";

const AUTO_CONFIRM_MS = 24 * 60 * 60 * 1000;

type Tx = Prisma.TransactionClient;

export type BilledReversalCreditIntent = {
  tenantId: string;
  amount: Prisma.Decimal;
  chargeId: string;
  appointmentId: string;
  reason: string;
};

export type KiorexCommissionChargeView = {
  id: string;
  appointmentId: string;
  attendedAt: string;
  confirmedAt: string | null;
  disputeDeadline: string;
  amount: string;
  currency: string;
  status: CommissionChargeStatus;
  clinicianName: string;
  patientInitials: string;
  reversalReason: string | null;
  canDispute: boolean;
  dispute?: {
    id: string;
    reason: string;
    status: string;
    note: string | null;
    resolution: string | null;
    createdAt: string;
    resolvedAt: string | null;
  } | null;
};

@Injectable()
export class CommissionChargeService {
  private readonly log = new Logger(CommissionChargeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly kiorexRates: KiorexCommissionService,
    private readonly outbox: OutboxEventService,
    private readonly creditWallet: CreditWalletService,
    @Optional() private readonly flags?: FeatureFlagsService,
  ) {}

  async onCheckIn(tx: Tx, tenantId: string, appointmentId: string, attendedAt: Date): Promise<void> {
    const apt = await tx.appointment.findFirst({
      where: { id: appointmentId, tenantId },
      select: {
        id: true,
        tenantId: true,
        clinicId: true,
        patientId: true,
        clinicianId: true,
        feeAmount: true,
        bookingSource: true,
        isNewPatientAtBooking: true,
        acquisitionOrigin: true,
        attributionJson: true,
        serviceLocation: true,
        patient: { select: { isSample: true } },
        clinic: { select: { defaultCurrency: true, tenant: { select: { marketId: true, market: { select: { id: true, featureDefaults: true } } } } } },
        clinician: { select: { profession: true, role: true, additionalRoles: true, employee: { select: { clinicalSpecialty: true } } } },
      },
    });
    if (!apt || apt.patient.isSample) return;
    // GRW-P1-D1: the first attended visit of a booking made through a provider link counts on that link (counters only; independent of commission).
    await recordLinkAttended(tx, apt, attendedAt);
    // BR55: only the FIRST attended visit is commissionable. A care-plan follow-up (sequence > 1) never is, whatever its booking source.
    const planVisit = await tx.carePlanVisit.findUnique({ where: { appointmentId }, select: { sequence: true } });
    const followUpVisit = Boolean(planVisit && planVisit.sequence > 1);
    // clinic.commission_settlement OFF: new commission charges stop; already-CONFIRMED charges still settle.
    if (!(await flagOn(this.flags, tenantId, "clinic.commission_settlement"))) return;

    const marketId = apt.clinic.tenant.marketId;
    const currency =
      apt.clinic.defaultCurrency?.trim() ||
      (await tx.tenant.findUnique({ where: { id: tenantId }, select: { baseCurrency: true } }))?.baseCurrency ||
      "EGP";
    const origin = apt.acquisitionOrigin ?? AcquisitionOrigin.UNATTRIBUTED;
    const isNew = Boolean(apt.isNewPatientAtBooking);
    const rows = marketId ? await tx.kiorexCommissionRate.findMany({ where: { marketId } }) : [];
    const policyVersion = commissionPolicyVersion(rows, attendedAt);
    const base = { tenantId, clinicId: apt.clinicId, appointmentId: apt.id, policyVersion, origin, bookingSource: apt.bookingSource, isNewPatient: isNew, followUpVisit, currency };

    // GRW-P1-D2: one append-only explanation per appointment and policy version, for BOTH outcomes ("why was I charged" / "why was I not").
    const gate = decideCommissionGate({ origin, bookingSource: apt.bookingSource, isNewPatient: isNew, followUpVisit });
    if (gate.decision === "NO_CHARGE") {
      await writeCommissionDecision(tx, { ...base, decision: CommissionDecisionKind.NO_CHARGE, reasonCodes: gate.reasonCodes });
      return;
    }
    if (!marketId) {
      await writeCommissionDecision(tx, { ...base, decision: CommissionDecisionKind.NO_CHARGE, reasonCodes: [DECISION_REASON.NO_MARKET] });
      return;
    }

    const specialty = apt.clinician.employee?.clinicalSpecialty ?? null;
    const visitFee = Number(apt.feeAmount);
    // BR56: the home surcharge is a separate field (Appointment.homeSurchargeAmount) and is never part of visitFee (S) or the commission base (C).
    const profession = effectiveProfession(apt.clinician);
    const resolved = this.kiorexRates.resolveForBooking(rows, specialty, visitFee, attendedAt, { profession, serviceLocation: apt.serviceLocation });
    if (!resolved.rate) {
      await writeCommissionDecision(tx, { ...base, decision: CommissionDecisionKind.NO_CHARGE, reasonCodes: [DECISION_REASON.NO_RATE_CONFIGURED] });
      return;
    }
    const amount = new Prisma.Decimal(resolved.commissionAmount.toFixed(2));
    await writeCommissionDecision(tx, {
      ...base,
      decision: CommissionDecisionKind.CHARGE,
      reasonCodes: gate.reasonCodes,
      rateId: resolved.rate.id,
      amount: amount.toFixed(2),
      extra: { visitFee: visitFee.toFixed(2) },
    });

    const disputeDays = resolveDisputeDeadlineDays(apt.clinic.tenant.market?.featureDefaults);
    const disputeDeadline = new Date(attendedAt);
    disputeDeadline.setDate(disputeDeadline.getDate() + disputeDays);

    const existing = await tx.kiorexCommissionCharge.findUnique({ where: { appointmentId } });
    if (existing) {
      if (isActiveCommissionChargeStatus(existing.status)) return;
      if (existing.status === CommissionChargeStatus.REVERSED || existing.status === CommissionChargeStatus.WAIVED) {
        const charge = await tx.kiorexCommissionCharge.update({
          where: { id: existing.id },
          data: {
            status: CommissionChargeStatus.PENDING,
            attendedAt,
            confirmedAt: null,
            disputeDeadline,
            rateId: resolved.rate.id,
            amount,
            currency,
            reversalReason: null,
          },
        });
        await this.auditCharge(tx, tenantId, "kiorex.commission_charge.reactivated", charge);
        await this.outbox.enqueue(
          tenantId,
          COMMISSION_CHARGE_CREATED,
          await this.outboxPayload(tx, charge),
          tx,
        );
      }
      return;
    }

    const charge = await tx.kiorexCommissionCharge.create({
      data: {
        tenantId,
        clinicId: apt.clinicId,
        appointmentId: apt.id,
        patientId: apt.patientId,
        clinicianId: apt.clinicianId,
        rateId: resolved.rate.id,
        amount,
        currency,
        status: CommissionChargeStatus.PENDING,
        attendedAt,
        disputeDeadline,
      },
    });
    await this.auditCharge(tx, tenantId, "kiorex.commission_charge.created", charge);
    await this.outbox.enqueue(tenantId, COMMISSION_CHARGE_CREATED, await this.outboxPayload(tx, charge), tx);
  }

  async onRevert(
    tx: Tx,
    tenantId: string,
    appointmentId: string,
    reason: string,
  ): Promise<BilledReversalCreditIntent | null> {
    return this.reverseActiveCharge(tx, tenantId, appointmentId, reason, { creditIfBilled: true });
  }

  async grantLateReversalCredit(intent: BilledReversalCreditIntent): Promise<void> {
    await this.creditWallet.grantInTransaction({
      tenantId: intent.tenantId,
      amount: intent.amount,
      reason: CreditReason.KIOREX_LATE_REVERSAL,
      note: `Kiorex commission reversal · appointment ${intent.appointmentId}`,
      sourceRef: intent.chargeId,
      metadata: {
        chargeId: intent.chargeId,
        appointmentId: intent.appointmentId,
        reversalReason: intent.reason,
      },
    });
  }

  async applyCreditIntents(intents: BilledReversalCreditIntent[]): Promise<void> {
    for (const intent of intents) {
      try {
        await this.grantLateReversalCredit(intent);
      } catch (e) {
        this.log.warn(e instanceof Error ? e.message : String(e));
      }
    }
  }

  async onComplete(tx: Tx, tenantId: string, appointmentId: string): Promise<void> {
    const charge = await tx.kiorexCommissionCharge.findFirst({
      where: { tenantId, appointmentId, status: CommissionChargeStatus.PENDING },
    });
    if (!charge) return;
    const confirmedAt = new Date();
    const updated = await tx.kiorexCommissionCharge.update({
      where: { id: charge.id },
      data: { status: CommissionChargeStatus.CONFIRMED, confirmedAt },
    });
    await this.auditCharge(tx, tenantId, "kiorex.commission_charge.confirmed", updated);
  }

  async onCancelOrNoShow(tx: Tx, tenantId: string, appointmentId: string): Promise<BilledReversalCreditIntent | null> {
    // GRW-P1-D2: configurable per market (`featureDefaults.kiorex.commissionHandling.cancelledNoShow`); the default REVERSE is today's behaviour.
    const handling = await this.handlingFor(tx, tenantId);
    if (handling.cancelledNoShow === "KEEP") return null;
    return this.reverseActiveCharge(tx, tenantId, appointmentId, "appointment_cancelled_or_no_show", {
      creditIfBilled: handling.refunded === "CREDIT",
    });
  }

  private async handlingFor(tx: Tx, tenantId: string) {
    const t = await tx.tenant.findUnique({ where: { id: tenantId }, select: { market: { select: { featureDefaults: true } } } });
    return resolveCommissionHandling(t?.market?.featureDefaults);
  }

  async onApprovedDispute(tx: Tx, tenantId: string, chargeId: string): Promise<BilledReversalCreditIntent | null> {
    const charge = await tx.kiorexCommissionCharge.findFirst({
      where: { id: chargeId, tenantId, status: CommissionChargeStatus.DISPUTED },
    });
    if (!charge) throw new NotFoundException("Disputed charge not found");
    const handling = await this.handlingFor(tx, tenantId);
    const intent = await this.reverseActiveCharge(tx, tenantId, charge.appointmentId, "dispute_approved", {
      creditIfBilled: handling.refunded === "CREDIT",
      fromStatus: CommissionChargeStatus.DISPUTED,
    });
    // GRW-P1-D2: a PROVIDER_LED_EVIDENCE dispute leaves its own append-only decision (origin PROVIDER_LED, NO_CHARGE) and a CommissionAdjusted event.
    const dispute = await tx.commissionDispute.findUnique({ where: { chargeId }, select: { reason: true } });
    if (dispute?.reason === CommissionDisputeReason.PROVIDER_LED_EVIDENCE) {
      await this.adjustToProviderLed(tx, tenantId, charge, DECISION_REASON.PROVIDER_LED_EVIDENCE, "PLE");
    }
    await tx.auditLog.create({
      data: {
        tenantId,
        action: "kiorex.commission_charge.dispute_approved",
        resource: "KiorexCommissionCharge",
        resourceId: chargeId,
        metadata: {
          appointmentId: charge.appointmentId,
          amount: charge.amount.toFixed(2),
        } as Prisma.InputJsonValue,
      },
    });
    return intent;
  }

  /**
   * Waive an active (PENDING / CONFIRMED / BILLED) charge for a platform-authorised reason without a dispute: GOODWILL_WAIVER or POLICY_CORRECTION.
   * Direction is removal only. Writes a new append-only decision (`<policy>+OVR<n>`), reverses through the same path as a dispute, emits CommissionAdjusted.
   */
  async onOverrideWaive(tx: Tx, tenantId: string, appointmentId: string, reason: string, actorId: string): Promise<BilledReversalCreditIntent | null> {
    const charge = await tx.kiorexCommissionCharge.findFirst({ where: { tenantId, appointmentId } });
    if (!charge || !isActiveCommissionChargeStatus(charge.status)) throw new BadRequestException("No active charge to waive for this appointment");
    const handling = await this.handlingFor(tx, tenantId);
    const prior = await tx.kiorexCommissionDecision.count({ where: { appointmentId, policyVersion: { contains: "+OVR" } } });
    const intent = await this.reverseActiveCharge(tx, tenantId, appointmentId, `override_${reason.toLowerCase()}`, { creditIfBilled: handling.refunded === "CREDIT" });
    await this.adjustToProviderOrWaived(tx, tenantId, charge, reason, `OVR${prior + 1}`, actorId);
    return intent;
  }

  /** PROVIDER_LED_EVIDENCE: the decision flips the origin to PROVIDER_LED (never the other way). */
  private async adjustToProviderLed(tx: Tx, tenantId: string, charge: KiorexCommissionCharge, reason: string, tag: string) {
    await tx.appointment.update({ where: { id: charge.appointmentId }, data: { acquisitionOrigin: AcquisitionOrigin.PROVIDER_LED } });
    await this.adjustToProviderOrWaived(tx, tenantId, charge, reason, tag, null, AcquisitionOrigin.PROVIDER_LED);
  }

  private async adjustToProviderOrWaived(
    tx: Tx,
    tenantId: string,
    charge: KiorexCommissionCharge,
    reason: string,
    tag: string,
    actorId: string | null,
    originOverride?: AcquisitionOrigin,
  ) {
    const apt = await tx.appointment.findUniqueOrThrow({
      where: { id: charge.appointmentId },
      select: { clinicId: true, bookingSource: true, isNewPatientAtBooking: true, acquisitionOrigin: true },
    });
    const prev = await tx.kiorexCommissionDecision.findFirst({ where: { appointmentId: charge.appointmentId }, orderBy: { createdAt: "desc" }, select: { policyVersion: true } });
    const root = (prev?.policyVersion ?? "CP1@base").split("+")[0]!;
    const origin = originOverride ?? apt.acquisitionOrigin ?? AcquisitionOrigin.UNATTRIBUTED;
    const decision = await writeCommissionDecision(tx, {
      tenantId,
      clinicId: apt.clinicId,
      appointmentId: charge.appointmentId,
      policyVersion: `${root}+${tag}`,
      origin,
      bookingSource: apt.bookingSource,
      isNewPatient: Boolean(apt.isNewPatientAtBooking),
      followUpVisit: false,
      decision: CommissionDecisionKind.NO_CHARGE,
      reasonCodes: [reason, ...(actorId ? [DECISION_REASON.MANUAL_OVERRIDE] : [])],
      currency: charge.currency,
      extra: { previousAmount: charge.amount.toFixed(2), chargeId: charge.id },
    });
    await tx.auditLog.create({
      data: {
        tenantId,
        actorId,
        action: "kiorex.commission_charge.adjusted",
        resource: "KiorexCommissionCharge",
        resourceId: charge.id,
        metadata: { appointmentId: charge.appointmentId, reason, decisionRef: decision.id, previousAmount: charge.amount.toFixed(2) } as Prisma.InputJsonValue,
      },
    });
    await this.outbox.enqueue(
      tenantId,
      COMMISSION_ADJUSTED,
      {
        chargeId: charge.id,
        appointmentId: charge.appointmentId,
        previousAmount: charge.amount.toFixed(2),
        adjustedAmount: "0.00",
        currency: charge.currency,
        reason,
        decisionRef: decision.id,
        origin: decision.origin,
        policyVersion: decision.policyVersion,
        adjustedAt: new Date().toISOString(),
      },
      tx,
    );
  }

  async beforeAppointmentDelete(tenantId: string, appointmentId: string): Promise<void> {
    const intent = await this.prisma.$transaction((tx) =>
      this.reverseActiveCharge(tx, tenantId, appointmentId, "appointment_deleted", { creditIfBilled: true }),
    );
    if (intent) await this.grantLateReversalCredit(intent);
  }

  async runAutoConfirmPending(): Promise<number> {
    const cutoff = new Date(Date.now() - AUTO_CONFIRM_MS);
    const pending = await this.prisma.kiorexCommissionCharge.findMany({
      where: { status: CommissionChargeStatus.PENDING, attendedAt: { lt: cutoff } },
      take: 200,
      select: { id: true, tenantId: true, appointmentId: true },
    });
    let confirmed = 0;
    for (const row of pending) {
      try {
        await this.prisma.$transaction(async (tx) => {
          const fresh = await tx.kiorexCommissionCharge.findFirst({
            where: { id: row.id, status: CommissionChargeStatus.PENDING },
          });
          if (!fresh || fresh.attendedAt >= cutoff) return;
          const updated = await tx.kiorexCommissionCharge.update({
            where: { id: row.id },
            data: { status: CommissionChargeStatus.CONFIRMED, confirmedAt: new Date() },
          });
          await this.auditCharge(tx, row.tenantId, "kiorex.commission_charge.auto_confirmed", updated);
          confirmed++;
        });
      } catch (e) {
        this.log.warn(e instanceof Error ? e.message : String(e));
      }
    }
    return confirmed;
  }

  async listForTenant(
    user: JwtUser,
    tenantId: string,
    opts?: { period?: string; status?: CommissionChargeStatus; page?: number; pageSize?: number },
  ) {
    if (user.tenantId !== tenantId) throw new ForbiddenException();
    const { page, pageSize, skip } = parsePageParams(
      opts?.page != null ? String(opts.page) : undefined,
      opts?.pageSize != null ? String(opts.pageSize) : undefined,
    );
    const where: Prisma.KiorexCommissionChargeWhereInput = { tenantId };
    if (opts?.status) where.status = opts.status;
    if (opts?.period?.trim()) {
      const [y, m] = opts.period.split("-").map((x) => Number(x));
      if (Number.isFinite(y) && Number.isFinite(m) && m >= 1 && m <= 12) {
        const start = new Date(Date.UTC(y, m - 1, 1));
        const end = new Date(Date.UTC(y, m, 1));
        where.attendedAt = { gte: start, lt: end };
      }
    }

    const [total, rows] = await Promise.all([
      this.prisma.kiorexCommissionCharge.count({ where }),
      this.prisma.kiorexCommissionCharge.findMany({
        where,
        orderBy: { attendedAt: "desc" },
        skip,
        take: pageSize,
        include: {
          clinician: { select: { displayName: true } },
          patient: { select: { firstNameEn: true, lastNameEn: true } },
          commissionDispute: true,
        },
      }),
    ]);

    const now = new Date();
    return {
      items: rows.map((r) => this.mapRow(r, now)),
      page,
      pageSize,
      total,
    };
  }

  mapRowPublic(
    row: KiorexCommissionCharge & {
      clinician: { displayName: string };
      patient: { firstNameEn: string; lastNameEn: string };
      commissionDispute?: {
        id: string;
        reason: string;
        status: string;
        note: string | null;
        resolution: string | null;
        createdAt: Date;
        resolvedAt: Date | null;
      } | null;
    },
    now: Date,
  ): KiorexCommissionChargeView {
    return this.mapRow(row, now);
  }

  private async reverseActiveCharge(
    tx: Tx,
    tenantId: string,
    appointmentId: string,
    reason: string,
    opts: { creditIfBilled: boolean; fromStatus?: CommissionChargeStatus },
  ): Promise<BilledReversalCreditIntent | null> {
    const charge = await tx.kiorexCommissionCharge.findFirst({ where: { tenantId, appointmentId } });
    if (!charge) return null;
    const allowedFrom = opts.fromStatus ?? null;
    if (allowedFrom && charge.status !== allowedFrom) return null;
    if (!isActiveCommissionChargeStatus(charge.status)) return null;

    const wasBilled = charge.status === CommissionChargeStatus.BILLED;
    const updated = await tx.kiorexCommissionCharge.update({
      where: { id: charge.id },
      data: {
        status: CommissionChargeStatus.REVERSED,
        reversalReason: reason,
        confirmedAt: null,
      },
    });
    await this.auditCharge(tx, tenantId, "kiorex.commission_charge.reversed", updated, { reason });
    await this.outbox.enqueue(tenantId, COMMISSION_CHARGE_REVERSED, { ...(await this.outboxPayload(tx, updated)), reason }, tx);

    if (wasBilled && opts.creditIfBilled) {
      return {
        tenantId,
        amount: charge.amount,
        chargeId: charge.id,
        appointmentId,
        reason,
      };
    }
    return null;
  }

  /** Additive contract 1.10.0 fields: the decision that explains the charge (latest append-only row). Absent when no decision exists (legacy). */
  private async outboxPayload(tx: Tx, charge: KiorexCommissionCharge): Promise<Record<string, unknown>> {
    const d = await tx.kiorexCommissionDecision.findFirst({ where: { appointmentId: charge.appointmentId }, orderBy: { createdAt: "desc" }, select: { id: true, origin: true, policyVersion: true } });
    return {
      ...(d ? { decisionRef: d.id, origin: d.origin, policyVersion: d.policyVersion } : {}),
      chargeId: charge.id,
      appointmentId: charge.appointmentId,
      amount: charge.amount.toFixed(2),
      currency: charge.currency,
      status: charge.status,
      attendedAt: charge.attendedAt.toISOString(),
    };
  }

  private async auditCharge(
    tx: Tx,
    tenantId: string,
    action: string,
    charge: KiorexCommissionCharge,
    extra?: Record<string, unknown>,
  ): Promise<void> {
    await tx.auditLog.create({
      data: {
        tenantId,
        action,
        resource: "KiorexCommissionCharge",
        resourceId: charge.id,
        metadata: {
          appointmentId: charge.appointmentId,
          amount: charge.amount.toFixed(2),
          currency: charge.currency,
          status: charge.status,
          ...extra,
        } as Prisma.InputJsonValue,
      },
    });
  }

  private mapRow(
    row: KiorexCommissionCharge & {
      clinician: { displayName: string };
      patient: { firstNameEn: string; lastNameEn: string };
      commissionDispute?: {
        id: string;
        reason: string;
        status: string;
        note: string | null;
        resolution: string | null;
        createdAt: Date;
        resolvedAt: Date | null;
      } | null;
    },
    now: Date,
  ): KiorexCommissionChargeView {
    const first = row.patient.firstNameEn?.trim()?.[0] ?? "";
    const last = row.patient.lastNameEn?.trim()?.[0] ?? "";
    const canDispute =
      !row.commissionDispute &&
      (row.status === CommissionChargeStatus.PENDING || row.status === CommissionChargeStatus.CONFIRMED) &&
      now <= row.disputeDeadline;
    const d = row.commissionDispute;
    return {
      id: row.id,
      appointmentId: row.appointmentId,
      attendedAt: row.attendedAt.toISOString(),
      confirmedAt: row.confirmedAt?.toISOString() ?? null,
      disputeDeadline: row.disputeDeadline.toISOString(),
      amount: row.amount.toFixed(2),
      currency: row.currency,
      status: row.status,
      clinicianName: row.clinician.displayName,
      patientInitials: `${first}${last}`.toUpperCase() || "—",
      reversalReason: row.reversalReason,
      canDispute,
      dispute: d
        ? {
            id: d.id,
            reason: d.reason,
            status: d.status,
            note: d.note,
            resolution: d.resolution,
            createdAt: d.createdAt.toISOString(),
            resolvedAt: d.resolvedAt?.toISOString() ?? null,
          }
        : null,
    };
  }
}
