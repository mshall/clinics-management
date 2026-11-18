import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import {
  KiorlyInvoiceStatus,
  KiorlyPaymentStatus,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { notifyOnCall } from "../observability/notify-on-call";
import { isPlatformSuperAdmin } from "../common/platform-super-admin";
import type { JwtUser } from "../auth/jwt-user";
import { KIORLY_AUTO_CHARGE_RETRY_DAYS } from "./kiorly-dunning";
import { PaymentGatewayRegistry } from "./payment-gateways/payment-gateway.registry";
import { KiorlyPaymentMethodsService } from "./kiorly-payment-methods.service";
import { assertNoPanOrCvvInBody } from "./kiorly-payment-no-pan";
import { DunningService } from "../subscriptions/dunning.service";

export type PayInvoiceMethod = "card" | "saved_card" | "fawry" | "instapay" | "bank";

@Injectable()
export class KiorlyPaymentService {
  private readonly log = new Logger(KiorlyPaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateways: PaymentGatewayRegistry,
    private readonly paymentMethods: KiorlyPaymentMethodsService,
    private readonly dunning: DunningService,
  ) {}

  async payInvoice(
    tenantId: string,
    invoiceId: string,
    body: {
      method: PayInvoiceMethod;
      paymentMethodId?: string;
      proofUploadKey?: string;
    },
  ) {
    assertNoPanOrCvvInBody(body);

    const invoice = await this.prisma.kiorlyInvoice.findFirst({
      where: { id: invoiceId, tenantId },
    });
    if (!invoice) throw new NotFoundException("Kiorly invoice not found");
    if (invoice.status !== KiorlyInvoiceStatus.ISSUED && invoice.status !== KiorlyInvoiceStatus.PARTIALLY_PAID) {
      throw new BadRequestException("Invoice is not payable");
    }

    const amountDue = invoice.total.sub(invoice.amountPaid);
    if (amountDue.lte(0)) throw new BadRequestException("Nothing due on this invoice");

    const idempotencyKey = `pay_${invoiceId}_${randomUUID()}`;
    const amount = amountDue.toFixed(2);

    if (body.method === "saved_card" || body.method === "card") {
      return this.payWithCard(tenantId, invoiceId, invoice.currency, amount, idempotencyKey, body.paymentMethodId);
    }

    const provider = body.method === "fawry" ? "fawry" : body.method === "instapay" ? "instapay" : "bank";
    const gateway = this.gateways.get(provider);
    if (!gateway) throw new BadRequestException("Payment method not available");

    if (provider === "instapay" || provider === "bank") {
      if (!body.proofUploadKey?.trim()) {
        throw new BadRequestException("proofUploadKey is required for manual transfers");
      }
      return this.createManualPaymentUnderReview(tenantId, invoiceId, provider, amount, invoice.currency, {
        proofUploadKey: body.proofUploadKey.trim(),
        idempotencyKey,
      });
    }

    const link = await gateway.createPaymentLink({
      tenantId,
      invoiceId,
      amount,
      currency: invoice.currency,
      idempotencyKey,
    });

    await this.prisma.kiorlyPayment.create({
      data: {
        tenantId,
        invoiceId,
        provider,
        providerRef: link.providerRef,
        amount: new Prisma.Decimal(amount),
        currency: invoice.currency,
        status: KiorlyPaymentStatus.PENDING,
        idempotencyKey,
      },
    });

    return {
      status: "PENDING",
      provider,
      providerRef: link.providerRef,
      referenceCode: link.referenceCode,
      instructionsEn: link.instructionsEn,
      instructionsAr: link.instructionsAr,
    };
  }

  private async payWithCard(
    tenantId: string,
    invoiceId: string,
    currency: string,
    amount: string,
    idempotencyKey: string,
    paymentMethodId?: string,
  ) {
    let tokenRef: string;
    if (paymentMethodId) {
      const method = await this.prisma.kiorlyPaymentMethod.findFirst({
        where: { id: paymentMethodId, tenantId },
      });
      if (!method?.tokenRef) throw new NotFoundException("Payment method not found");
      tokenRef = method.tokenRef;
    } else {
      const def = await this.paymentMethods.getDefaultCardToken(tenantId);
      if (!def) throw new BadRequestException("No saved card on file");
      tokenRef = def.tokenRef;
    }

    const gateway = this.gateways.get("paymob");
    if (!gateway) throw new BadRequestException("Card payments are not configured");

    const charge = await gateway.chargeToken({
      tenantId,
      tokenRef,
      amount,
      currency,
      invoiceId,
      idempotencyKey,
    });

    const status =
      charge.status === "succeeded"
        ? KiorlyPaymentStatus.SUCCEEDED
        : charge.status === "failed"
          ? KiorlyPaymentStatus.FAILED
          : KiorlyPaymentStatus.PENDING;

    await this.prisma.$transaction(async (tx) => {
      await tx.kiorlyPayment.create({
        data: {
          tenantId,
          invoiceId,
          provider: "paymob",
          providerRef: charge.providerRef,
          amount: new Prisma.Decimal(amount),
          currency,
          status,
          idempotencyKey,
        },
      });
      if (status === KiorlyPaymentStatus.SUCCEEDED) {
        await this.applyPaymentToInvoiceTx(tx, invoiceId, amount);
      }
    });

    if (status === KiorlyPaymentStatus.SUCCEEDED) {
      await this.dunning.reconcileAfterPayment(tenantId);
    }

    return { status, provider: "paymob", providerRef: charge.providerRef };
  }

  private async createManualPaymentUnderReview(
    tenantId: string,
    invoiceId: string,
    provider: string,
    amount: string,
    currency: string,
    opts: { proofUploadKey: string; idempotencyKey: string },
  ) {
    const providerRef = `${provider}_${opts.idempotencyKey}`;
    const payment = await this.prisma.$transaction(async (tx) => {
      const row = await tx.kiorlyPayment.create({
        data: {
          tenantId,
          invoiceId,
          provider,
          providerRef,
          amount: new Prisma.Decimal(amount),
          currency,
          status: KiorlyPaymentStatus.UNDER_REVIEW,
          proofUploadKey: opts.proofUploadKey,
          idempotencyKey: opts.idempotencyKey,
        },
      });
      await tx.kiorlyInvoice.update({
        where: { id: invoiceId },
        data: { paymentUnderReview: true },
      });
      await tx.subscription.update({
        where: { tenantId },
        data: { kiorlyDunningPausedUntil: new Date(Date.now() + 30 * 86_400_000) },
      });
      return row;
    });

    return {
      status: "UNDER_REVIEW",
      paymentId: payment.id,
      provider,
      paymentUnderReview: true,
    };
  }

  async handleWebhook(provider: string, rawBody: string, signature: string | undefined, payload: unknown) {
    const gateway = this.gateways.get(provider);
    if (!gateway) throw new NotFoundException("Unknown payment provider");
    if (!gateway.verifyWebhookSignature(rawBody, signature)) {
      throw new UnauthorizedException("Invalid webhook signature");
    }

    const event = gateway.parseWebhook(payload);
    const payloadHash = createHash("sha256").update(rawBody, "utf8").digest("hex");

    const duplicate = await this.prisma.kiorlyPaymentWebhookEvent.findUnique({
      where: { provider_idempotencyKey: { provider, idempotencyKey: event.idempotencyKey } },
    });
    if (duplicate) {
      return { ok: true, duplicate: true, paymentId: duplicate.paymentId };
    }

    const existingPayment = await this.prisma.kiorlyPayment.findUnique({
      where: { providerRef: event.providerRef },
    });
    if (existingPayment?.status === KiorlyPaymentStatus.SUCCEEDED) {
      await this.prisma.kiorlyPaymentWebhookEvent.create({
        data: {
          provider,
          idempotencyKey: event.idempotencyKey,
          paymentId: existingPayment.id,
          payloadHash,
        },
      });
      return { ok: true, duplicate: true, paymentId: existingPayment.id };
    }

    return this.prisma.$transaction(async (tx) => {
      const webhookRow = await tx.kiorlyPaymentWebhookEvent.create({
        data: {
          provider,
          idempotencyKey: event.idempotencyKey,
          payloadHash,
        },
      });

      let payment = existingPayment;
      if (!payment) {
        if (!event.tenantId || !event.invoiceId) {
          throw new BadRequestException("Webhook missing tenant or invoice reference");
        }
        payment = await tx.kiorlyPayment.create({
          data: {
            tenantId: event.tenantId,
            invoiceId: event.invoiceId,
            provider,
            providerRef: event.providerRef,
            amount: new Prisma.Decimal(event.amount),
            currency: event.currency,
            status:
              event.status === "succeeded"
                ? KiorlyPaymentStatus.SUCCEEDED
                : event.status === "failed"
                  ? KiorlyPaymentStatus.FAILED
                  : KiorlyPaymentStatus.PENDING,
            idempotencyKey: event.idempotencyKey,
          },
        });
      } else if (event.status === "succeeded") {
        payment = await tx.kiorlyPayment.update({
          where: { id: payment.id },
          data: { status: KiorlyPaymentStatus.SUCCEEDED },
        });
      }

      await tx.kiorlyPaymentWebhookEvent.update({
        where: { id: webhookRow.id },
        data: { paymentId: payment.id },
      });

      if (payment.status === KiorlyPaymentStatus.SUCCEEDED && payment.invoiceId) {
        await this.applyPaymentToInvoiceTx(tx, payment.invoiceId, payment.amount.toFixed(2));
      }

      const reactivate = payment.status === KiorlyPaymentStatus.SUCCEEDED;
      return { ok: true, duplicate: false, paymentId: payment.id, tenantId: payment.tenantId, reactivate };
    }).then(async (result) => {
      if (!result.duplicate && result.reactivate && result.tenantId) {
        await this.dunning.reconcileAfterPayment(result.tenantId);
      }
      if (event.status === "failed") {
        notifyOnCall("KIORLY_PAYMENT_WEBHOOK_FAILED", {
          provider,
          tenantId: event.tenantId,
          invoiceId: event.invoiceId,
          providerRef: event.providerRef,
        });
      }
      const { reactivate: _r, tenantId: _t, ...rest } = result;
      return rest;
    });
  }

  async verifyManualPayment(user: JwtUser, paymentId: string, approved: boolean) {
    if (!isPlatformSuperAdmin(user)) throw new ForbiddenException();
    const payment = await this.prisma.kiorlyPayment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException();
    if (payment.status !== KiorlyPaymentStatus.UNDER_REVIEW) {
      throw new BadRequestException("Payment is not awaiting verification");
    }

    await this.prisma.$transaction(async (tx) => {
      if (approved) {
        await tx.kiorlyPayment.update({
          where: { id: paymentId },
          data: { status: KiorlyPaymentStatus.SUCCEEDED, verifiedBy: user.userId },
        });
        if (payment.invoiceId) {
          await this.applyPaymentToInvoiceTx(tx, payment.invoiceId, payment.amount.toFixed(2));
          await tx.kiorlyInvoice.update({
            where: { id: payment.invoiceId },
            data: { paymentUnderReview: false },
          });
        }
        await tx.subscription.update({
          where: { tenantId: payment.tenantId },
          data: { kiorlyDunningPausedUntil: null },
        });
        await tx.auditLog.create({
          data: {
            tenantId: payment.tenantId,
            actorId: user.userId,
            action: "kiorly_payment.verified",
            resource: "KiorlyPayment",
            resourceId: paymentId,
            metadata: { approved: true } as Prisma.InputJsonValue,
          },
        });
      } else {
        await tx.kiorlyPayment.update({
          where: { id: paymentId },
          data: { status: KiorlyPaymentStatus.FAILED, verifiedBy: user.userId },
        });
        if (payment.invoiceId) {
          await tx.kiorlyInvoice.update({
            where: { id: payment.invoiceId },
            data: { paymentUnderReview: false },
          });
        }
        await tx.subscription.update({
          where: { tenantId: payment.tenantId },
          data: { kiorlyDunningPausedUntil: null },
        });
        await tx.auditLog.create({
          data: {
            tenantId: payment.tenantId,
            actorId: user.userId,
            action: "kiorly_payment.rejected",
            resource: "KiorlyPayment",
            resourceId: paymentId,
            metadata: { approved: false } as Prisma.InputJsonValue,
          },
        });
      }
    });

    if (approved) {
      await this.dunning.reconcileAfterPayment(payment.tenantId);
    }

    return { paymentId, approved };
  }

  private async applyPaymentToInvoiceTx(tx: Prisma.TransactionClient, invoiceId: string, amountStr: string) {
    const invoice = await tx.kiorlyInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
    const pay = new Prisma.Decimal(amountStr);
    const newPaid = invoice.amountPaid.add(pay);
    const due = invoice.total.sub(newPaid);
    let status = invoice.status;
    let paidAt = invoice.paidAt;
    if (due.lte(0)) {
      status = KiorlyInvoiceStatus.PAID;
      paidAt = new Date();
    } else if (newPaid.gt(invoice.amountPaid)) {
      status = KiorlyInvoiceStatus.PARTIALLY_PAID;
    }
    await tx.kiorlyInvoice.update({
      where: { id: invoiceId },
      data: {
        amountPaid: Prisma.Decimal.min(newPaid, invoice.total),
        status,
        paidAt,
        paymentUnderReview: false,
      },
    });
  }

  async scheduleAutoChargeOnIssue(invoiceId: string) {
    await this.prisma.kiorlyInvoice.update({
      where: { id: invoiceId },
      data: { nextAutoChargeAt: new Date(), autoChargeAttempts: 0 },
    });
    await this.tryAutoChargeForInvoice(invoiceId);
  }

  async tryAutoChargeForInvoice(invoiceId: string): Promise<boolean> {
    const invoice = await this.prisma.kiorlyInvoice.findUnique({ where: { id: invoiceId } });
    if (!invoice || invoice.paymentUnderReview) return false;
    if (invoice.status !== KiorlyInvoiceStatus.ISSUED && invoice.status !== KiorlyInvoiceStatus.PARTIALLY_PAID) {
      return false;
    }
    const amountDue = invoice.total.sub(invoice.amountPaid);
    if (amountDue.lte(0)) return false;

    const token = await this.paymentMethods.getDefaultCardToken(invoice.tenantId);
    if (!token) return false;

    try {
      await this.payWithCard(
        invoice.tenantId,
        invoiceId,
        invoice.currency,
        amountDue.toFixed(2),
        `auto_${invoiceId}_${invoice.autoChargeAttempts}`,
        token.methodId,
      );
      await this.prisma.kiorlyInvoice.update({
        where: { id: invoiceId },
        data: { nextAutoChargeAt: null },
      });
      return true;
    } catch (e) {
      this.log.warn(e instanceof Error ? e.message : String(e));
      return false;
    }
  }

  async runAutoChargeRetries(now = new Date()) {
    const due = await this.prisma.kiorlyInvoice.findMany({
      where: {
        nextAutoChargeAt: { lte: now },
        status: { in: [KiorlyInvoiceStatus.ISSUED, KiorlyInvoiceStatus.PARTIALLY_PAID] },
        paymentUnderReview: false,
      },
      take: 50,
    });
    let processed = 0;
    for (const inv of due) {
      const ok = await this.tryAutoChargeForInvoice(inv.id);
      if (ok) {
        processed += 1;
        continue;
      }
      const attempt = inv.autoChargeAttempts + 1;
      const retryDay = KIORLY_AUTO_CHARGE_RETRY_DAYS[attempt - 1];
      if (retryDay == null) {
        await this.prisma.kiorlyInvoice.update({
          where: { id: inv.id },
          data: { nextAutoChargeAt: null },
        });
        continue;
      }
      const next = new Date(now.getTime() + retryDay * 86_400_000);
      await this.prisma.kiorlyInvoice.update({
        where: { id: inv.id },
        data: { autoChargeAttempts: attempt, nextAutoChargeAt: next },
      });
    }
    return processed;
  }

  async runReconciliation() {
    const pending = await this.prisma.kiorlyPayment.findMany({
      where: { status: KiorlyPaymentStatus.PENDING, provider: { in: ["paymob", "fawry"] } },
      take: 100,
    });
    let matched = 0;
    for (const p of pending) {
      if (!p.invoiceId) continue;
      const invoice = await this.prisma.kiorlyInvoice.findUnique({ where: { id: p.invoiceId } });
      if (invoice?.status === KiorlyInvoiceStatus.PAID && p.status === KiorlyPaymentStatus.PENDING) {
        await this.prisma.kiorlyPayment.update({
          where: { id: p.id },
          data: { status: KiorlyPaymentStatus.SUCCEEDED },
        });
        matched += 1;
      }
    }
    return { scanned: pending.length, matched };
  }

  async getPaymentStatus(tenantId: string, paymentId: string) {
    const row = await this.prisma.kiorlyPayment.findFirst({
      where: { id: paymentId, tenantId },
      include: { invoice: { select: { paymentUnderReview: true, status: true } } },
    });
    if (!row) throw new NotFoundException();
    return {
      id: row.id,
      status: row.status,
      provider: row.provider,
      invoiceId: row.invoiceId,
      paymentUnderReview: row.invoice?.paymentUnderReview ?? false,
    };
  }
}