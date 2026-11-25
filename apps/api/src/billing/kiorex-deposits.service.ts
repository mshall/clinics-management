import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PaymentMethod, Prisma } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { resolveClinicCurrency } from "../common/clinic-currency";
import { PrismaService } from "../prisma/prisma.service";
import { hashDepositLinkToken } from "./deposit-policy";
import { DepositSettlementService } from "./deposit-settlement.service";
import { DEPOSIT_STATUS, REFUND_STATUS, canApproveRefunds, roundMoney } from "./patient-money";
import { PatientMoneyService } from "./patient-money.service";

export const KIOREX_PAY_SOURCE = "KIOREX_PAY";
export const KIOREX_PAY_CHANNEL_KEY = "KIOREX_PAY";

export type DepositTender = { cardMinor?: number; patientCreditMinor?: number; sponsoredDiscountMinor?: number };
export type DepositPaidBody = { amount: number; currency?: string; paymentRef: string; paidAt?: string; tender?: DepositTender };

/**
 * Contracts 1.12.0 optional `tender` of the two deposit-paid calls: how the gross `amount` was funded (card, the patient's Kiorex credit, a clinic-sponsored discount).
 * The Clinic honours it by validating it (non-negative integers in minor units that add up to the gross amount, no other key) and recording it on the audit trail of the deposit; it never
 * changes the held amount or the fee. Absent means all card (the old behaviour). Returns the normalised tender or null.
 */
export function parseTender(raw: unknown, amountMajor: number): Required<DepositTender> | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) throw new BadRequestException({ message: "tender must be an object", code: "TENDER_INVALID" });
  const o = raw as Record<string, unknown>;
  for (const k of Object.keys(o)) if (!["cardMinor", "patientCreditMinor", "sponsoredDiscountMinor"].includes(k)) throw new BadRequestException({ message: `Unknown tender key ${k}`, code: "TENDER_INVALID" });
  const n = (k: string) => { const v = o[k] ?? 0; if (!Number.isInteger(v) || (v as number) < 0) throw new BadRequestException({ message: `${k} must be a non-negative integer of minor units`, code: "TENDER_INVALID" }); return v as number; };
  const t = { cardMinor: n("cardMinor"), patientCreditMinor: n("patientCreditMinor"), sponsoredDiscountMinor: n("sponsoredDiscountMinor") };
  if (t.cardMinor + t.patientCreditMinor + t.sponsoredDiscountMinor !== Math.round(amountMajor * 100)) throw new BadRequestException({ message: "tender must add up to the deposit amount", code: "TENDER_MISMATCH" });
  return t;
}
export type PayoutBody = {
  payoutRef: string;
  clinicId: string;
  amount: number;
  currency?: string;
  paidAt?: string;
  depositPaymentRefs?: string[];
  /** COM-1 (additive): commission Kiorex kept out of this payout; `amount` is the cash paid. */
  commissionDeducted?: number;
};

export type PayoutTotals = {
  collected: number;
  refunded: number;
  netDue: number;
  payoutsReceived: number;
  outstanding: number;
};

/** Deposits Kiorex collected minus what it refunded to patients, against what it actually paid the clinic. */
export function reconcilePayouts(input: {
  deposits: { amount: number }[];
  releasedDeposits: { amount: number }[];
  kiorexRefunds: { amount: number }[];
  payouts: { amount: number }[];
}): PayoutTotals {
  const sum = (xs: { amount: number }[]) => roundMoney(xs.reduce((s, x) => s + x.amount, 0));
  const collected = sum(input.deposits);
  const refunded = roundMoney(sum(input.releasedDeposits) + sum(input.kiorexRefunds));
  const netDue = roundMoney(collected - refunded);
  const payoutsReceived = sum(input.payouts);
  return { collected, refunded, netDue, payoutsReceived, outstanding: roundMoney(netDue - payoutsReceived) };
}

