import { createHmac, randomInt, randomUUID } from "node:crypto";
import type {
  CardSessionRequest,
  CardSessionResult,
  ChargeTokenRequest,
  ChargeTokenResult,
  ParsedWebhookEvent,
  PaymentGateway,
  PaymentLinkRequest,
  PaymentLinkResult,
  RefundRequest,
  RefundResult,
  TokenizeResult,
} from "./payment-gateway.interface";
import { isMock } from "../../common/provider-mode";

function webhookSecret(): string {
  return process.env.KIORLY_FAWRY_WEBHOOK_SECRET ?? (isMock("psp") ? "dev-fawry-secret" : "");
}

export class FawryGateway implements PaymentGateway {
  readonly key = "fawry" as const;

  async createPaymentLink(req: PaymentLinkRequest): Promise<PaymentLinkResult> {
    const referenceCode = `${randomInt(1_000_000_000, 9_999_999_999)}`;
    return {
      providerRef: `fawry_${req.idempotencyKey}`,
      referenceCode,
      instructionsEn: `Pay at any Fawry outlet using reference ${referenceCode} before the invoice due date.`,
      instructionsAr: `ادفع في أي منفذ فوري باستخدام الرقم ${referenceCode} قبل تاريخ الاستحقاق.`,
    };
  }

  async createCardSession(_req: CardSessionRequest): Promise<CardSessionResult> {
    throw new Error("Fawry does not support card tokenization in this integration");
  }

  tokenizeFromWebhook(): TokenizeResult | null {
    return null;
  }

  async chargeToken(_req: ChargeTokenRequest): Promise<ChargeTokenResult> {
    throw new Error("Fawry uses reference codes, not card tokens");
  }

  signMockWebhook(rawBody: string): string {
    if (!isMock("psp")) throw new Error("signMockWebhook is only available in PSP mock mode");
    return createHmac("sha256", webhookSecret()).update(rawBody, "utf8").digest("hex");
  }

  verifyWebhookSignature(rawBody: string, signatureHeader: string | undefined): boolean {
    if (!signatureHeader?.trim()) return false;
    const expected = createHmac("sha256", webhookSecret()).update(rawBody, "utf8").digest("hex");
    return signatureHeader.trim() === expected;
  }

  parseWebhook(payload: unknown): ParsedWebhookEvent {
    const obj = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
    const idempotencyKey = String(obj.requestId ?? obj.idempotency_key ?? randomUUID());
    const providerRef = String(obj.fawryRefNumber ?? obj.provider_ref ?? idempotencyKey);
    return {
      idempotencyKey,
      providerRef,
      tenantId: typeof obj.merchantRefNum === "string" ? obj.merchantRefNum.split(":")[0] : undefined,
      invoiceId: typeof obj.merchantRefNum === "string" ? obj.merchantRefNum.split(":")[1] : undefined,
      amount: String(obj.paymentAmount ?? obj.amount ?? "0"),
      currency: String(obj.paymentCurrency ?? "EGP"),
      status: obj.orderStatus === "PAID" || obj.orderStatus === "REFUNDED" || obj.status === "succeeded" ? "succeeded" : "failed",
      kind: obj.orderStatus === "REFUNDED" ? "refund" : "payment",
    };
  }

  async refund(req: RefundRequest): Promise<RefundResult> {
    return { providerRef: `${req.providerRef}_refund`, status: "pending" };
  }
}