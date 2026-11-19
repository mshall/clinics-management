import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { applyVisitBalancePayment } from "../common/visit-fee-ledger";
import { postRevenue } from "../compliance/post-revenue";
import { resolveMarketForTenant } from "../markets/market-resolver";
import { PrismaService } from "../prisma/prisma.service";
import { canHandlePatientMoney, lockKey, roundMoney } from "./patient-money";
import {
  collectionForAllocation,
  installmentReminderDaysBefore,
  installmentStatus,
  installmentsSettled,
  localDate,
  normalizeAllocations,
  type SplitAllocationInput,
  SplitPaymentError,
} from "./split-payment";

export type SplitTarget =
  | { kind: "VISIT"; encounterId: string }
  | { kind: "OPERATION"; operationId: string }
  | { kind: "SERVICE"; description: string };

export type SplitPaymentBody = {
  clinicId: string;
  patientId: string;
  allocations: SplitAllocationInput[];
  target: SplitTarget;
};

type Tx = Prisma.TransactionClient;

const LEDGER_ERRORS: Record<string, [string, string]> = {
  NO_VISIT_BALANCE: ["NO_VISIT_BALANCE", "No visit balance is due for this encounter"],
  VISIT_BALANCE_EXCEEDED: ["VISIT_BALANCE_EXCEEDED", "The parts add up to more than the visit balance"],
  ENCOUNTER_NOT_FOUND: ["ENCOUNTER_NOT_FOUND", "Encounter not found"],
};

/** MN-06 — split payments (one revenue row per method via postRevenue) and operation installment schedules. */
@Injectable()
export class SplitPaymentService {
  constructor(private readonly prisma: PrismaService) {}

  private assertDesk(user: JwtUser) {
    if (!canHandlePatientMoney(user)) throw new ForbiddenException("Your role cannot record patient money");
  }

