import { type VendorPspConfig, vendorPspConfig } from "../../common/provider-env";
import { providerHttp, type ProviderHttpRequest } from "../../common/provider-http";
import { fawryCheckoutUrl, fawryRefundBody, fawryStatusUrl, parseFawryCallback, verifyFawryCallback } from "../../common/vendors/fawry";
import { paymobAuth, paymobIntentionBody, paymobRefundBody, paymobTransactionIdFromInquiry, parsePaymobCallback, parsePaymobIntention, verifyPaymobHmac } from "../../common/vendors/paymob";
import type {
  CardSessionRequest, CardSessionResult, ChargeTokenRequest, ChargeTokenResult, ParsedWebhookEvent, PaymentGateway, PaymentLinkRequest, PaymentLinkResult,
  RefundRequest, RefundResult, TokenizeResult,
} from "./payment-gateway.interface";
import { PspError } from "./http-psp.gateway";

/**
 * Native Paymob Accept and FawryPay clients for Kiorly subscription invoices (PSP mode real + PAYMENT_PROVIDER=vendor). Wire formats are the copies in common/vendors.
 * Hosted checkout only: card data is entered on the PSP's page and never reaches Kiorly. Stored-card tokenisation (createCardSession / tokenizeFromWebhook / chargeToken)
 * is deliberately NOT implemented: it needs a product decision (Docs/KIORLY_NEEDS_HUMAN.md, NH-PSP-01), so those calls fail with a clear permanent error.
 * Webhook idempotency: every event gets a deterministic key (`paymob_<txn id>[_refund]`, `fawry_<ref>_<status>`) that KiorlyPaymentService stores uniquely per provider.
 */
type Http = Pick<ProviderHttpRequest, "fetchImpl" | "sleep">;
const NO_TOKENS = "Stored-card tokenisation is not enabled (product decision pending)";

/** "150.00" -> 15000 (no floating point on money: parsed from the decimal string). */
export function toMinor(amount: string): number {
  const m = /^(\d+)(?:\.(\d{1,2}))?\d*$/.exec(amount.trim());
  if (!m) throw new PspError("Invalid amount", "PERMANENT", false);
  const minor = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  if (!Number.isSafeInteger(minor) || minor <= 0) throw new PspError("Invalid amount", "PERMANENT", false);
  return minor;
}
export const toMajor = (minor: number) => (minor / 100).toFixed(2);

abstract class VendorBase {
  constructor(protected readonly cfg: VendorPspConfig, protected readonly http: Http) {}
  protected async call(req: Omit<ProviderHttpRequest, "timeoutMs" | "retries" | "backoffMs" | "fetchImpl" | "sleep">, secrets: string[]) {
    const res = await providerHttp({ timeoutMs: this.cfg.timeoutMs, retries: this.cfg.maxRetries, backoffMs: this.cfg.backoffMs, secrets, ...req, ...this.http });
    if (!res.ok) throw new PspError(`PSP ${new URL(req.url).pathname}: ${res.error}`, res.failureClass, res.retryable);
    return res.json as any;
  }
  protected returnUrl(idempotencyKey: string) { return `${this.cfg.webUrl}/billing?payment=${encodeURIComponent(idempotencyKey)}`; }
  protected notifyUrl(provider: string) { return `${this.cfg.publicApiUrl}/api/v1/webhooks/payments/${provider}`; }
  tokenizeFromWebhook(): TokenizeResult | null { return null; }
  async createCardSession(_req: CardSessionRequest): Promise<CardSessionResult> { throw new PspError(NO_TOKENS, "PERMANENT", false); }
  async chargeToken(_req: ChargeTokenRequest): Promise<ChargeTokenResult> { throw new PspError(NO_TOKENS, "PERMANENT", false); }
}

export class PaymobVendorGateway extends VendorBase implements PaymentGateway {
  readonly key = "paymob" as const;
  constructor(cfg: VendorPspConfig = vendorPspConfig(), http: Http = {}) { super(cfg, http); }
  private get c() { return this.cfg.paymob; }

  /** Intention API: returns the unified-checkout URL (hosted card / wallet page). `providerRef` = Paymob order id, which the processed callback echoes as `order.id`. */
  async createPaymentLink(req: PaymentLinkRequest): Promise<PaymentLinkResult> {
    const body = paymobIntentionBody({ paymentId: req.idempotencyKey, amountMinor: toMinor(req.amount), currency: req.currency, integrationIds: this.c.integrationIds, notificationUrl: this.notifyUrl("paymob"), redirectionUrl: this.returnUrl(req.idempotencyKey) });
    const json = await this.call({ url: `${this.c.apiUrl}/v1/intention/`, headers: paymobAuth(this.c.secretKey), body, idempotencyKey: req.idempotencyKey }, [this.c.secretKey, this.c.hmacSecret]);
    let out: { pspRef: string; checkoutUrl: string };
    try { out = parsePaymobIntention(json, this.c.apiUrl, this.c.publicKey); } catch { throw new PspError("PSP /v1/intention/: unexpected response shape", "UNKNOWN", false); }
    return { providerRef: out.pspRef, paymentUrl: out.checkoutUrl };
  }

  /** The processed callback carries `?hmac=` (HMAC-SHA512 over the documented field concatenation of `obj`); the body is the raw JSON. */
  verifyWebhookSignature(rawBody: string, signatureHeader: string | undefined): boolean {
    let obj: unknown; try { obj = JSON.parse(rawBody)?.obj; } catch { return false; }
    return !!obj && verifyPaymobHmac(this.c.hmacSecret, obj, signatureHeader?.trim() ?? "");
  }

