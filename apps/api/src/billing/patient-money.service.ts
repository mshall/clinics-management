import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PaymentMethod, Prisma, RevenueStatus } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { resolveClinicCurrency } from "../common/clinic-currency";
import { postRevenue } from "../compliance/post-revenue";
import { resolveMarketForTenant } from "../markets/market-resolver";
import { PrismaService } from "../prisma/prisma.service";
import {
  DEPOSIT_APPLIED_REVENUE_CATEGORY,
  DEPOSIT_STATUS,
  PACKAGE_SESSION_REVENUE_CATEGORY,
  PACKAGE_STATUS,
  REFUND_REVENUE_CATEGORY,
  REFUND_STATUS,
  canApproveRefunds,
  canHandlePatientMoney,
  isPackageExpired,
  lockKey,
  packageSessionValue,
  refundApprovalThreshold,
  refundNeedsApproval,
  refundableRemaining,
  roundMoney,
} from "./patient-money";

type Tx = Prisma.TransactionClient;

export type CreateRefundBody = {
  paymentId?: string;
  revenueEntryId?: string;
  amount: number;
  method?: PaymentMethod;
  reason: string;
};

export type SellPackageBody = {
  clinicId: string;
  patientId: string;
  nameEn: string;
  nameAr?: string;
  totalSessions: number;
  paidAmount: number;
  method: PaymentMethod;
  expiresOn?: string | null;
};

export type TakeDepositBody = {
  clinicId: string;
  patientId: string;
  appointmentId?: string | null;
  amount: number;
  method: PaymentMethod;
};

/** Methods staff can pick; KIOREX_PAY only ever arrives from Kiorex itself. */
const PAYMENT_METHODS = new Set<string>(Object.values(PaymentMethod).filter((m) => m !== PaymentMethod.KIOREX_PAY));

function money(n: number): Prisma.Decimal {
  return new Prisma.Decimal(String(roundMoney(n)));
}

function assertPositive(n: unknown, field: string): number {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) throw new BadRequestException(`${field} must be a positive amount`);
  return roundMoney(v);
}

function assertMethod(m: unknown): PaymentMethod {
  if (typeof m !== "string" || !PAYMENT_METHODS.has(m)) throw new BadRequestException("Unknown payment method");
  return m as PaymentMethod;
}


@Injectable()
export class PatientMoneyService {
  constructor(private readonly prisma: PrismaService) {}

  private assertDesk(user: JwtUser) {
    if (!canHandlePatientMoney(user)) throw new ForbiddenException("Your role cannot record patient money");
  }

  private async assertPatientAndClinic(tenantId: string, patientId: string, clinicId: string) {
    const [patient, clinic] = await Promise.all([
      this.prisma.patient.findFirst({ where: { id: patientId, tenantId }, select: { id: true } }),
      this.prisma.clinic.findFirst({ where: { id: clinicId, tenantId }, select: { id: true } }),
    ]);
    if (!patient) throw new NotFoundException("Patient not found");
    if (!clinic) throw new NotFoundException("Clinic not found");
  }

  // ─── Refunds ───────────────────────────────────────────────────────────────

  async createRefund(tenantId: string, user: JwtUser, body: CreateRefundBody) {
    this.assertDesk(user);
    const amount = assertPositive(body.amount, "amount");
    const reason = body.reason?.trim();
    if (!reason) throw new BadRequestException("A refund reason is required");
    if (Boolean(body.paymentId) === Boolean(body.revenueEntryId)) {
      throw new BadRequestException("Refund exactly one of paymentId or revenueEntryId");
    }
    const market = await resolveMarketForTenant(this.prisma, tenantId);
    const threshold = refundApprovalThreshold(market.providerConfig);
    const approver = canApproveRefunds(user);

    return this.prisma.$transaction(async (tx) => {
      const source = await this.loadRefundSource(tx, tenantId, body);
      await lockKey(tx, `refund:${source.key}`);
      const prior = await tx.billingRefund.findMany({
        where: { tenantId, ...(source.paymentId ? { paymentId: source.paymentId } : { revenueEntryId: source.revenue!.id }) },
        select: { amount: true, status: true },
      });
      const remaining = refundableRemaining(
        source.amount,
        prior.map((p) => ({ amount: Number(p.amount), status: p.status })),
      );
      if (amount > remaining) {
        throw new BadRequestException({
          message: `Refund exceeds the refundable balance (${remaining})`,
          code: "REFUND_EXCEEDS_BALANCE",
          remaining,
        });
      }
      const method = body.method ? assertMethod(body.method) : source.method;
      const needsApproval = refundNeedsApproval(amount, threshold, approver);
      const refund = await tx.billingRefund.create({
        data: {
          tenantId,
          clinicId: source.clinicId,
          patientId: source.patientId,
          paymentId: source.paymentId,
          revenueEntryId: source.revenue?.id ?? null,
          amount: money(amount),
          currency: source.currency,
          method,
          reason,
          status: needsApproval ? REFUND_STATUS.PENDING_APPROVAL : REFUND_STATUS.COMPLETED,
          requestedByUserId: user.userId,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: user.userId,
          clinicId: source.clinicId,
          action: needsApproval ? "REFUND_REQUESTED" : "REFUND_COMPLETED",
          resource: "BillingRefund",
          resourceId: refund.id,
          metadata: { amount, threshold, method, reason, paymentId: body.paymentId ?? null, revenueEntryId: body.revenueEntryId ?? null },
        },
      });
      if (needsApproval) return { ...refund, approvalThreshold: threshold };
      return this.completeRefund(tx, refund.id, user.userId, source);
    });
  }

