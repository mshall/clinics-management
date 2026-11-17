import { randomUUID } from "node:crypto";
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

export class InstaPayGateway implements PaymentGateway {
  readonly key = "instapay" as const;

  async createPaymentLink(req: PaymentLinkRequest): Promise<PaymentLinkResult> {
    return {
      providerRef: `instapay_${req.idempotencyKey}`,
      instructionsEn: "Transfer via InstaPay, then upload your payment proof for verification.",
      instructionsAr: "حوّل عبر إنستاباي ثم ارفع إثبات الدفع للمراجعة.",
    };
  }

  async createCardSession(_req: CardSessionRequest): Promise<CardSessionResult> {
    throw new Error("InstaPay is manual proof flow");
  }

  tokenizeFromWebhook(): TokenizeResult | null {
    return null;
  }

  async chargeToken(_req: ChargeTokenRequest): Promise<ChargeTokenResult> {
    throw new Error("InstaPay is manual proof flow");
  }

  verifyWebhookSignature(): boolean {
    return false;
  }

  parseWebhook(payload: unknown): ParsedWebhookEvent {
    const obj = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const idempotencyKey = String(obj.idempotency_key ?? randomUUID());
    return {
      idempotencyKey,
      providerRef: String(obj.provider_ref ?? idempotencyKey),
      amount: String(obj.amount ?? "0"),
      currency: String(obj.currency ?? "EGP"),
      status: "pending",
    };
  }

  async refund(req: RefundRequest): Promise<RefundResult> {
    return { providerRef: `${req.providerRef}_refund`, status: "pending" };
  }
}