  parseWebhook(payload: unknown): ParsedWebhookEvent {
    const o = (payload as { obj?: Record<string, any> } | null)?.obj ?? {};
    const ev = parsePaymobCallback(payload as object);
    const currency = String(o.currency ?? "EGP");
    if (!ev) {
      // Pending / voided / not a TRANSACTION: acknowledged without moving money (a stable key keeps it idempotent too).
      return { idempotencyKey: `paymob_${o.id ?? "unknown"}_${o.pending ? "pending" : "ignored"}`, providerRef: String(o.order?.id ?? o.id ?? "unknown"), amount: toMajor(Number(o.amount_cents) || 0), currency, status: "pending" };
    }
    // Refund callbacks echo the same order id, so the refund resolves to the original KiorlyPayment.
    return { idempotencyKey: ev.eventId, providerRef: ev.type === "refund.settled" ? String(o.order?.id ?? ev.pspRef) : ev.pspRef, amount: toMajor(ev.amountMinor), currency, status: ev.type === "payment.failed" ? "failed" : "succeeded", kind: ev.type === "refund.settled" ? "refund" : "payment" };
  }

  /** Looks the successful transaction up from the order id, then refunds it; the settled refund arrives as a callback (finalised by KiorlyPaymentService). */
  async refund(req: RefundRequest): Promise<RefundResult> {
    const auth = paymobAuth(this.c.secretKey); const secrets = [this.c.secretKey, this.c.hmacSecret];
    const inq = await this.call({ url: `${this.c.apiUrl}/api/ecommerce/orders/transaction_inquiry`, headers: auth, body: { order_id: req.providerRef }, idempotencyKey: `inq_${req.idempotencyKey}` }, secrets);
    let txn: string; try { txn = paymobTransactionIdFromInquiry(inq); } catch { throw new PspError("PSP transaction_inquiry: no transaction id", "UNKNOWN", false); }
    const r = await this.call({ url: `${this.c.apiUrl}/api/acceptance/void_refund/refund`, headers: auth, body: paymobRefundBody(txn, toMinor(req.amount)), idempotencyKey: req.idempotencyKey }, secrets);
    if (r?.id === undefined) throw new PspError("PSP refund: no refund id in response", "UNKNOWN", false);
    return { providerRef: String(r.id), status: "pending" };
  }
}

export class FawryVendorGateway extends VendorBase implements PaymentGateway {
  readonly key = "fawry" as const;
  constructor(cfg: VendorPspConfig = vendorPspConfig(), http: Http = {}) { super(cfg, http); }
  private get c() { return this.cfg.fawry; }

  /** FawryPay hosted page (card or pay-at-outlet reference). `providerRef` = merchantRefNum (= the idempotency key), echoed by the callback as merchantRefNumber. */
  async createPaymentLink(req: PaymentLinkRequest): Promise<PaymentLinkResult> {
    const o = fawryCheckoutUrl({ apiUrl: this.c.apiUrl, merchantCode: this.c.merchantCode, secureKey: this.c.secureKey, paymentId: req.idempotencyKey, amountMinor: toMinor(req.amount), returnUrl: this.returnUrl(req.idempotencyKey), webhookUrl: this.notifyUrl("fawry") });
    return { providerRef: o.pspRef, paymentUrl: o.checkoutUrl, instructionsEn: "Continue on the Fawry page to pay by card or with a reference code at any Fawry outlet.", instructionsAr: "تابع إلى صفحة فوري للدفع بالبطاقة أو برقم مرجعي في أي منفذ فوري." };
  }

  /** The callback is signed inside the body (`messageSignature`, SHA-256 with the secure key); the header is not used. */
  verifyWebhookSignature(rawBody: string): boolean { return verifyFawryCallback(this.c.secureKey, rawBody) !== null; }

  parseWebhook(payload: unknown): ParsedWebhookEvent {
    const b = (payload ?? {}) as Record<string, any>;
    const ev = parseFawryCallback(b);
    const currency = String(b.paymentCurrency ?? "EGP");
    const providerRef = String(b.merchantRefNumber ?? ""); // the KiorlyPayment's providerRef for payments AND refunds
    if (!ev) return { idempotencyKey: `fawry_${b.fawryRefNumber}_${String(b.orderStatus ?? "UNKNOWN").toUpperCase()}`, providerRef, amount: toMajor(Math.round(Number(b.paymentAmount) * 100) || 0), currency, status: "pending" };
    return { idempotencyKey: ev.eventId, providerRef, amount: toMajor(ev.amountMinor), currency, status: ev.type === "payment.failed" ? "failed" : "succeeded", kind: ev.type === "refund.settled" ? "refund" : "payment" };
  }

  async refund(req: RefundRequest): Promise<RefundResult> {
    const secrets = [this.c.secureKey];
    const st = await this.call({ url: fawryStatusUrl(this.c.apiUrl, this.c.merchantCode, this.c.secureKey, req.providerRef), method: "GET", idempotencyKey: `status_${req.idempotencyKey}` }, secrets);
    const ref = st?.fawryRefNumber; if (!ref) throw new PspError("PSP status: no fawryRefNumber", "UNKNOWN", false);
    const r = await this.call({ url: `${this.c.apiUrl}/ECommerceWeb/Fawry/payments/refund`, body: fawryRefundBody({ merchantCode: this.c.merchantCode, secureKey: this.c.secureKey, fawryRefNumber: String(ref), amountMinor: toMinor(req.amount), reason: `refund ${req.idempotencyKey}` }), idempotencyKey: req.idempotencyKey }, secrets);
    if (Number(r?.statusCode) !== 200) throw new PspError(`PSP refund rejected (${String(r?.statusCode ?? "unknown")})`, "PERMANENT", false);
    return { providerRef: `${String(ref)}_refund_${req.idempotencyKey}`, status: "pending" };
  }
}
