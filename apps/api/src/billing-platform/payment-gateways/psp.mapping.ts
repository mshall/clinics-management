import { pickString } from "../../common/provider-http";
import type { PspConfig } from "../../common/provider-env";
import type {
  CardSessionRequest,
  CardSessionResult,
  ChargeTokenRequest,
  ChargeTokenResult,
  ParsedWebhookEvent,
  PaymentLinkRequest,
  PaymentLinkResult,
  RefundRequest,
  RefundResult,
  TokenizeResult,
} from "./payment-gateway.interface";

/**
 * THE ONLY FILE TO ADAPT for a real PSP (Paymob, Fawry, Stripe, Checkout.com, ...). Paths, request bodies, response
 * extraction and the webhook -> ParsedWebhookEvent mapping live here; shapes are documented in Docs/PROVIDER_INTEGRATION.md.
 * Amounts are decimal strings ("150.00") in the invoice currency; `reference` is the idempotency key.
 */
export const PSP_PATHS = {
  paymentLink: "/payment-links",
  cardSession: "/card-sessions",
  charge: "/charges",
  refund: "/refunds",
} as const;

export const pspAuthHeaders = (apiKey: string): Record<string, string> => ({ Authorization: `Bearer ${apiKey}` });

export const linkBody = (r: PaymentLinkRequest, c: PspConfig) => ({
  merchant_id: c.merchantId || undefined,
  reference: r.idempotencyKey,
  amount: r.amount,
  currency: r.currency,
  callback_url: c.callbackUrl || undefined,
  metadata: { tenant_id: r.tenantId, invoice_id: r.invoiceId },
});
export const linkResult = (json: unknown): PaymentLinkResult | null => {
  const id = pickString(json, "id", "payment_id", "data.id");
  if (!id) return null;
  return {
    providerRef: id,
    paymentUrl: pickString(json, "payment_url", "url", "data.payment_url") ?? undefined,
    referenceCode: pickString(json, "reference_code", "data.reference_code") ?? undefined,
    instructionsEn: pickString(json, "instructions_en") ?? undefined,
    instructionsAr: pickString(json, "instructions_ar") ?? undefined,
  };
};

export const sessionBody = (r: CardSessionRequest, c: PspConfig) => ({
  merchant_id: c.merchantId || undefined,
  return_url: r.returnUrl,
  customer_email: r.customerEmail,
  metadata: { tenant_id: r.tenantId },
});
export const sessionResult = (json: unknown): CardSessionResult | null => {
  const id = pickString(json, "id", "session_id", "data.id");
  const iframeUrl = pickString(json, "iframe_url", "data.iframe_url");
  const redirectUrl = pickString(json, "redirect_url", "url", "data.redirect_url") ?? iframeUrl;
  return id && iframeUrl && redirectUrl ? { sessionId: id, iframeUrl, redirectUrl } : null;
};

export const chargeBody = (r: ChargeTokenRequest, c: PspConfig) => ({
  merchant_id: c.merchantId || undefined,
  token: r.tokenRef,
  amount: r.amount,
  currency: r.currency,
  reference: r.idempotencyKey,
  metadata: { tenant_id: r.tenantId, invoice_id: r.invoiceId },
});
export const normalizePspStatus = (raw: unknown): "pending" | "succeeded" | "failed" => {
  const v = String(raw ?? "").toLowerCase();
  if (["succeeded", "success", "paid", "captured", "completed", "approved"].includes(v)) return "succeeded";
  if (["failed", "declined", "rejected", "error", "cancelled", "canceled", "expired", "voided"].includes(v)) return "failed";
  return "pending";
};
export const chargeResult = (json: unknown): ChargeTokenResult | null => {
  const id = pickString(json, "id", "payment_id", "data.id");
  return id ? { providerRef: id, status: normalizePspStatus(pickString(json, "status", "data.status")) } : null;
};

export const refundBody = (r: RefundRequest, c: PspConfig) => ({
  merchant_id: c.merchantId || undefined,
  payment_id: r.providerRef,
  amount: r.amount,
  currency: r.currency,
  reference: r.idempotencyKey,
});
export const refundResult = (json: unknown): RefundResult | null => {
  const id = pickString(json, "id", "refund_id", "data.id");
  return id ? { providerRef: id, status: normalizePspStatus(pickString(json, "status", "data.status")) } : null;
};

/** Neutral webhook: { event_id, type: "payment.succeeded|payment.failed|payment.pending|refund.succeeded|refund.failed", payment_id, amount, currency, metadata:{tenant_id,invoice_id} } */
export function webhookEvent(payload: unknown): ParsedWebhookEvent {
  const o = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const type = String(o.type ?? o.event ?? "");
  const meta = (o.metadata && typeof o.metadata === "object" ? o.metadata : {}) as Record<string, unknown>;
  const eventId = pickString(o, "event_id", "id") ?? "";
  const paymentId = pickString(o, "payment_id", "transaction_id") ?? eventId;
  const isRefund = type.startsWith("refund");
  const statusWord = type.includes(".") ? type.split(".")[1] : (o.status ?? "pending");
  return {
    idempotencyKey: eventId || `${paymentId}:${type}`,
    providerRef: paymentId,
    tenantId: typeof meta.tenant_id === "string" ? meta.tenant_id : undefined,
    invoiceId: typeof meta.invoice_id === "string" ? meta.invoice_id : undefined,
    amount: String(o.amount ?? "0"),
    currency: String(o.currency ?? "EGP"),
    status: normalizePspStatus(statusWord),
    kind: isRefund ? "refund" : "payment",
  };
}

/** Neutral token webhook: { token: { ref, brand, last4, exp_month, exp_year } } */
export function tokenFromWebhook(payload: unknown): TokenizeResult | null {
  const t = (payload as { token?: unknown } | null)?.token;
  if (!t || typeof t !== "object") return null;
  const o = t as Record<string, unknown>;
  const tokenRef = typeof o.ref === "string" ? o.ref : null;
  if (!tokenRef) return null;
  return {
    tokenRef,
    brand: typeof o.brand === "string" ? o.brand : undefined,
    last4: typeof o.last4 === "string" ? o.last4 : undefined,
    expMonth: typeof o.exp_month === "number" ? o.exp_month : undefined,
    expYear: typeof o.exp_year === "number" ? o.exp_year : undefined,
  };
}