@Injectable()
export class KiorexDepositsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly money: PatientMoneyService,
    private readonly settlement: DepositSettlementService,
  ) {}

  /** Kiorex tells us the patient paid a deposit for a booking it made; idempotent on `paymentRef`. */
  async depositPaid(platformClientId: string, externalRef: string, body: DepositPaidBody) {
    const paymentRef = body.paymentRef?.trim();
    if (!paymentRef) throw new BadRequestException("paymentRef is required");
    const amount = roundMoney(Number(body.amount));
    if (!Number.isFinite(amount) || amount <= 0) throw new BadRequestException("amount must be positive");
    const apt = await this.prisma.appointment.findFirst({
      where: { platformIntegrationClientId: platformClientId, externalReference: externalRef.trim() },
      select: { id: true, tenantId: true, clinicId: true, patientId: true, feeAmount: true },
    });
    if (!apt) throw new NotFoundException("Booking not found");
    const tender = parseTender(body.tender, amount);
    const existing = await this.prisma.patientDeposit.findFirst({
      where: { tenantId: apt.tenantId, source: KIOREX_PAY_SOURCE, externalRef: paymentRef },
    });
    if (existing) return this.serialize(existing);
    if (apt.feeAmount != null && amount > Number(apt.feeAmount) + 0.001) {
      throw new BadRequestException({ message: "Deposit is larger than the visit fee", code: "DEPOSIT_EXCEEDS_FEE" });
    }
    const currency = await resolveClinicCurrency(this.prisma, apt.tenantId, apt.clinicId);
    if (body.currency?.trim() && body.currency.trim().toUpperCase() !== currency.toUpperCase()) {
      throw new BadRequestException({ message: `Deposit currency must be ${currency}`, code: "DEPOSIT_CURRENCY_MISMATCH" });
    }
    const pendingLink = await this.prisma.patientDeposit.findFirst({
      where: { tenantId: apt.tenantId, appointmentId: apt.id, source: KIOREX_PAY_SOURCE, status: DEPOSIT_STATUS.PENDING },
      orderBy: { createdAt: "desc" },
    });
    if (pendingLink && Math.abs(Number(pendingLink.amount) - amount) < 0.005) {
      return this.payPendingLink(apt.tenantId, pendingLink.id, paymentRef, body.paidAt, tender);
    }
    try {
      const deposit = await this.prisma.$transaction(async (tx) => {
        await this.ensureChannel(tx, apt.tenantId);
        const d = await this.money.recordHeldDeposit(tx, {
          tenantId: apt.tenantId,
          clinicId: apt.clinicId,
          patientId: apt.patientId,
          appointmentId: apt.id,
          amount,
          currency,
          method: PaymentMethod.KIOREX_PAY,
          source: KIOREX_PAY_SOURCE,
          actorId: null,
          externalRef: paymentRef,
        });
        await this.settlement.settleAppointmentDepositsTx(tx, apt.tenantId, apt.id, null);
        if (tender) await tx.auditLog.create({ data: { tenantId: apt.tenantId, actorId: null, clinicId: apt.clinicId, action: "KIOREX_DEPOSIT_TENDER", resource: "PatientDeposit", resourceId: d.id, metadata: { paymentRef, ...tender } } });
        return tx.patientDeposit.findUniqueOrThrow({ where: { id: d.id } });
      });
      return this.serialize(deposit);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const again = await this.prisma.patientDeposit.findFirst({
          where: { tenantId: apt.tenantId, source: KIOREX_PAY_SOURCE, externalRef: paymentRef },
        });
        if (again) return this.serialize(again);
      }
      throw e;
    }
  }

  /** FS-04 — Kiorex Pay collected a deposit-link payment (any booking source); idempotent on `paymentRef`. */
  async depositLinkPaid(token: string, body: DepositPaidBody) {
    const paymentRef = body.paymentRef?.trim();
    if (!paymentRef) throw new BadRequestException("paymentRef is required");
    const amount = roundMoney(Number(body.amount));
    if (!Number.isFinite(amount) || amount <= 0) throw new BadRequestException("amount must be positive");
    const tender = parseTender(body.tender, amount);
    const replay = await this.prisma.patientDeposit.findFirst({ where: { source: KIOREX_PAY_SOURCE, externalRef: paymentRef } });
    if (replay) return this.serialize(replay);
    const d = await this.prisma.patientDeposit.findUnique({ where: { linkTokenHash: hashDepositLinkToken(token.trim()) } });
    if (!d || d.source !== KIOREX_PAY_SOURCE) throw new NotFoundException("Payment link not found");
    if (Math.abs(Number(d.amount) - amount) >= 0.005) {
      throw new BadRequestException({ message: "Paid amount does not match the deposit", code: "DEPOSIT_AMOUNT_MISMATCH" });
    }
    if (body.currency?.trim() && body.currency.trim().toUpperCase() !== d.currency.toUpperCase()) {
      throw new BadRequestException({ message: `Deposit currency must be ${d.currency}`, code: "DEPOSIT_CURRENCY_MISMATCH" });
    }
    return this.payPendingLink(d.tenantId, d.id, paymentRef, body.paidAt, tender);
  }

  private async payPendingLink(tenantId: string, depositId: string, paymentRef: string, paidAtRaw?: string, tender?: Required<DepositTender> | null) {
    const paidAt = paidAtRaw ? new Date(paidAtRaw) : new Date();
    if (Number.isNaN(paidAt.getTime())) throw new BadRequestException("Invalid paidAt");
    await this.prisma.$transaction((tx) => this.ensureChannel(tx, tenantId));
    const d = await this.settlement.markLinkPaid(tenantId, null, depositId, {
      method: PaymentMethod.KIOREX_PAY,
      externalRef: paymentRef,
      paidAt,
    });
    if (tender) await this.prisma.auditLog.create({ data: { tenantId, actorId: null, clinicId: d.clinicId, action: "KIOREX_DEPOSIT_TENDER", resource: "PatientDeposit", resourceId: d.id, metadata: { paymentRef, ...tender } } });
    return this.serialize(d);
  }

  private async ensureChannel(tx: Prisma.TransactionClient, tenantId: string) {
    await tx.tenantPaymentChannel.upsert({
      where: { tenantId_channelKey: { tenantId, channelKey: KIOREX_PAY_CHANNEL_KEY } },
      create: { tenantId, channelKey: KIOREX_PAY_CHANNEL_KEY, name: "Kiorex Pay" },
      update: {},
    });
  }

  /** Kiorex reports a payout to the clinic; idempotent on `payoutRef`. */
  async recordPayout(body: PayoutBody) {
    const payoutRef = body.payoutRef?.trim();
    if (!payoutRef) throw new BadRequestException("payoutRef is required");
    const amount = roundMoney(Number(body.amount));
    if (!Number.isFinite(amount) || amount < 0) throw new BadRequestException("amount must be zero or more");
    const clinic = await this.prisma.clinic.findUnique({ where: { id: body.clinicId }, select: { id: true, tenantId: true } });
    if (!clinic) throw new NotFoundException("Clinic not found");
    const currency = body.currency?.trim() || (await resolveClinicCurrency(this.prisma, clinic.tenantId, clinic.id));
    const refs = (body.depositPaymentRefs ?? []).map((r) => r.trim()).filter(Boolean);
    const paidAt = body.paidAt ? new Date(body.paidAt) : new Date();
    if (Number.isNaN(paidAt.getTime())) throw new BadRequestException("Invalid paidAt");
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.kiorexPayout.findUnique({ where: { tenantId_payoutRef: { tenantId: clinic.tenantId, payoutRef } } });
      if (existing) return { ...existing, amount: Number(existing.amount) };
      const payout = await tx.kiorexPayout.create({
        data: { tenantId: clinic.tenantId, clinicId: clinic.id, payoutRef, amount: new Prisma.Decimal(String(amount)), commissionDeducted: new Prisma.Decimal(String(Math.max(0, roundMoney(Number(body.commissionDeducted ?? 0)) || 0))), currency, paidAt, depositRefs: refs },
      });
      if (refs.length) {
        await tx.patientDeposit.updateMany({
          where: { tenantId: clinic.tenantId, source: KIOREX_PAY_SOURCE, externalRef: { in: refs } },
          data: { payoutRef },
        });
      }
      await tx.auditLog.create({
        data: {
          tenantId: clinic.tenantId,
          actorId: null,
          clinicId: clinic.id,
          action: "KIOREX_PAYOUT_RECEIVED",
          resource: "KiorexPayout",
          resourceId: payout.id,
          metadata: { payoutRef, amount, currency, deposits: refs.length },
        },
      });
      return { ...payout, amount };
    });
  }

  async payoutReport(tenantId: string, user: JwtUser, q: { from?: string; to?: string; clinicId?: string }) {
    if (!canApproveRefunds(user)) throw new ForbiddenException("Only owners, admins and finance can see Kiorex payouts");
    const to = q.to ? new Date(q.to) : new Date();
    const from = q.from ? new Date(q.from) : new Date(to.getTime() - 30 * 86_400_000);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw new BadRequestException("Invalid range");
    const clinic = q.clinicId ? { clinicId: q.clinicId } : {};
    const range = { gte: from, lte: to };
    const [deposits, released, refunds, payouts] = await Promise.all([
      this.prisma.patientDeposit.findMany({
        where: {
          tenantId,
          source: KIOREX_PAY_SOURCE,
          status: { notIn: [DEPOSIT_STATUS.PENDING, DEPOSIT_STATUS.EXPIRED, DEPOSIT_STATUS.CANCELLED] },
          createdAt: range,
          ...clinic,
        },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.patientDeposit.findMany({
        where: { tenantId, source: KIOREX_PAY_SOURCE, status: DEPOSIT_STATUS.RELEASED, releasedAt: range, ...clinic },
        select: { amount: true },
      }),
      this.prisma.billingRefund.findMany({
        where: { tenantId, method: PaymentMethod.KIOREX_PAY, status: REFUND_STATUS.COMPLETED, decidedAt: range, ...clinic },
        select: { amount: true },
      }),
      this.prisma.kiorexPayout.findMany({ where: { tenantId, paidAt: range, ...clinic }, orderBy: { paidAt: "desc" } }),
    ]);
    const n = (x: { amount: Prisma.Decimal }) => ({ amount: Number(x.amount) });
    const totals = reconcilePayouts({
      deposits: deposits.map(n),
      releasedDeposits: released.map(n),
      kiorexRefunds: refunds.map(n),
      payouts: payouts.map(n),
    });
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      currency: deposits[0]?.currency ?? payouts[0]?.currency ?? null,
      totals,
      deposits: deposits.map((d) => this.serialize(d)),
      payouts: payouts.map((p) => ({ ...p, amount: Number(p.amount) })),
    };
  }

  private serialize<T extends { amount: Prisma.Decimal; linkTokenHash?: string | null }>(
    d: T,
  ): Omit<T, "amount" | "linkTokenHash"> & { amount: number } {
    const { linkTokenHash: _hash, amount, ...rest } = d;
    return { ...rest, amount: Number(amount) };
  }
}