  async record(tenantId: string, user: JwtUser, body: SplitPaymentBody) {
    this.assertDesk(user);
    let parsed: ReturnType<typeof normalizeAllocations>;
    try {
      parsed = normalizeAllocations(body.allocations);
    } catch (e) {
      if (e instanceof SplitPaymentError) throw new BadRequestException({ message: e.message, code: e.code });
      throw e;
    }
    const { allocations, total } = parsed;
    const target = body.target;
    if (!target || !["VISIT", "OPERATION", "SERVICE"].includes(target.kind)) {
      throw new BadRequestException({ message: "Say what the payment is for", code: "TARGET_REQUIRED" });
    }
    const [patient, clinic] = await Promise.all([
      this.prisma.patient.findFirst({ where: { id: body.patientId, tenantId }, select: { id: true } }),
      this.prisma.clinic.findFirst({ where: { id: body.clinicId, tenantId }, select: { id: true, taxRegistrationNumber: true, invoiceVatPercent: true } }),
    ]);
    if (!patient) throw new NotFoundException("Patient not found");
    if (!clinic) throw new NotFoundException("Clinic not found");
    const market = await resolveMarketForTenant(this.prisma, tenantId);

    return this.prisma.$transaction(async (tx) => {
      const ctx = await this.applyTarget(tx, tenantId, body, total, market.currency);
      const payment = await tx.billingPayment.create({
        data: {
          tenantId,
          clinicId: body.clinicId,
          patientId: body.patientId,
          totalAmount: new Prisma.Decimal(String(total)),
          currency: ctx.currency,
          cashierUserId: user.userId,
        },
      });
      const parts: { id: string; method: string; amount: number; revenueEntryId: string }[] = [];
      for (const a of allocations) {
        const collection = collectionForAllocation(a);
        const { revenueEntryId } = await postRevenue(tx, {
          tenantId,
          clinicId: body.clinicId,
          patientId: body.patientId,
          category: ctx.category,
          description: `${ctx.description} · ${a.method}`.slice(0, 500),
          grossAmount: a.amount,
          taxAmount: 0,
          netAmount: a.amount,
          currency: ctx.currency,
          encounterId: ctx.encounterId,
          appointmentId: ctx.appointmentId,
          operationId: ctx.operationId,
          collectionMode: collection.collectionMode,
          transferChannel: collection.transferChannel,
          transferReference: collection.transferReference,
          clinicTaxRin: clinic.taxRegistrationNumber,
          vatPercent: Number(clinic.invoiceVatPercent ?? 0),
        });
        const alloc = await tx.billingPaymentAllocation.create({
          data: { paymentId: payment.id, method: a.method, amount: new Prisma.Decimal(String(a.amount)), revenueEntryId },
        });
        parts.push({ id: alloc.id, method: a.method, amount: a.amount, revenueEntryId });
      }
      if (ctx.installmentIds.length) {
        await tx.operationInstallment.updateMany({
          where: { id: { in: ctx.installmentIds }, paidAt: null },
          data: { paidAt: new Date(), paymentId: payment.id },
        });
      }
      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: user.userId,
          clinicId: body.clinicId,
          action: "SPLIT_PAYMENT_RECORDED",
          resource: "BillingPayment",
          resourceId: payment.id,
          metadata: {
            target: target.kind,
            total,
            parts: parts.map((p) => ({ method: p.method, amount: p.amount, revenueEntryId: p.revenueEntryId })),
            installmentsPaid: ctx.installmentIds,
          } as Prisma.InputJsonValue,
        },
      });
      return {
        paymentId: payment.id,
        total,
        currency: ctx.currency,
        target: target.kind,
        allocations: parts,
        remainingBalance: ctx.remaining,
        installmentsPaid: ctx.installmentIds,
      };
    });
  }

  private async applyTarget(tx: Tx, tenantId: string, body: SplitPaymentBody, total: number, marketCurrency: string) {
    const t = body.target;
    if (t.kind === "VISIT") {
      const enc = await tx.encounter.findFirst({ where: { id: t.encounterId, tenantId }, select: { patientId: true } });
      if (!enc || enc.patientId !== body.patientId) throw new NotFoundException("Encounter not found for this patient");
      await lockKey(tx, `visit-balance:${t.encounterId}`);
      try {
        const r = await applyVisitBalancePayment(tx, { tenantId, encounterId: t.encounterId, amount: total });
        return {
          category: "VISIT_FEE",
          description: `Visit fee · encounter ${t.encounterId.slice(0, 8)}…`,
          currency: r.currency,
          encounterId: t.encounterId,
          appointmentId: r.appointmentId,
          operationId: null as string | null,
          remaining: r.remaining,
          installmentIds: [] as string[],
        };
      } catch (e) {
        const mapped = e instanceof Error ? LEDGER_ERRORS[e.message] : undefined;
        if (mapped) throw new BadRequestException({ message: mapped[1], code: mapped[0] });
        throw e;
      }
    }
    if (t.kind === "OPERATION") {
      await lockKey(tx, `operation-pay:${t.operationId}`);
      const op = await tx.operation.findFirst({
        where: { id: t.operationId, tenantId },
        select: { id: true, patientId: true, totalCost: true, paidAmount: true, feeCurrency: true, installments: true },
      });
      if (!op || op.patientId !== body.patientId) throw new NotFoundException("Operation not found for this patient");
      const balance = roundMoney(Number(op.totalCost) - Number(op.paidAmount));
      if (total > balance + 0.001) {
        throw new BadRequestException({ message: `The parts add up to more than the balance (${balance})`, code: "OPERATION_BALANCE_EXCEEDED", balance });
      }
      const newPaid = roundMoney(Number(op.paidAmount) + total);
      await tx.operation.update({ where: { id: op.id }, data: { paidAmount: new Prisma.Decimal(String(newPaid)) } });
      const installmentIds = installmentsSettled(
        op.installments.map((i) => ({ id: i.id, dueOn: i.dueOn, amount: Number(i.amount), paidAt: i.paidAt })),
        roundMoney(Number(op.totalCost) - newPaid),
      );
      return {
        category: "OPERATION_PAYMENT",
        description: `Operation payment · ${op.id.slice(0, 8)}…`,
        currency: op.feeCurrency,
        encounterId: null as string | null,
        appointmentId: null as string | null,
        operationId: op.id,
        remaining: roundMoney(balance - total),
        installmentIds,
      };
    }
    const description = t.description?.trim();
    if (!description) throw new BadRequestException({ message: "Describe the service being paid for", code: "DESCRIPTION_REQUIRED" });
    return {
      category: "SERVICE",
      description: description.slice(0, 200),
      currency: marketCurrency,
      encounterId: null as string | null,
      appointmentId: null as string | null,
      operationId: null as string | null,
      remaining: 0,
      installmentIds: [] as string[],
    };
  }

  // ─── Installments ──────────────────────────────────────────────────────────

  async listInstallments(tenantId: string, user: JwtUser, filter: { clinicId?: string; operationId?: string; status?: string }) {
    this.assertDesk(user);
    const market = await resolveMarketForTenant(this.prisma, tenantId);
    const days = installmentReminderDaysBefore(market.providerConfig);
    const today = localDate(new Date(), market.timezone);
    const rows = await this.prisma.operationInstallment.findMany({
      where: {
        tenantId,
        ...(filter.operationId ? { operationId: filter.operationId } : {}),
        ...(filter.clinicId ? { operation: { clinicId: filter.clinicId } } : {}),
        ...(filter.status === "OPEN" || filter.status === "OVERDUE" || filter.status === "DUE_SOON" ? { paidAt: null } : {}),
      },
      include: {
        operation: {
          select: {
            id: true,
            clinicId: true,
            feeCurrency: true,
            totalCost: true,
            paidAmount: true,
            patient: { select: { id: true, firstNameEn: true, lastNameEn: true, firstNameAr: true, lastNameAr: true, phone: true } },
          },
        },
      },
      orderBy: [{ dueOn: "asc" }],
      take: 500,
    });
    const out = rows.map((r) => {
      const dueOn = r.dueOn.toISOString().slice(0, 10);
      return {
        id: r.id,
        operationId: r.operationId,
        clinicId: r.operation.clinicId,
        patientId: r.operation.patient.id,
        patientName: `${r.operation.patient.firstNameEn} ${r.operation.patient.lastNameEn}`.trim(),
        patientNameAr: [r.operation.patient.firstNameAr, r.operation.patient.lastNameAr].filter(Boolean).join(" ") || null,
        hasPhone: Boolean(r.operation.patient.phone?.trim()),
        dueOn,
        amount: Number(r.amount),
        currency: r.operation.feeCurrency,
        operationBalance: roundMoney(Number(r.operation.totalCost) - Number(r.operation.paidAmount)),
        paidAt: r.paidAt?.toISOString() ?? null,
        paymentId: r.paymentId,
        reminderSentAt: r.reminderSentAt?.toISOString() ?? null,
        status: installmentStatus(dueOn, r.paidAt, today, days),
      };
    });
    if (filter.status === "OVERDUE" || filter.status === "DUE_SOON") return out.filter((r) => r.status === filter.status);
    return out;
  }

  /** Replaces the unpaid part of an operation's installment schedule; paid installments are kept. */
  async setSchedule(tenantId: string, user: JwtUser, operationId: string, rows: { dueOn: string; amount: number }[]) {
    this.assertDesk(user);
    if (!Array.isArray(rows)) throw new BadRequestException("rows must be an array");
    const clean = rows.map((r) => {
      const amount = roundMoney(Number(r.amount));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(r.dueOn ?? "")) || !Number.isFinite(amount) || amount <= 0) {
        throw new BadRequestException({ message: "Each installment needs a date and a positive amount", code: "INSTALLMENT_INVALID" });
      }
      return { dueOn: r.dueOn, amount };
    });
    return this.prisma.$transaction(async (tx) => {
      await lockKey(tx, `operation-pay:${operationId}`);
      const op = await tx.operation.findFirst({
        where: { id: operationId, tenantId },
        select: { id: true, clinicId: true, totalCost: true, paidAmount: true, installments: true },
      });
      if (!op) throw new NotFoundException("Operation not found");
      const paid = op.installments.filter((i) => i.paidAt);
      const balance = roundMoney(Number(op.totalCost) - Number(op.paidAmount));
      const sum = roundMoney(clean.reduce((s, r) => s + r.amount, 0));
      if (sum > balance + 0.01) {
        throw new BadRequestException({ message: `Installments add up to more than the balance (${balance})`, code: "INSTALLMENTS_EXCEED_BALANCE", balance });
      }
      const lastPaid = paid.reduce<string | null>((m, i) => {
        const d = i.dueOn.toISOString().slice(0, 10);
        return !m || d > m ? d : m;
      }, null);
      if (lastPaid && clean.some((r) => r.dueOn < lastPaid)) {
        throw new ConflictException({ message: "New installments must fall after the last paid one", code: "INSTALLMENT_BEFORE_PAID" });
      }
      await tx.operationInstallment.deleteMany({ where: { operationId, tenantId, paidAt: null } });
      for (const r of clean) {
        await tx.operationInstallment.create({
          data: { tenantId, operationId, dueOn: new Date(`${r.dueOn}T00:00:00Z`), amount: new Prisma.Decimal(String(r.amount)) },
        });
      }
      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: user.userId,
          clinicId: op.clinicId,
          action: "INSTALLMENT_SCHEDULE_SET",
          resource: "Operation",
          resourceId: operationId,
          metadata: { rows: clean, balance } as Prisma.InputJsonValue,
        },
      });
      return { operationId, balance, scheduled: sum, unscheduled: roundMoney(balance - sum) };
    });
  }
}
