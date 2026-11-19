import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  ClaimBatchStatus,
  ClaimLineStatus,
  Prisma,
  RemittanceLineMatchStatus,
} from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { PrismaService } from "../prisma/prisma.service";
import { canApproveRefunds, canHandlePatientMoney, roundMoney } from "./patient-money";
import { matchRemittanceLines, PAYER_B2B_INVOICE_TOPIC } from "./claims";

const num = (d: Prisma.Decimal | number | null | undefined) => (d == null ? 0 : Number(d));

@Injectable()
export class ClaimsService {
  constructor(private readonly prisma: PrismaService) {}

  private assertFinance(user: JwtUser) {
    if (!canHandlePatientMoney(user) && !canApproveRefunds(user)) {
      throw new ForbiddenException("Your role cannot manage claims");
    }
  }

  listPayers(tenantId: string) {
    return this.prisma.payerCompany.findMany({
      where: { tenantId, active: true },
      orderBy: { nameEn: "asc" },
      include: { _count: { select: { contractPrices: true, claimBatches: true } } },
    });
  }

  async upsertPayer(
    tenantId: string,
    user: JwtUser,
    body: { id?: string; nameEn: string; nameAr?: string; contractRef?: string; active?: boolean },
  ) {
    this.assertFinance(user);
    if (!body.nameEn?.trim()) throw new BadRequestException("nameEn is required");
    if (body.id) {
      const existing = await this.prisma.payerCompany.findFirst({ where: { id: body.id, tenantId } });
      if (!existing) throw new NotFoundException("Payer not found");
      return this.prisma.payerCompany.update({
        where: { id: body.id },
        data: {
          nameEn: body.nameEn.trim(),
          nameAr: body.nameAr?.trim() ?? existing.nameAr,
          contractRef: body.contractRef ?? existing.contractRef,
          active: body.active ?? existing.active,
        },
      });
    }
    return this.prisma.payerCompany.create({
      data: {
        tenantId,
        nameEn: body.nameEn.trim(),
        nameAr: body.nameAr?.trim() ?? "",
        contractRef: body.contractRef ?? null,
        active: body.active ?? true,
      },
    });
  }