  /**
   * Resolves what is being refunded. A revenue row that belongs to a payment allocation is refunded against
   * that payment, so the payment and its revenue rows share one refundable balance.
   */
  private async loadRefundSource(tx: Tx, tenantId: string, body: CreateRefundBody) {
    let paymentId = body.paymentId ?? null;
    if (!paymentId && body.revenueEntryId) {
      const alloc = await tx.billingPaymentAllocation.findFirst({
        where: { revenueEntryId: body.revenueEntryId, payment: { tenantId } },
        select: { paymentId: true },
      });
      paymentId = alloc?.paymentId ?? null;
    }
    if (paymentId) {
      const p = await tx.billingPayment.findFirst({
        where: { id: paymentId, tenantId },
        include: { allocations: { orderBy: { amount: "desc" } } },
      });
      if (!p) throw new NotFoundException("Payment not found");
      const revenueId = body.revenueEntryId ?? p.allocations.find((a) => a.revenueEntryId)?.revenueEntryId ?? null;
      const revenue = revenueId ? await this.revenueLink(tx, tenantId, revenueId) : null;
      const alloc = body.revenueEntryId ? p.allocations.find((a) => a.revenueEntryId === body.revenueEntryId) : p.allocations[0];
      return {
        key: `payment:${p.id}`,
        paymentId: p.id as string | null,
        clinicId: p.clinicId,
        patientId: p.patientId,
        amount: Number(p.totalAmount),
        currency: p.currency,
        method: alloc?.method ?? PaymentMethod.CASH,
        revenue,
        invoiceId: p.invoiceId,
      };
    }
    const r = await tx.revenueEntry.findFirst({
      where: { id: body.revenueEntryId!, tenantId, status: RevenueStatus.POSTED },
      include: {
        appointment: { select: { patientId: true } },
        encounter: { select: { patientId: true } },
        operation: { select: { patientId: true } },
      },
    });
    if (!r || Number(r.grossAmount) <= 0 || r.category === REFUND_REVENUE_CATEGORY) {
      throw new NotFoundException("Collected revenue entry not found");
    }
    const patientId = r.appointment?.patientId ?? r.encounter?.patientId ?? r.operation?.patientId;
    if (!patientId) throw new BadRequestException("This revenue entry is not linked to a patient");
    const method = r.collectionMode === "MONEY_TRANSFER" ? PaymentMethod.TRANSFER : PaymentMethod.CASH;
    return {
      key: `revenue:${r.id}`,
      paymentId: null as string | null,
      clinicId: r.clinicId,
      patientId,
      amount: Number(r.grossAmount),
      currency: r.currency,
      method,
      revenue: {
        id: r.id,
        gross: Number(r.grossAmount),
        tax: Number(r.taxAmount),
        appointmentId: r.appointmentId,
        encounterId: r.encounterId,
        operationId: r.operationId,
      },
      invoiceId: null as string | null,
    };
  }

  private async revenueLink(tx: Tx, tenantId: string, revenueEntryId: string) {
    const r = await tx.revenueEntry.findFirst({ where: { id: revenueEntryId, tenantId } });
    if (!r) return null;
    return {
      id: r.id,
      gross: Number(r.grossAmount),
      tax: Number(r.taxAmount),
      appointmentId: r.appointmentId,
      encounterId: r.encounterId,
      operationId: r.operationId,
    };
  }

