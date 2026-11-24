import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  KiorlyInvoiceStatus,
  KiorlyLineType,
  MessageChannel,
  Prisma,
  type KiorlyInvoice,
  type KiorlyInvoiceLine,
} from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { parsePageParams } from "../common/pagination";
import { CreditFeeDrawdownService } from "../credits/credit-fee-drawdown.service";
import { CreditWalletService } from "../credits/credit-wallet.service";
import { PrismaService } from "../prisma/prisma.service";
import { kiorlyInvoiceDueDaysFromMarket } from "./kiorly-invoice.config";
import { buildKiorlyInvoicePdf } from "./kiorly-invoice-pdf";
import { nextKiorlyInvoiceNumber } from "./kiorly-invoice-numbering";
import { KiorlyPaymentService } from "./kiorly-payment.service";
import { STATEMENT_READY_TOPIC } from "./monthly-statement";

type Tx = Prisma.TransactionClient;

export type KiorlyInvoiceLineInput = {
  type: KiorlyLineType;
  descEn: string;
  descAr: string;
  quantity: number | string;
  unitAmount: number | string;
  amount: number | string;
  refId?: string | null;
};

export type KiorlyInvoiceDto = {
  id: string;
  number: string;
  periodKey: string;
  periodStart: string;
  periodEnd: string;
  status: KiorlyInvoiceStatus;
  currency: string;
  subtotal: string;
  creditsApplied: string;
  tax: string;
  total: string;
  amountPaid: string;
  amountDue: string;
  issuedAt: string | null;
  dueAt: string | null;
  paidAt: string | null;
  creditMemo: boolean;
  voidOfInvoiceId: string | null;
  paymentUnderReview: boolean;
  lines: {
    id: string;
    type: KiorlyLineType;
    descEn: string;
    descAr: string;
    quantity: string;
    unitAmount: string;
    amount: string;
    refId: string | null;
  }[];
  settlementSummary: {
    explanationEn: string;
    explanationAr: string;
    kiorexPatientCount: number;
    higherOf: string;
  } | null;
};