  listBatches(tenantId: string, opts: { payerCompanyId?: string; status?: ClaimBatchStatus } = {}) {
    return this.prisma.claimBatch.findMany({
      where: {
        tenantId,
        ...(opts.payerCompanyId ? { payerCompanyId: opts.payerCompanyId } : {}),
        ...(opts.status ? { status: opts.status } : {}),
      },
      include: {
        payerCompany: { select: { id: true, nameEn: true, nameAr: true } },
        _count: { select: { lines: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  async getBatch(tenantId: string, batchId: string) {
    const batch = await this.prisma.claimBatch.findFirst({
      where: { id: batchId, tenantId },
      include: {
        payerCompany: true,
        lines: { orderBy: { createdAt: "asc" } },
        remittances: { include: { lines: true }, orderBy: { receivedAt: "desc" } },
      },
    });
    if (!batch) throw new NotFoundException("Claim batch not found");
    return batch;
  }

  async createBatch(
    tenantId: string,
    user: JwtUser,
    body: {
      payerCompanyId: string;
      periodFrom: string;
      periodTo: string;
      currency?: string;
      invoiceIds?: string[];
    },
  ) {
    this.assertFinance(user);
    const payer = await this.prisma.payerCompany.findFirst({
      where: { id: body.payerCompanyId, tenantId, active: true },
    });
    if (!payer) throw new NotFoundException("Payer company not found");
    const periodFrom = new Date(body.periodFrom);
    const periodTo = new Date(body.periodTo);
    if (Number.isNaN(periodFrom.getTime()) || Number.isNaN(periodTo.getTime()) || periodTo < periodFrom) {
      throw new BadRequestException("Invalid period");
    }

    const invoices = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        payerCompanyId: body.payerCompanyId,
        issueDate: { gte: periodFrom, lte: new Date(periodTo.getTime() + 24 * 60 * 60 * 1000 - 1) },
        ...(body.invoiceIds?.length ? { id: { in: body.invoiceIds } } : {}),
      },
      include: { lines: true },
    });

    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.claimBatch.create({
        data: {
          tenantId,
          payerCompanyId: body.payerCompanyId,
          periodFrom,
          periodTo,
          currency: body.currency ?? invoices[0]?.currency ?? "EGP",
          status: ClaimBatchStatus.DRAFT,
          createdByUserId: user.userId,
        },
      });

      for (const inv of invoices) {
        const lineTotal = inv.lines.reduce((s, l) => s + num(l.amountPaid), 0);
        if (lineTotal <= 0) continue;
        const already = await tx.claimLine.findFirst({
          where: { tenantId, invoiceId: inv.id, status: { not: ClaimLineStatus.REJECTED } },
        });
        if (already) continue;
        const copayPct = await this.copayPercent(tx, tenantId, body.payerCompanyId, inv.lines[0]?.serviceCatalogItemId);
        const copay = roundMoney((lineTotal * copayPct) / 100);
        const claimed = roundMoney(lineTotal - copay);
        await tx.claimLine.create({
          data: {
            tenantId,
            batchId: batch.id,
            invoiceId: inv.id,
            invoiceLineId: null,
            patientId: inv.patientId,
            externalRef: inv.invoiceNumber,
            amountClaimed: new Prisma.Decimal(claimed),
            amountCopay: new Prisma.Decimal(copay),
            status: ClaimLineStatus.PENDING,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: user.userId,
          action: "CLAIM_BATCH_CREATED",
          resource: "ClaimBatch",
          resourceId: batch.id,
          metadata: { payerCompanyId: body.payerCompanyId, invoiceCount: invoices.length },
        },
      });

      return tx.claimBatch.findUniqueOrThrow({
        where: { id: batch.id },
        include: { lines: true, payerCompany: true },
      });
    });
  }

  private async copayPercent(
    tx: Prisma.TransactionClient,
    tenantId: string,
    payerCompanyId: string,
    catalogItemId: string | null | undefined,
  ): Promise<number> {
    if (!catalogItemId) return 0;
    const price = await tx.contractServicePrice.findFirst({
      where: {
        tenantId,
        payerCompanyId,
        catalogItemId,
        effectiveFrom: { lte: new Date() },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
      },
      orderBy: { effectiveFrom: "desc" },
    });
    return price ? num(price.patientCopayPercent) : 0;
  }

  async submitBatch(tenantId: string, user: JwtUser, batchId: string) {
    this.assertFinance(user);
    const batch = await this.prisma.claimBatch.findFirst({
      where: { id: batchId, tenantId },
      include: { lines: true, payerCompany: true },
    });
    if (!batch) throw new NotFoundException("Claim batch not found");
    if (batch.status !== ClaimBatchStatus.DRAFT && batch.status !== ClaimBatchStatus.REJECTED) {
      throw new BadRequestException({ message: "Only draft or rejected batches can be submitted", code: "CLAIM_BATCH_NOT_SUBMITTABLE" });
    }
    if (!batch.lines.length) throw new BadRequestException("Batch has no claim lines");

    const total = batch.lines.reduce((s, l) => s + num(l.amountClaimed), 0);
    const b2bInvoiceNumber = `B2B-${batch.payerCompany.contractRef ?? batch.payerCompanyId.slice(-6)}-${Date.now()}`;
    const b2bInvoicePayload = {
      kind: "payer_claim_invoice",
      batchId: batch.id,
      payerCompanyId: batch.payerCompanyId,
      payerNameEn: batch.payerCompany.nameEn,
      invoiceNumber: b2bInvoiceNumber,
      currency: batch.currency,
      totalAmount: total,
      lineCount: batch.lines.length,
      periodFrom: batch.periodFrom.toISOString().slice(0, 10),
      periodTo: batch.periodTo.toISOString().slice(0, 10),
      lines: batch.lines.map((l) => ({
        externalRef: l.externalRef,
        amountClaimed: num(l.amountClaimed),
        amountCopay: num(l.amountCopay),
      })),
    };

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.claimBatch.update({
        where: { id: batchId },
        data: {
          status: ClaimBatchStatus.SUBMITTED,
          submittedAt: new Date(),
          b2bInvoiceNumber,
          b2bInvoicePayload,
        },
        include: { lines: true, payerCompany: true },
      });
      await tx.claimLine.updateMany({
        where: { batchId, status: { in: [ClaimLineStatus.PENDING, ClaimLineStatus.REJECTED, ClaimLineStatus.RESUBMITTED] } },
        data: { status: ClaimLineStatus.SUBMITTED, rejectionReason: null },
      });
      await tx.outboxEvent.create({
        data: {
          tenantId,
          type: PAYER_B2B_INVOICE_TOPIC,
          aggregateType: "ClaimBatch",
          aggregateId: batchId,
          target: "INTERNAL",
          status: "PENDING",
          payload: b2bInvoicePayload,
          nextAttemptAt: new Date(),
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: user.userId,
          action: "CLAIM_BATCH_SUBMITTED",
          resource: "ClaimBatch",
          resourceId: batchId,
          metadata: { b2bInvoiceNumber, totalAmount: total },
        },
      });
      return updated;
    });
  }