  /** Posts the single revenue reversal + single cash movement + credit note for a refund. */
  private async completeRefund(
    tx: Tx,
    refundId: string,
    approverId: string,
    source: Awaited<ReturnType<PatientMoneyService["loadRefundSource"]>>,
  ) {
    const refund = await tx.billingRefund.findUniqueOrThrow({ where: { id: refundId } });
    const amount = Number(refund.amount);
    const rev = source.revenue;
    const tax = rev && rev.gross > 0 ? roundMoney((rev.tax * amount) / rev.gross) : 0;
    const { revenueEntryId } = await postRevenue(tx, {
      tenantId: refund.tenantId,
      clinicId: refund.clinicId,
      category: REFUND_REVENUE_CATEGORY,
      description: `Refund: ${refund.reason}`.slice(0, 500),
      grossAmount: -amount,
      taxAmount: -tax,
      netAmount: -roundMoney(amount - tax),
      currency: refund.currency,
      patientId: refund.patientId,
      appointmentId: rev?.appointmentId ?? null,
      encounterId: rev?.encounterId ?? null,
      operationId: rev?.operationId ?? null,
    });
    const movement = await tx.cashMovement.create({
      data: {
        tenantId: refund.tenantId,
        clinicId: refund.clinicId,
        patientId: refund.patientId,
        direction: "OUT",
        method: refund.method,
        amount: refund.amount,
        currency: refund.currency,
        sourceType: "REFUND",
        sourceId: refund.id,
        cashierUserId: refund.requestedByUserId,
      },
    });
    const note = await tx.creditNote.create({
      data: {
        tenantId: refund.tenantId,
        clinicId: refund.clinicId,
        patientId: refund.patientId,
        invoiceId: source.invoiceId,
        amount: refund.amount,
        currency: refund.currency,
        reason: refund.reason,
        approvedByUserId: approverId,
      },
    });
    return tx.billingRefund.update({
      where: { id: refund.id },
      data: {
        status: REFUND_STATUS.COMPLETED,
        approvedByUserId: approverId,
        decidedAt: new Date(),
        reversalRevenueEntryId: revenueEntryId,
        cashMovementId: movement.id,
        creditNoteId: note.id,
      },
    });
  }