@Injectable()
export class KiorlyInvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly creditWallet: CreditWalletService,
    private readonly kiorlyPayments: KiorlyPaymentService,
    drawdown?: CreditFeeDrawdownService,
  ) {
    // GRW-P2-W: credit pays first (first-expiring first, per use), the invoice keeps the remainder
    this.drawdown = drawdown ?? new CreditFeeDrawdownService(creditWallet);
  }
  private readonly drawdown: CreditFeeDrawdownService;

  assertDraftForLineMutation(invoice: Pick<KiorlyInvoice, "status">): void {
    if (invoice.status !== KiorlyInvoiceStatus.DRAFT) {
      throw new ForbiddenException("Cannot modify lines on a non-draft Kiorly invoice");
    }
  }

  private d(v: number | string | Prisma.Decimal): Prisma.Decimal {
    return v instanceof Prisma.Decimal ? v : new Prisma.Decimal(String(v));
  }

  private async loadTenantMarket(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { market: true },
    });
    if (!tenant?.market) throw new BadRequestException("Organization market is required for Kiorly invoicing");
    return tenant;
  }

  /** TAX lines are display-only; VAT is recomputed from the taxable amount. */
  private computeTotals(lines: KiorlyInvoiceLineInput[], creditsApplied: Prisma.Decimal, taxRatePercent: number) {
    const subtotal = lines
      .filter((line) => line.type !== KiorlyLineType.TAX)
      .reduce((sum, line) => sum.add(this.d(line.amount)), new Prisma.Decimal(0));
    const taxable = Prisma.Decimal.max(subtotal.sub(creditsApplied), new Prisma.Decimal(0));
    const tax = taxable.mul(taxRatePercent).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    const total = subtotal.sub(creditsApplied).add(tax);
    return { subtotal, tax, total };
  }

  async createDraft(
    tenantId: string,
    body: {
      periodKey: string;
      periodStart: Date;
      periodEnd: Date;
      currency: string;
      creditsApplied?: number | string;
      lines: KiorlyInvoiceLineInput[];
      taxRatePercent?: number;
    },
  ): Promise<KiorlyInvoiceDto> {
    const tenant = await this.loadTenantMarket(tenantId);
    if (body.lines.length === 0) throw new BadRequestException("At least one line is required");

    const creditsApplied = this.d(body.creditsApplied ?? 0);
    const taxRate = body.taxRatePercent ?? 0;
    const { subtotal, tax, total } = this.computeTotals(body.lines, creditsApplied, taxRate);

    let row: string | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const number = await this.prisma.$transaction((tx) =>
        nextKiorlyInvoiceNumber(tx, tenant.market!.id, tenant.market!.code),
      );
      try {
        row = await this.prisma.$transaction(async (tx) => {
          const invoice = await tx.kiorlyInvoice.create({
            data: {
              tenantId,
              number,
              periodKey: body.periodKey.trim(),
              periodStart: body.periodStart,
              periodEnd: body.periodEnd,
              status: KiorlyInvoiceStatus.DRAFT,
              currency: body.currency.trim(),
              subtotal,
              creditsApplied,
              tax,
              total,
            },
          });
          await tx.kiorlyInvoiceLine.createMany({
            data: body.lines.map((line) => ({
              invoiceId: invoice.id,
              type: line.type,
              descEn: line.descEn.trim(),
              descAr: line.descAr.trim(),
              quantity: this.d(line.quantity),
              unitAmount: this.d(line.unitAmount),
              amount: this.d(line.amount),
              refId: line.refId?.trim() || null,
            })),
          });
          return invoice.id;
        });
        break;
      } catch (e) {
        const code = (e as { code?: string }).code;
        if (code === "P2002" && attempt < 4) continue;
        throw e;
      }
    }
    if (!row) throw new BadRequestException("Could not allocate invoice number");

    return this.getOne(tenantId, row);
  }

  async replaceDraftLines(
    tenantId: string,
    invoiceId: string,
    lines: KiorlyInvoiceLineInput[],
    opts: { creditsApplied?: number | string; taxRatePercent?: number } = {},
  ): Promise<KiorlyInvoiceDto> {
    const invoice = await this.requireInvoice(tenantId, invoiceId);
    this.assertDraftForLineMutation(invoice);
    if (lines.length === 0) throw new BadRequestException("At least one line is required");

    const creditsApplied = opts.creditsApplied != null ? this.d(opts.creditsApplied) : invoice.creditsApplied;
    const taxRate =
      opts.taxRatePercent ??
      (invoice.tax.gt(0) && invoice.subtotal.gt(0)
        ? invoice.tax
            .div(Prisma.Decimal.max(invoice.subtotal.sub(invoice.creditsApplied), new Prisma.Decimal(0.01)))
            .mul(100)
            .toNumber()
        : 0);
    const { subtotal, tax, total } = this.computeTotals(lines, creditsApplied, taxRate);

    await this.prisma.$transaction(async (tx) => {
      await tx.kiorlyInvoiceLine.deleteMany({ where: { invoiceId } });
      await tx.kiorlyInvoiceLine.createMany({
        data: lines.map((line) => ({
          invoiceId,
          type: line.type,
          descEn: line.descEn.trim(),
          descAr: line.descAr.trim(),
          quantity: this.d(line.quantity),
          unitAmount: this.d(line.unitAmount),
          amount: this.d(line.amount),
          refId: line.refId?.trim() || null,
        })),
      });
      await tx.kiorlyInvoice.update({
        where: { id: invoiceId },
        data: { subtotal, creditsApplied, tax, total },
      });
    });

    return this.getOne(tenantId, invoiceId);
  }

  async issue(tenantId: string, invoiceId: string, actorUserId?: string): Promise<KiorlyInvoiceDto> {
    const tenant = await this.loadTenantMarket(tenantId);
    const invoice = await this.requireInvoice(tenantId, invoiceId, true);
    if (invoice.status !== KiorlyInvoiceStatus.DRAFT) {
      throw new BadRequestException("Only draft invoices can be issued");
    }

    const dueDays = kiorlyInvoiceDueDaysFromMarket(tenant.market?.featureDefaults);
    const issuedAt = new Date();
    const dueAt = new Date(issuedAt.getTime() + dueDays * 86_400_000);

    if (invoice.creditsApplied.gt(0)) {
      const lines = await this.prisma.kiorlyInvoiceLine.findMany({ where: { invoiceId }, select: { id: true, type: true, amount: true }, orderBy: { createdAt: "asc" } });
      await this.drawdown.consumeForInvoice(tenantId, { id: invoiceId, number: invoice.number, creditsApplied: invoice.creditsApplied }, lines, actorUserId);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.kiorlyInvoice.update({
        where: { id: invoiceId },
        data: {
          status: KiorlyInvoiceStatus.ISSUED,
          issuedAt,
          dueAt,
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: actorUserId ?? null,
          action: "kiorly_invoice.issued",
          resource: "KiorlyInvoice",
          resourceId: invoiceId,
          metadata: { number: invoice.number, dueAt: dueAt.toISOString() } as Prisma.InputJsonValue,
        },
      });

      await this.enqueueStatementDelivery(tx, tenantId, invoice);
    });

    await this.kiorlyPayments.scheduleAutoChargeOnIssue(invoiceId);

    return this.getOne(tenantId, invoiceId);
  }

  /** CR-11: statement PDF goes to the owner by email + WhatsApp via the outbox (no PHI in payload). */
  private async enqueueStatementDelivery(tx: Tx, tenantId: string, invoice: KiorlyInvoice): Promise<void> {
    const owner = await tx.user.findFirst({
      where: { tenantId, isTenantOwner: true, deletedAt: null },
      select: { email: true, employee: { select: { phone: true } } },
    });
    const base = {
      tenantId,
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      periodKey: invoice.periodKey,
      total: invoice.total.toFixed(2),
      currency: invoice.currency,
      statementPath: `/api/v1/billing/statements/${invoice.periodKey}?format=pdf`,
      locales: ["en", "ar"],
    };
    const deliveries: Record<string, unknown>[] = [{ channel: "email", to: owner?.email ?? null, ...base }];
    const phone = owner?.employee?.phone?.trim();
    if (phone) deliveries.push({ channel: MessageChannel.WHATSAPP, toPhone: phone, ...base });
    for (const payload of deliveries) {
      await tx.outboxEvent.create({
        data: {
          tenantId,
          type: STATEMENT_READY_TOPIC,
          aggregateType: "KiorlyInvoice",
          aggregateId: invoice.id,
          payload: payload as Prisma.InputJsonValue,
          target: "INTERNAL",
          status: "PENDING",
        },
      });
    }
  }

  async voidViaCreditInvoice(tenantId: string, invoiceId: string, actorUserId?: string): Promise<KiorlyInvoiceDto> {
    const tenant = await this.loadTenantMarket(tenantId);
    const original = await this.requireInvoice(tenantId, invoiceId, true);
    if (original.status === KiorlyInvoiceStatus.DRAFT || original.status === KiorlyInvoiceStatus.VOID) {
      throw new BadRequestException("Invoice cannot be voided in its current status");
    }
    if (original.creditMemo) {
      throw new BadRequestException("Credit memos cannot be voided through this API");
    }

    const sourceLines = original.lines ?? [];
    const creditLines: KiorlyInvoiceLineInput[] = sourceLines.map((line) => ({
      type: KiorlyLineType.CREDIT,
      descEn: `Void credit: ${line.descEn}`,
      descAr: `إشعار دائن: ${line.descAr}`,
      quantity: line.quantity.toFixed(2),
      unitAmount: line.unitAmount.neg().toFixed(2),
      amount: line.amount.neg().toFixed(2),
      refId: line.id,
    }));

    const number = await this.prisma.$transaction((tx) =>
      nextKiorlyInvoiceNumber(tx, tenant.market!.id, tenant.market!.code),
    );
    const creditMemoId = await this.prisma.$transaction(async (tx) => {
      const memo = await tx.kiorlyInvoice.create({
        data: {
          tenantId,
          number,
          periodKey: `${original.periodKey}-void-${Date.now()}`,
          periodStart: original.periodStart,
          periodEnd: original.periodEnd,
          status: KiorlyInvoiceStatus.ISSUED,
          currency: original.currency,
          subtotal: original.subtotal.neg(),
          creditsApplied: new Prisma.Decimal(0),
          tax: original.tax.neg(),
          total: original.total.neg(),
          creditMemo: true,
          voidOfInvoiceId: original.id,
          issuedAt: new Date(),
          dueAt: new Date(),
        },
      });
      await tx.kiorlyInvoiceLine.createMany({
        data: creditLines.map((line) => ({
          invoiceId: memo.id,
          type: line.type,
          descEn: line.descEn,
          descAr: line.descAr,
          quantity: this.d(line.quantity),
          unitAmount: this.d(line.unitAmount),
          amount: this.d(line.amount),
          refId: line.refId?.trim() || null,
        })),
      });
      await tx.kiorlyInvoice.update({
        where: { id: original.id },
        data: { status: KiorlyInvoiceStatus.VOID },
      });
      return memo.id;
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorId: actorUserId ?? null,
        action: "kiorly_invoice.voided",
        resource: "KiorlyInvoice",
        resourceId: original.id,
        metadata: { creditMemoId, number: original.number } as Prisma.InputJsonValue,
      },
    });

    return this.getOne(tenantId, creditMemoId);
  }

  async recordPayment(tenantId: string, invoiceId: string, amount?: number | string): Promise<KiorlyInvoiceDto> {
    const invoice = await this.requireInvoice(tenantId, invoiceId);
    if (
      invoice.status !== KiorlyInvoiceStatus.ISSUED &&
      invoice.status !== KiorlyInvoiceStatus.PARTIALLY_PAID
    ) {
      throw new BadRequestException("Only issued or partially paid invoices accept payments");
    }

    const pay = amount != null ? this.d(amount) : invoice.total.sub(invoice.amountPaid);
    if (pay.lte(0)) throw new BadRequestException("Payment amount must be positive");

    const newPaid = invoice.amountPaid.add(pay);
    const due = invoice.total.sub(newPaid);
    let status: KiorlyInvoiceStatus = invoice.status;
    let paidAt: Date | null = invoice.paidAt;

    if (due.lte(0)) {
      status = KiorlyInvoiceStatus.PAID;
      paidAt = new Date();
    } else if (newPaid.gt(0)) {
      status = KiorlyInvoiceStatus.PARTIALLY_PAID;
    }

    await this.prisma.kiorlyInvoice.update({
      where: { id: invoiceId },
      data: { amountPaid: Prisma.Decimal.min(newPaid, invoice.total), status, paidAt },
    });

    return this.getOne(tenantId, invoiceId);
  }

  async listForTenant(
    user: JwtUser,
    tenantId: string,
    pageRaw?: number,
    pageSizeRaw?: number,
  ): Promise<{ items: KiorlyInvoiceDto[]; page: number; pageSize: number; total: number }> {
    if (user.tenantId !== tenantId) throw new ForbiddenException();
    const { page, pageSize, skip } = parsePageParams(
      pageRaw != null ? String(pageRaw) : undefined,
      pageSizeRaw != null ? String(pageSizeRaw) : undefined,
    );

    const [total, rows] = await Promise.all([
      this.prisma.kiorlyInvoice.count({ where: { tenantId } }),
      this.prisma.kiorlyInvoice.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        include: { lines: { orderBy: { createdAt: "asc" } } },
      }),
    ]);

    return {
      items: rows.map(serializeInvoice),
      page,
      pageSize,
      total,
    };
  }

  async getOne(tenantId: string, invoiceId: string): Promise<KiorlyInvoiceDto> {
    const row = await this.requireInvoice(tenantId, invoiceId, true);
    return serializeInvoice(row);
  }

  async getOneForTenant(user: JwtUser, tenantId: string, invoiceId: string): Promise<KiorlyInvoiceDto> {
    if (user.tenantId !== tenantId) throw new ForbiddenException();
    return this.getOne(tenantId, invoiceId);
  }

  async renderPdf(tenantId: string, invoiceId: string): Promise<Buffer> {
    const invoice = await this.getOne(tenantId, invoiceId);
    const lines = [
      { label: "Invoice", value: invoice.number },
      { label: "Status", value: invoice.status },
      { label: "Period", value: invoice.periodKey },
      { label: "Subtotal", value: `${invoice.subtotal} ${invoice.currency}` },
      { label: "Credits", value: `${invoice.creditsApplied} ${invoice.currency}` },
      { label: "Tax", value: `${invoice.tax} ${invoice.currency}` },
      { label: "Total", value: `${invoice.total} ${invoice.currency}` },
      { label: "Due", value: `${invoice.amountDue} ${invoice.currency}` },
    ];
    for (const line of invoice.lines) {
      lines.push({ label: line.descEn, value: `${line.amount} ${invoice.currency}` });
    }
    return buildKiorlyInvoicePdf(`Kiorly invoice ${invoice.number}`, lines);
  }

  private async requireInvoice(tenantId: string, invoiceId: string, withLines = false) {
    const row = await this.prisma.kiorlyInvoice.findFirst({
      where: { id: invoiceId, tenantId },
      include: withLines ? { lines: { orderBy: { createdAt: "asc" } } } : undefined,
    });
    if (!row) throw new NotFoundException("Kiorly invoice not found");
    return row as KiorlyInvoice & { lines?: KiorlyInvoiceLine[] };
  }
}