  async rejectLine(tenantId: string, user: JwtUser, lineId: string, reason: string) {
    this.assertFinance(user);
    if (!reason?.trim()) throw new BadRequestException("rejection reason is required");
    const line = await this.prisma.claimLine.findFirst({ where: { id: lineId, tenantId } });
    if (!line) throw new NotFoundException("Claim line not found");
    const updated = await this.prisma.claimLine.update({
      where: { id: lineId },
      data: { status: ClaimLineStatus.REJECTED, rejectionReason: reason.trim() },
    });
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorId: user.userId,
        action: "CLAIM_LINE_REJECTED",
        resource: "ClaimLine",
        resourceId: lineId,
        metadata: { reason: reason.trim(), batchId: line.batchId },
      },
    });
    return updated;
  }

  async resubmitLine(tenantId: string, user: JwtUser, lineId: string) {
    this.assertFinance(user);
    const line = await this.prisma.claimLine.findFirst({
      where: { id: lineId, tenantId },
      include: { batch: true },
    });
    if (!line) throw new NotFoundException("Claim line not found");
    if (line.status !== ClaimLineStatus.REJECTED) {
      throw new BadRequestException({ message: "Only rejected lines can be resubmitted", code: "CLAIM_LINE_NOT_REJECTED" });
    }

    return this.prisma.$transaction(async (tx) => {
      let batchId = line.batchId;
      if (line.batch.status === ClaimBatchStatus.CLOSED || line.batch.status === ClaimBatchStatus.PAID) {
        const fresh = await tx.claimBatch.create({
          data: {
            tenantId,
            payerCompanyId: line.batch.payerCompanyId,
            periodFrom: line.batch.periodFrom,
            periodTo: line.batch.periodTo,
            currency: line.batch.currency,
            status: ClaimBatchStatus.DRAFT,
            createdByUserId: user.userId,
          },
        });
        batchId = fresh.id;
      } else if (line.batch.status === ClaimBatchStatus.SUBMITTED) {
        await tx.claimBatch.update({
          where: { id: line.batchId },
          data: { status: ClaimBatchStatus.DRAFT, submittedAt: null },
        });
      }

      const created = await tx.claimLine.create({
        data: {
          tenantId,
          batchId,
          invoiceId: line.invoiceId,
          invoiceLineId: line.invoiceLineId,
          patientId: line.patientId,
          preAuthId: line.preAuthId,
          externalRef: `${line.externalRef}-R`,
          amountClaimed: line.amountClaimed,
          amountCopay: line.amountCopay,
          status: ClaimLineStatus.RESUBMITTED,
          resubmissionOfId: line.id,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: user.userId,
          action: "CLAIM_LINE_RESUBMITTED",
          resource: "ClaimLine",
          resourceId: created.id,
          metadata: { previousLineId: line.id, batchId },
        },
      });
      return created;
    });
  }

  async importRemittance(
    tenantId: string,
    user: JwtUser,
    body: {
      payerCompanyId: string;
      batchId?: string;
      reference: string;
      currency?: string;
      lines: { externalRef: string; amount: number }[];
    },
  ) {
    this.assertFinance(user);
    if (!body.reference?.trim()) throw new BadRequestException("reference is required");
    if (!body.lines?.length) throw new BadRequestException("remittance lines required");
    const payer = await this.prisma.payerCompany.findFirst({ where: { id: body.payerCompanyId, tenantId } });
    if (!payer) throw new NotFoundException("Payer company not found");

    const claimLines = await this.prisma.claimLine.findMany({
      where: {
        tenantId,
        ...(body.batchId ? { batchId: body.batchId } : { batch: { payerCompanyId: body.payerCompanyId } }),
        status: { in: [ClaimLineStatus.SUBMITTED, ClaimLineStatus.ACCEPTED, ClaimLineStatus.PENDING, ClaimLineStatus.RESUBMITTED] },
      },
    });

    const { matches, matchedRatio } = matchRemittanceLines(
      claimLines.map((l) => ({
        id: l.id,
        externalRef: l.externalRef,
        amountClaimed: num(l.amountClaimed),
        status: l.status,
      })),
      body.lines.map((r) => ({ externalRef: r.externalRef, amount: roundMoney(r.amount) })),
    );

    const totalAmount = roundMoney(body.lines.reduce((s, r) => s + Number(r.amount), 0));
    const matchedCount = matches.filter((m) => m.status === "MATCHED").length;
    const unmatchedCount = matches.length - matchedCount;

    return this.prisma.$transaction(async (tx) => {
      const remittance = await tx.claimRemittance.create({
        data: {
          tenantId,
          payerCompanyId: body.payerCompanyId,
          batchId: body.batchId ?? null,
          reference: body.reference.trim(),
          totalAmount: new Prisma.Decimal(totalAmount),
          currency: body.currency ?? "EGP",
          matchedCount,
          unmatchedCount,
          lines: {
            create: matches.map((m) => ({
              claimLineId: m.claimLineId,
              externalRef: m.externalRef,
              amount: new Prisma.Decimal(m.amount),
              status:
                m.status === "MATCHED" ? RemittanceLineMatchStatus.MATCHED : RemittanceLineMatchStatus.UNMATCHED,
            })),
          },
        },
        include: { lines: true },
      });

      for (const m of matches) {
        if (!m.claimLineId) continue;
        await tx.claimLine.update({
          where: { id: m.claimLineId },
          data: {
            status: ClaimLineStatus.PAID,
            amountPaid: new Prisma.Decimal(m.amount),
            amountApproved: new Prisma.Decimal(m.amount),
          },
        });
      }

      if (body.batchId) {
        const remaining = await tx.claimLine.count({
          where: {
            batchId: body.batchId,
            status: { in: [ClaimLineStatus.SUBMITTED, ClaimLineStatus.ACCEPTED, ClaimLineStatus.PENDING, ClaimLineStatus.RESUBMITTED] },
          },
        });
        const paid = await tx.claimLine.count({ where: { batchId: body.batchId, status: ClaimLineStatus.PAID } });
        await tx.claimBatch.update({
          where: { id: body.batchId },
          data: {
            status:
              remaining === 0 && paid > 0
                ? ClaimBatchStatus.PAID
                : paid > 0
                  ? ClaimBatchStatus.PARTIALLY_PAID
                  : ClaimBatchStatus.SUBMITTED,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: user.userId,
          action: "CLAIM_REMITTANCE_IMPORTED",
          resource: "ClaimRemittance",
          resourceId: remittance.id,
          metadata: { matchedCount, unmatchedCount, matchedRatio, reference: body.reference },
        },
      });

      return { ...remittance, matchedRatio };
    });
  }
}