  async decideRefund(tenantId: string, user: JwtUser, refundId: string, decision: "approve" | "reject", note?: string) {
    if (!canApproveRefunds(user)) throw new ForbiddenException("Only owners, admins and finance can approve refunds");
    return this.prisma.$transaction(async (tx) => {
      const pending = await tx.billingRefund.findFirst({ where: { id: refundId, tenantId } });
      if (!pending) throw new NotFoundException("Refund not found");
      if (pending.requestedByUserId === user.userId) throw new ForbiddenException("You cannot approve your own refund");
      const claimed = await tx.billingRefund.updateMany({
        where: { id: refundId, tenantId, status: REFUND_STATUS.PENDING_APPROVAL },
        data: { decidedAt: new Date(), approvedByUserId: user.userId, ...(decision === "reject" ? { status: REFUND_STATUS.REJECTED } : {}) },
      });
      if (claimed.count !== 1) throw new BadRequestException({ message: "Refund is not waiting for approval", code: "REFUND_NOT_PENDING" });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: user.userId,
          clinicId: pending.clinicId,
          action: decision === "approve" ? "REFUND_APPROVED" : "REFUND_REJECTED",
          resource: "BillingRefund",
          resourceId: refundId,
          metadata: { amount: Number(pending.amount), note: note?.trim() || null },
        },
      });
      if (decision === "reject") return tx.billingRefund.findUniqueOrThrow({ where: { id: refundId } });
      const source = await this.loadRefundSource(tx, tenantId, {
        paymentId: pending.paymentId ?? undefined,
        revenueEntryId: pending.revenueEntryId ?? undefined,
        amount: Number(pending.amount),
        reason: pending.reason,
      });
      return this.completeRefund(tx, refundId, user.userId, source);
    });
  }

  async listRefunds(tenantId: string, user: JwtUser, status?: string, clinicId?: string) {
    this.assertDesk(user);
    const items = await this.prisma.billingRefund.findMany({
      where: { tenantId, ...(status ? { status } : {}), ...(clinicId ? { clinicId } : {}) },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return { items: items.map((r) => ({ ...r, amount: Number(r.amount) })) };
  }

  // ─── Packages ──────────────────────────────────────────────────────────────

  async sellPackage(tenantId: string, user: JwtUser, body: SellPackageBody) {
    this.assertDesk(user);
    await this.assertPatientAndClinic(tenantId, body.patientId, body.clinicId);
    const totalSessions = Math.floor(Number(body.totalSessions));
    if (!Number.isFinite(totalSessions) || totalSessions < 1 || totalSessions > 500) {
      throw new BadRequestException("totalSessions must be between 1 and 500");
    }
    const paidAmount = assertPositive(body.paidAmount, "paidAmount");
    const method = assertMethod(body.method);
    const nameEn = body.nameEn?.trim();
    if (!nameEn) throw new BadRequestException("Package name is required");
    const expiresOn = body.expiresOn ? new Date(body.expiresOn) : null;
    if (expiresOn && Number.isNaN(expiresOn.getTime())) throw new BadRequestException("Invalid expiresOn");
    const currency = await resolveClinicCurrency(this.prisma, tenantId, body.clinicId);

    return this.prisma.$transaction(async (tx) => {
      const sample = await tx.patient.findFirst({ where: { id: body.patientId, isSample: true }, select: { id: true } });
      if (sample) throw new BadRequestException({ message: "Sample patient — payments are not recorded for demo data", code: "SAMPLE_PATIENT_NO_REVENUE" });
      const pkg = await tx.patientServicePackage.create({
        data: {
          tenantId,
          patientId: body.patientId,
          clinicId: body.clinicId,
          nameEn,
          nameAr: body.nameAr?.trim() ?? "",
          totalSessions,
          sessionsRemaining: totalSessions,
          paidAmount: money(paidAmount),
          currency,
          expiresOn,
          paymentMethod: method,
          soldByUserId: user.userId,
        },
      });
      await tx.cashMovement.create({
        data: {
          tenantId,
          clinicId: body.clinicId,
          patientId: body.patientId,
          direction: "IN",
          method,
          amount: money(paidAmount),
          currency,
          sourceType: "PACKAGE_SALE",
          sourceId: pkg.id,
          cashierUserId: user.userId,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: user.userId,
          clinicId: body.clinicId,
          action: "PACKAGE_SOLD",
          resource: "PatientServicePackage",
          resourceId: pkg.id,
          metadata: { totalSessions, paidAmount, method, expiresOn: body.expiresOn ?? null },
        },
      });
      return pkg;
    });
  }

  async consumePackage(tenantId: string, user: JwtUser, packageId: string, body: { appointmentId?: string | null }) {
    this.assertDesk(user);
    return this.prisma.$transaction(async (tx) => {
      await lockKey(tx, `package:${packageId}`);
      const pkg = await tx.patientServicePackage.findFirst({ where: { id: packageId, tenantId } });
      if (!pkg) throw new NotFoundException("Package not found");
      if (pkg.status !== PACKAGE_STATUS.ACTIVE || pkg.sessionsRemaining <= 0) {
        throw new BadRequestException({ message: "No sessions left on this package", code: "PACKAGE_EXHAUSTED" });
      }
      if (isPackageExpired(pkg.expiresOn)) {
        throw new BadRequestException({ message: "This package has expired", code: "PACKAGE_EXPIRED" });
      }
      let appointmentId: string | null = null;
      if (body.appointmentId) {
        const apt = await tx.appointment.findFirst({
          where: { id: body.appointmentId, tenantId, patientId: pkg.patientId },
          select: { id: true },
        });
        if (!apt) throw new NotFoundException("Appointment not found for this patient");
        appointmentId = apt.id;
      }
      const value = packageSessionValue(Number(pkg.paidAmount), pkg.totalSessions, pkg.sessionsRemaining);
      const clinicId = pkg.clinicId ?? (await tx.clinic.findFirstOrThrow({ where: { tenantId }, select: { id: true } })).id;
      let revenueEntryId: string | null = null;
      if (value > 0) {
        ({ revenueEntryId } = await postRevenue(tx, {
          tenantId,
          clinicId,
          category: PACKAGE_SESSION_REVENUE_CATEGORY,
          description: `Package session: ${pkg.nameEn}`.slice(0, 500),
          grossAmount: value,
          taxAmount: 0,
          netAmount: value,
          currency: pkg.currency,
          patientId: pkg.patientId,
          appointmentId,
        }));
      }
      const remaining = pkg.sessionsRemaining - 1;
      const updated = await tx.patientServicePackage.update({
        where: { id: pkg.id },
        data: { sessionsRemaining: remaining, ...(remaining === 0 ? { status: PACKAGE_STATUS.EXHAUSTED } : {}) },
      });
      const consumption = await tx.patientPackageConsumption.create({
        data: { tenantId, packageId: pkg.id, appointmentId, amount: money(value), revenueEntryId, consumedByUserId: user.userId },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: user.userId,
          clinicId,
          action: "PACKAGE_SESSION_CONSUMED",
          resource: "PatientServicePackage",
          resourceId: pkg.id,
          metadata: { appointmentId, value, sessionsRemaining: remaining },
        },
      });
      return { package: updated, consumption: { ...consumption, amount: value } };
    });
  }

  /** Cancels a package and returns the unused value in cash. Unused value was never revenue, so nothing is reversed. */
  async cancelPackage(tenantId: string, user: JwtUser, packageId: string, body: { reason: string; method?: PaymentMethod }) {
    if (!canApproveRefunds(user)) throw new ForbiddenException("Only owners, admins and finance can cancel packages");
    const reason = body.reason?.trim();
    if (!reason) throw new BadRequestException("A reason is required");
    return this.prisma.$transaction(async (tx) => {
      await lockKey(tx, `package:${packageId}`);
      const pkg = await tx.patientServicePackage.findFirst({ where: { id: packageId, tenantId }, include: { consumptions: true } });
      if (!pkg) throw new NotFoundException("Package not found");
      if (pkg.status === PACKAGE_STATUS.CANCELLED) throw new BadRequestException("Package already cancelled");
      const used = pkg.consumptions.reduce((s, c) => s + Number(c.amount), 0);
      const unused = Math.max(0, roundMoney(Number(pkg.paidAmount) - used));
      const clinicId = pkg.clinicId ?? (await tx.clinic.findFirstOrThrow({ where: { tenantId }, select: { id: true } })).id;
      if (unused > 0) {
        await tx.cashMovement.create({
          data: {
            tenantId,
            clinicId,
            patientId: pkg.patientId,
            direction: "OUT",
            method: body.method ? assertMethod(body.method) : (pkg.paymentMethod ?? PaymentMethod.CASH),
            amount: money(unused),
            currency: pkg.currency,
            sourceType: "PACKAGE_CANCEL",
            sourceId: pkg.id,
            cashierUserId: user.userId,
          },
        });
      }
      const updated = await tx.patientServicePackage.update({
        where: { id: pkg.id },
        data: { status: PACKAGE_STATUS.CANCELLED, sessionsRemaining: 0 },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: user.userId,
          clinicId,
          action: "PACKAGE_CANCELLED",
          resource: "PatientServicePackage",
          resourceId: pkg.id,
          metadata: { reason, unusedReturned: unused },
        },
      });
      return { package: updated, unusedReturned: unused };
    });
  }

  // ─── Deposits ──────────────────────────────────────────────────────────────

  async takeDeposit(tenantId: string, user: JwtUser, body: TakeDepositBody) {
    this.assertDesk(user);
    await this.assertPatientAndClinic(tenantId, body.patientId, body.clinicId);
    const amount = assertPositive(body.amount, "amount");
    const method = assertMethod(body.method);
    const currency = await resolveClinicCurrency(this.prisma, tenantId, body.clinicId);
    return this.prisma.$transaction(async (tx) => {
      const sample = await tx.patient.findFirst({ where: { id: body.patientId, isSample: true }, select: { id: true } });
      if (sample) throw new BadRequestException({ message: "Sample patient — payments are not recorded for demo data", code: "SAMPLE_PATIENT_NO_REVENUE" });
      if (body.appointmentId) {
        const apt = await tx.appointment.findFirst({ where: { id: body.appointmentId, tenantId, patientId: body.patientId }, select: { id: true } });
        if (!apt) throw new NotFoundException("Appointment not found for this patient");
      }
      return this.recordHeldDeposit(tx, {
        tenantId,
        clinicId: body.clinicId,
        patientId: body.patientId,
        appointmentId: body.appointmentId ?? null,
        amount,
        currency,
        method,
        source: "CLINIC",
        actorId: user.userId,
      });
    });
  }

  /** Records a held deposit (liability) and the matching cash-in movement. Reused by Kiorex Pay and payment links. */
  async recordHeldDeposit(
    tx: Tx,
    p: {
      tenantId: string;
      clinicId: string;
      patientId: string;
      appointmentId: string | null;
      amount: number;
      currency: string;
      method: PaymentMethod;
      source: string;
      actorId: string | null;
      externalRef?: string | null;
    },
  ) {
    const deposit = await tx.patientDeposit.create({
      data: {
        tenantId: p.tenantId,
        clinicId: p.clinicId,
        patientId: p.patientId,
        appointmentId: p.appointmentId,
        amount: money(p.amount),
        currency: p.currency,
        method: p.method,
        source: p.source,
        status: DEPOSIT_STATUS.HELD,
        externalRef: p.externalRef ?? null,
        createdByUserId: p.actorId,
        paidAt: new Date(),
      },
    });
    await this.recordDepositInflowTx(tx, deposit, p.actorId);
    return deposit;
  }

  private async recordDepositInflowTx(
    tx: Tx,
    deposit: { id: string; tenantId: string; clinicId: string; patientId: string; appointmentId: string | null; amount: Prisma.Decimal; currency: string; method: PaymentMethod; source: string },
    actorId: string | null,
  ) {
    await tx.cashMovement.create({
      data: {
        tenantId: deposit.tenantId,
        clinicId: deposit.clinicId,
        patientId: deposit.patientId,
        direction: "IN",
        method: deposit.method,
        amount: deposit.amount,
        currency: deposit.currency,
        sourceType: "DEPOSIT",
        sourceId: deposit.id,
        cashierUserId: actorId,
      },
    });
    await tx.auditLog.create({
      data: {
        tenantId: deposit.tenantId,
        actorId,
        clinicId: deposit.clinicId,
        action: "DEPOSIT_TAKEN",
        resource: "PatientDeposit",
        resourceId: deposit.id,
        metadata: {
          amount: Number(deposit.amount),
          method: deposit.method,
          source: deposit.source,
          appointmentId: deposit.appointmentId,
        },
      },
    });
  }

  /** FS-04 — a deposit asked for through a payment link: no money yet, so no movement and no revenue. */
  async createPendingDepositTx(
    tx: Tx,
    p: {
      tenantId: string;
      clinicId: string;
      patientId: string;
      appointmentId: string;
      amount: number;
      currency: string;
      method: PaymentMethod;
      source: string;
      actorId: string | null;
      linkTokenHash: string;
      linkExpiresAt: Date;
      reasons: string[];
    },
  ) {
    const deposit = await tx.patientDeposit.create({
      data: {
        tenantId: p.tenantId,
        clinicId: p.clinicId,
        patientId: p.patientId,
        appointmentId: p.appointmentId,
        amount: money(p.amount),
        currency: p.currency,
        method: p.method,
        source: p.source,
        status: DEPOSIT_STATUS.PENDING,
        linkTokenHash: p.linkTokenHash,
        linkExpiresAt: p.linkExpiresAt,
        requirementReasons: p.reasons as Prisma.InputJsonValue,
        createdByUserId: p.actorId,
      },
    });
    await tx.auditLog.create({
      data: {
        tenantId: p.tenantId,
        actorId: p.actorId,
        clinicId: p.clinicId,
        action: "DEPOSIT_LINK_CREATED",
        resource: "PatientDeposit",
        resourceId: deposit.id,
        metadata: { amount: p.amount, source: p.source, appointmentId: p.appointmentId, reasons: p.reasons, expiresAt: p.linkExpiresAt.toISOString() },
      },
    });
    return deposit;
  }

  /**
   * FS-04 — the patient paid the link (desk confirmed a transfer, or Kiorex Pay called back): PENDING → HELD
   * with its cash-in movement. Replaying the same external reference is a no-op.
   */
  async markDepositPaidTx(
    tx: Tx,
    tenantId: string,
    actorId: string | null,
    depositId: string,
    p: { method: PaymentMethod; externalRef: string | null; paidAt?: Date },
  ) {
    await lockKey(tx, `deposit:${depositId}`);
    const deposit = await tx.patientDeposit.findFirst({ where: { id: depositId, tenantId } });
    if (!deposit) throw new NotFoundException("Deposit not found");
    if (deposit.status !== DEPOSIT_STATUS.PENDING) {
      if (p.externalRef && deposit.externalRef === p.externalRef) return deposit;
      throw new BadRequestException({
        message: "Only a deposit awaiting payment can be marked paid",
        code: deposit.status === DEPOSIT_STATUS.EXPIRED ? "DEPOSIT_LINK_EXPIRED" : "DEPOSIT_NOT_PENDING",
      });
    }
    if (p.externalRef) {
      const dup = await tx.patientDeposit.findFirst({
        where: { tenantId, source: deposit.source, externalRef: p.externalRef, NOT: { id: deposit.id } },
        select: { id: true },
      });
      if (dup) {
        throw new ConflictException({
          message: "This payment reference was already used for another deposit",
          code: "DEPOSIT_REFERENCE_DUPLICATE",
        });
      }
    }
    const updated = await tx.patientDeposit.update({
      where: { id: deposit.id },
      data: {
        status: DEPOSIT_STATUS.HELD,
        method: p.method,
        externalRef: p.externalRef,
        paidAt: p.paidAt ?? new Date(),
        linkTokenHash: null,
      },
    });
    await this.recordDepositInflowTx(tx, updated, actorId);
    return updated;
  }

  /** FS-04 — unpaid link ends: EXPIRED (ran out) or CANCELLED (appointment over / replaced). Nothing to reverse. */
  async voidPendingDepositTx(tx: Tx, tenantId: string, actorId: string | null, depositId: string, status: "EXPIRED" | "CANCELLED", reason: string) {
    const r = await tx.patientDeposit.updateMany({
      where: { id: depositId, tenantId, status: DEPOSIT_STATUS.PENDING },
      data: { status, releasedAt: new Date(), linkTokenHash: null },
    });
    if (r.count === 0) return false;
    const d = await tx.patientDeposit.findUniqueOrThrow({ where: { id: depositId }, select: { clinicId: true, amount: true, appointmentId: true } });
    await tx.auditLog.create({
      data: {
        tenantId,
        actorId,
        clinicId: d.clinicId,
        action: status === "EXPIRED" ? "DEPOSIT_LINK_EXPIRED" : "DEPOSIT_LINK_CANCELLED",
        resource: "PatientDeposit",
        resourceId: depositId,
        metadata: { amount: Number(d.amount), appointmentId: d.appointmentId, reason },
      },
    });
    return true;
  }

  parseDeskMethod(m: unknown): PaymentMethod {
    return assertMethod(m);
  }

  async applyDeposit(tenantId: string, user: JwtUser, depositId: string, body: { appointmentId?: string | null }) {
    this.assertDesk(user);
    return this.prisma.$transaction((tx) => this.applyDepositTx(tx, tenantId, user.userId, depositId, body.appointmentId ?? null));
  }

  /** Turns a held deposit into recognised revenue (via postRevenue). Idempotent per deposit. */
  async applyDepositTx(tx: Tx, tenantId: string, actorId: string | null, depositId: string, appointmentId: string | null) {
    await lockKey(tx, `deposit:${depositId}`);
    const deposit = await tx.patientDeposit.findFirst({ where: { id: depositId, tenantId } });
    if (!deposit) throw new NotFoundException("Deposit not found");
    if (deposit.status !== DEPOSIT_STATUS.HELD) {
      throw new BadRequestException({ message: "Only a held deposit can be applied", code: "DEPOSIT_NOT_HELD" });
    }
    const aptId = appointmentId ?? deposit.appointmentId;
    const amount = Number(deposit.amount);
    const { revenueEntryId } = await postRevenue(tx, {
      tenantId,
      clinicId: deposit.clinicId,
      category: DEPOSIT_APPLIED_REVENUE_CATEGORY,
      description: `Deposit applied (${deposit.source})`,
      grossAmount: amount,
      taxAmount: 0,
      netAmount: amount,
      currency: deposit.currency,
      patientId: deposit.patientId,
      appointmentId: aptId,
      collectionMode: deposit.method === PaymentMethod.CASH ? "CASH_ON_VISIT" : "MONEY_TRANSFER",
    });
    const updated = await tx.patientDeposit.update({
      where: { id: deposit.id },
      data: { status: DEPOSIT_STATUS.APPLIED, revenueEntryId, appliedAt: new Date(), appointmentId: aptId },
    });
    await tx.auditLog.create({
      data: {
        tenantId,
        actorId,
        clinicId: deposit.clinicId,
        action: "DEPOSIT_APPLIED",
        resource: "PatientDeposit",
        resourceId: deposit.id,
        metadata: { amount, revenueEntryId, appointmentId: aptId },
      },
    });
    return updated;
  }

  /**
   * Ends a held deposit without revenue: RELEASED returns the cash, FORFEITED keeps it and recognises it as
   * revenue (no-show fee) through postRevenue.
   */
  async releaseDepositTx(
    tx: Tx,
    tenantId: string,
    actorId: string | null,
    depositId: string,
    outcome: "RELEASED" | "FORFEITED",
    reason: string,
  ) {
    await lockKey(tx, `deposit:${depositId}`);
    const deposit = await tx.patientDeposit.findFirst({ where: { id: depositId, tenantId } });
    if (!deposit) throw new NotFoundException("Deposit not found");
    if (deposit.status !== DEPOSIT_STATUS.HELD) {
      throw new BadRequestException({ message: "Only a held deposit can be released", code: "DEPOSIT_NOT_HELD" });
    }
    const amount = Number(deposit.amount);
    let revenueEntryId: string | null = null;
    if (outcome === "RELEASED") {
      await tx.cashMovement.create({
        data: {
          tenantId,
          clinicId: deposit.clinicId,
          patientId: deposit.patientId,
          direction: "OUT",
          method: deposit.method,
          amount: deposit.amount,
          currency: deposit.currency,
          sourceType: "DEPOSIT_RELEASE",
          sourceId: deposit.id,
          cashierUserId: actorId,
        },
      });
    } else {
      ({ revenueEntryId } = await postRevenue(tx, {
        tenantId,
        clinicId: deposit.clinicId,
        category: "DEPOSIT_FORFEIT",
        description: `Deposit forfeited: ${reason}`.slice(0, 500),
        grossAmount: amount,
        taxAmount: 0,
        netAmount: amount,
        currency: deposit.currency,
        patientId: deposit.patientId,
        appointmentId: deposit.appointmentId,
      }));
    }
    const updated = await tx.patientDeposit.update({
      where: { id: deposit.id },
      data: { status: outcome, releasedAt: new Date(), ...(revenueEntryId ? { revenueEntryId } : {}) },
    });
    await tx.auditLog.create({
      data: {
        tenantId,
        actorId,
        clinicId: deposit.clinicId,
        action: outcome === "RELEASED" ? "DEPOSIT_RELEASED" : "DEPOSIT_FORFEITED",
        resource: "PatientDeposit",
        resourceId: deposit.id,
        metadata: { amount, reason, revenueEntryId },
      },
    });
    return updated;
  }

  async releaseDeposit(tenantId: string, user: JwtUser, depositId: string, body: { reason: string; outcome?: "RELEASED" | "FORFEITED" }) {
    if (!canApproveRefunds(user)) throw new ForbiddenException("Only owners, admins and finance can release deposits");
    const reason = body.reason?.trim();
    if (!reason) throw new BadRequestException("A reason is required");
    const outcome = body.outcome === "FORFEITED" ? "FORFEITED" : "RELEASED";
    return this.prisma.$transaction((tx) => this.releaseDepositTx(tx, tenantId, user.userId, depositId, outcome, reason));
  }

  // ─── Balances ──────────────────────────────────────────────────────────────

  async patientBalances(tenantId: string, user: JwtUser, patientId: string) {
    this.assertDesk(user);
    const patient = await this.prisma.patient.findFirst({ where: { id: patientId, tenantId }, select: { id: true, homeBranchId: true } });
    if (!patient) throw new NotFoundException("Patient not found");
    const [deposits, packages, refunds, creditNotes, payments, revenues] = await Promise.all([
      this.prisma.patientDeposit.findMany({ where: { tenantId, patientId }, orderBy: { createdAt: "desc" }, take: 50 }),
      this.prisma.patientServicePackage.findMany({
        where: { tenantId, patientId },
        orderBy: { createdAt: "desc" },
        include: { consumptions: { select: { amount: true } } },
      }),
      this.prisma.billingRefund.findMany({ where: { tenantId, patientId }, orderBy: { createdAt: "desc" }, take: 50 }),
      this.prisma.creditNote.findMany({ where: { tenantId, patientId }, orderBy: { createdAt: "desc" }, take: 50 }),
      this.prisma.billingPayment.findMany({
        where: { tenantId, patientId },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { allocations: true },
      }),
      this.prisma.revenueEntry.findMany({
        where: {
          tenantId,
          status: RevenueStatus.POSTED,
          grossAmount: { gt: 0 },
          category: { not: REFUND_REVENUE_CATEGORY },
          OR: [{ appointment: { patientId } }, { encounter: { patientId } }, { operation: { patientId } }],
        },
        orderBy: { postedAt: "desc" },
        take: 20,
      }),
    ]);
    const paymentRevenueIds = new Set(payments.flatMap((p) => p.allocations.map((a) => a.revenueEntryId).filter(Boolean)));
    const refundRows = refunds.map((r) => ({ amount: Number(r.amount), status: r.status, paymentId: r.paymentId, revenueEntryId: r.revenueEntryId }));
    const now = new Date();
    const held = deposits.filter((d) => d.status === DEPOSIT_STATUS.HELD);
    const pkgRows = packages.map((p) => {
      const used = p.consumptions.reduce((s, c) => s + Number(c.amount), 0);
      return {
        id: p.id,
        nameEn: p.nameEn,
        nameAr: p.nameAr,
        totalSessions: p.totalSessions,
        sessionsRemaining: p.sessionsRemaining,
        paidAmount: Number(p.paidAmount),
        unusedValue: p.status === PACKAGE_STATUS.CANCELLED ? 0 : Math.max(0, roundMoney(Number(p.paidAmount) - used)),
        currency: p.currency,
        expiresOn: p.expiresOn,
        expired: isPackageExpired(p.expiresOn, now),
        status: p.status,
        createdAt: p.createdAt,
      };
    });
    const refundable = [
      ...payments.map((p) => ({
        kind: "PAYMENT" as const,
        id: p.id,
        clinicId: p.clinicId,
        label: p.allocations.map((a) => a.method).join(" + "),
        amount: Number(p.totalAmount),
        currency: p.currency,
        at: p.createdAt,
        remaining: refundableRemaining(Number(p.totalAmount), refundRows.filter((r) => r.paymentId === p.id)),
      })),
      ...revenues.filter((r) => !paymentRevenueIds.has(r.id)).map((r) => ({
        kind: "REVENUE" as const,
        id: r.id,
        clinicId: r.clinicId,
        label: r.description ?? r.category,
        amount: Number(r.grossAmount),
        currency: r.currency,
        at: r.postedAt,
        remaining: refundableRemaining(Number(r.grossAmount), refundRows.filter((x) => x.revenueEntryId === r.id)),
      })),
    ]
      .filter((x) => x.remaining > 0)
      .sort((a, b) => b.at.getTime() - a.at.getTime());

    return {
      patientId,
      depositsHeld: roundMoney(held.reduce((s, d) => s + Number(d.amount), 0)),
      packagesUnusedValue: roundMoney(pkgRows.filter((p) => !p.expired).reduce((s, p) => s + p.unusedValue, 0)),
      deposits: deposits.map(({ linkTokenHash: _hash, ...d }) => ({ ...d, amount: Number(d.amount) })),
      packages: pkgRows,
      refunds: refunds.map((r) => ({ ...r, amount: Number(r.amount) })),
      creditNotes: creditNotes.map((c) => ({ ...c, amount: Number(c.amount) })),
      refundable,
      canApproveRefunds: canApproveRefunds(user),
    };
  }
}