function serializeInvoice(row: KiorlyInvoice & { lines?: KiorlyInvoiceLine[] }): KiorlyInvoiceDto {
  const amountDue = row.total.sub(row.amountPaid);
  return {
    id: row.id,
    number: row.number,
    periodKey: row.periodKey,
    periodStart: row.periodStart.toISOString(),
    periodEnd: row.periodEnd.toISOString(),
    status: row.status,
    currency: row.currency,
    subtotal: row.subtotal.toFixed(2),
    creditsApplied: row.creditsApplied.toFixed(2),
    tax: row.tax.toFixed(2),
    total: row.total.toFixed(2),
    amountPaid: row.amountPaid.toFixed(2),
    amountDue: Prisma.Decimal.max(amountDue, new Prisma.Decimal(0)).toFixed(2),
    issuedAt: row.issuedAt?.toISOString() ?? null,
    dueAt: row.dueAt?.toISOString() ?? null,
    paidAt: row.paidAt?.toISOString() ?? null,
    creditMemo: row.creditMemo,
    voidOfInvoiceId: row.voidOfInvoiceId,
    paymentUnderReview: row.paymentUnderReview,
    lines: (row.lines ?? []).map((line) => ({
      id: line.id,
      type: line.type,
      descEn: line.descEn,
      descAr: line.descAr,
      quantity: line.quantity.toFixed(2),
      unitAmount: line.unitAmount.toFixed(2),
      amount: line.amount.toFixed(2),
      refId: line.refId,
    })),
    settlementSummary: parseSettlementSummary(row.settlementSummaryJson),
  };
}

function parseSettlementSummary(json: Prisma.JsonValue | null | undefined): KiorlyInvoiceDto["settlementSummary"] {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const o = json as Record<string, unknown>;
  const explanationEn = typeof o.explanationEn === "string" ? o.explanationEn : null;
  const explanationAr = typeof o.explanationAr === "string" ? o.explanationAr : null;
  const higherOf = typeof o.higherOf === "string" ? o.higherOf : null;
  const kiorexPatientCount = typeof o.kiorexPatientCount === "number" ? o.kiorexPatientCount : 0;
  if (!explanationEn || !explanationAr || !higherOf) return null;
  return { explanationEn, explanationAr, kiorexPatientCount, higherOf };
}