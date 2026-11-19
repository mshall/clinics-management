import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { AppointmentStatus, PaymentMethod, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { DEPOSIT_STATUS, lockKey, roundMoney } from "./patient-money";
import { PatientMoneyService } from "./patient-money.service";

type Tx = Prisma.TransactionClient;

const SCAN_MS = 60_000;

export type DepositOutcome = "APPLY" | "RELEASE" | "FORFEIT" | "WAIT";

/**
 * What happens to a held deposit given its appointment: attended → applied as a payment (revenue);
 * cancelled → returned when the policy decided it is refundable, otherwise kept; no-show → kept.
 */
export function depositOutcomeFor(
  appointment: { status: AppointmentStatus; depositRefundable: boolean | null } | null,
): DepositOutcome {
  if (!appointment) return "WAIT";
  switch (appointment.status) {
    case AppointmentStatus.CHECKED_IN:
    case AppointmentStatus.COMPLETED:
      return "APPLY";
    case AppointmentStatus.CANCELLED:
      return appointment.depositRefundable === false ? "FORFEIT" : "RELEASE";
    case AppointmentStatus.NO_SHOW:
      return "FORFEIT";
    default:
      return "WAIT";
  }
}

@Injectable()
export class DepositSettlementService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(DepositSettlementService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly money: PatientMoneyService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === "test") return;
    this.timer = setInterval(() => {
      void this.settleDue().catch((e) => this.log.warn(e instanceof Error ? e.message : String(e)));
    }, SCAN_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Settles every held deposit on an appointment according to its current status. Safe to call repeatedly. */
  async settleAppointmentDepositsTx(tx: Tx, tenantId: string, appointmentId: string, actorId: string | null) {
    await lockKey(tx, `deposit-settle:${appointmentId}`);
    const apt = await tx.appointment.findFirst({
      where: { id: appointmentId, tenantId },
      select: { id: true, status: true, depositRefundable: true, cancellationReason: true },
    });
    const outcome = depositOutcomeFor(apt);
    if (outcome === "WAIT") return { outcome, settled: 0 };
    const pending = await tx.patientDeposit.findMany({
      where: { tenantId, appointmentId, status: DEPOSIT_STATUS.PENDING },
      select: { id: true },
    });
    for (const d of pending) {
      await this.money.voidPendingDepositTx(tx, tenantId, actorId, d.id, "CANCELLED", `Appointment ${apt!.status.toLowerCase()} before the deposit was paid`);
    }
    const held = await tx.patientDeposit.findMany({
      where: { tenantId, appointmentId, status: DEPOSIT_STATUS.HELD },
      orderBy: { createdAt: "asc" },
    });
    for (const d of held) {
      if (outcome === "APPLY") {
        await this.convertToPaymentTx(tx, tenantId, d.id, appointmentId, actorId);
      } else {
        const reason =
          outcome === "RELEASE"
            ? `Appointment cancelled${apt?.cancellationReason ? `: ${apt.cancellationReason}` : ""}`
            : apt?.status === AppointmentStatus.NO_SHOW
              ? "No-show"
              : "Late cancellation (not refundable under clinic policy)";
        await this.money.releaseDepositTx(tx, tenantId, actorId, d.id, outcome === "RELEASE" ? "RELEASED" : "FORFEITED", reason);
      }
    }
    return { outcome, settled: held.length };
  }

  /** FS-04 — payment link paid (desk-confirmed transfer or Kiorex Pay callback), then settled if the visit already happened. */
  async markLinkPaid(
    tenantId: string,
    actorId: string | null,
    depositId: string,
    p: { method: PaymentMethod; externalRef: string | null; paidAt?: Date },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const d = await this.money.markDepositPaidTx(tx, tenantId, actorId, depositId, p);
      if (d.appointmentId) await this.settleAppointmentDepositsTx(tx, tenantId, d.appointmentId, actorId);
      return tx.patientDeposit.findUniqueOrThrow({ where: { id: d.id } });
    });
  }

  /** Held deposit → BillingPayment whose single allocation carries the deposit revenue (posted via postRevenue). */
  private async convertToPaymentTx(tx: Tx, tenantId: string, depositId: string, appointmentId: string, actorId: string | null) {
    const d = await tx.patientDeposit.findUniqueOrThrow({ where: { id: depositId } });
    const payment = await tx.billingPayment.create({
      data: {
        tenantId,
        clinicId: d.clinicId,
        patientId: d.patientId,
        totalAmount: d.amount,
        currency: d.currency,
        cashierUserId: actorId,
        allocations: { create: [{ method: d.method, amount: d.amount }] },
      },
      include: { allocations: true },
    });
    const applied = await this.money.applyDepositTx(tx, tenantId, actorId, d.id, appointmentId);
    await tx.billingPaymentAllocation.update({
      where: { id: payment.allocations[0]!.id },
      data: { revenueEntryId: applied.revenueEntryId },
    });
    await tx.patientDeposit.update({ where: { id: d.id }, data: { paymentId: payment.id } });
    return { paymentId: payment.id, amount: roundMoney(Number(d.amount)) };
  }

  /** Reconciler for status changes that happen outside the front desk (Kiorex cancel, WhatsApp, integrations). */
  async settleDue(batch = 100): Promise<number> {
    const apts = await this.prisma.$queryRaw<{ id: string; tenantId: string }[]>`
      SELECT DISTINCT a."id", a."tenantId"
      FROM "PatientDeposit" d
      JOIN "Appointment" a ON a."id" = d."appointmentId"
      WHERE d."status" = ${DEPOSIT_STATUS.HELD}
        AND a."status"::text IN ('CHECKED_IN', 'COMPLETED', 'CANCELLED', 'NO_SHOW')
      LIMIT ${batch}`;
    let n = 0;
    for (const a of apts) {
      try {
        const r = await this.prisma.$transaction((tx) => this.settleAppointmentDepositsTx(tx, a.tenantId, a.id, null));
        n += r.settled;
      } catch (e) {
        this.log.warn(`deposit settle ${a.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return n;
  }
}
