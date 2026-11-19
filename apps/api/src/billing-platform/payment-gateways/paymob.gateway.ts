import { createHmac, randomUUID } from "node:crypto";
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
  return process.env.KIORLY_PAYMOB_WEBHOOK_SECRET ?? process.env.PAYMOB_HMAC_SECRET ?? "dev-paymob-secret";
}

function hostedBase(): string {
  return process.env.KIORLY_PAYMOB_IFRAME_BASE ?? "https://accept.paymob.com/api/acceptance/iframes";
}

/** Paymob aggregator — tokenization and charges never accept PAN/CVV on Kiorly APIs. */
export class PaymobGateway implements PaymentGateway {
  readonly key = "paymob" as const;

  async createPaymentLink(_req: PaymentLinkRequest): Promise<PaymentLinkResult> {
    throw new Error("Paymob card flow uses createCardSession");
  }

  async createCardSession(req: CardSessionRequest): Promise<CardSessionResult> {
    const sessionId = randomUUID();
    const iframeId = process.env.KIORLY_PAYMOB_IFRAME_ID ?? "dev";
    return {
      sessionId,
      iframeUrl: `${hostedBase()}/${iframeId}?session=${sessionId}&tenant=${encodeURIComponent(req.tenantId)}`,
      redirectUrl: `${req.returnUrl}?session=${sessionId}&provider=paymob`,
    };
  }

  tokenizeFromWebhook(payload: unknown): TokenizeResult | null {
    if (!payload || typeof payload !== "object") return null;
    const obj = payload as Record<string, unknown>;
    const tokenRef = typeof obj.token === "string" ? obj.token : null;
    if (!tokenRef) return null;
    return {
      tokenRef,
      brand: typeof obj.brand === "string" ? obj.brand : undefined,
      last4: typeof obj.last4 === "string" ? obj.last4 : undefined,
      expMonth: typeof obj.expMonth === "number" ? obj.expMonth : undefined,
      expYear: typeof obj.expYear === "number" ? obj.expYear : undefined,
    };
  }

  async chargeToken(req: ChargeTokenRequest): Promise<ChargeTokenResult> {
    const providerRef = `paymob_${req.idempotencyKey}`;
    const fail = process.env.KIORLY_PAYMOB_CHARGE_FAIL === "1";
    return {
      providerRef,
      status: fail ? "failed" : "succeeded",
    };
  }

  signMockWebhook(rawBody: string): string {
    if (!isMock("psp")) throw new Error("signMockWebhook is only available in PSP mock mode");
    return createHmac("sha256", webhookSecret()).update(rawBody, "utf8").digest("hex");
  }

  verifyWebhookSignature(rawBody: string, signatureHeader: string | undefined): boolean {
    if (!signatureHeader?.trim()) return false;
    const expected = createHmac("sha256", webhookSecret()).update(rawBody, "utf8").digest("hex");
    return signatureHeader.trim() === expected || signatureHeader.trim() === `sha256=${expected}`;
  }

  parseWebhook(payload: unknown): ParsedWebhookEvent {
    const obj = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
    const idempotencyKey = String(obj.idempotency_key ?? obj.id ?? randomUUID());
    const providerRef = String(obj.transaction_id ?? obj.id ?? idempotencyKey);
    const success = obj.success === true || obj.status === "succeeded";
    return {
      idempotencyKey,
      providerRef,
      tenantId: typeof obj.tenant_id === "string" ? obj.tenant_id : undefined,
      invoiceId: typeof obj.invoice_id === "string" ? obj.invoice_id : undefined,
      amount: String(obj.amount ?? "0"),
      currency: String(obj.currency ?? "EGP"),
      status: success ? "succeeded" : "failed",
    };
  }

  async refund(req: RefundRequest): Promise<RefundResult> {
    return { providerRef: `${req.providerRef}_refund_${req.idempotencyKey}`, status: "succeeded" };
  }
}