import { PayNotSupportedError, fromMinor, toMinor, type PayAdapter, type PayCapabilities, type PayEvent } from "@kiorex/pay-contract";
import type { PaymentGateway } from "./payment-gateway.interface";

/**
 * Presents a Kiorly SaaS billing gateway (paymob, fawry, instapay, bank) as a shared Kiorly Pay adapter (@kiorex/pay-contract), so the Clinic and kiorex-platform Pay speak ONE contract.
 * Pure adaptation: no new vendor call, no new credential. Amounts cross as integer minor units (the gateway keeps decimal strings).
 */
export function gatewayAsPayAdapter(gw: PaymentGateway, o: { decimals?: number } = {}): PayAdapter {
  const d = o.decimals ?? 2;
  const caps: PayCapabilities = { rails: gw.key === "bank" ? ["bank_transfer"] : gw.key === "instapay" ? ["instapay"] : gw.key === "fawry" ? ["fawry_code", "card"] : ["card", "wallet"], capture: false, void: false, status: false, partialRefund: false, hostedCheckout: gw.key !== "bank", cardFacts: false, fileIngest: false, qr: "LINK" };
  return {
    name: gw.key, capabilities: caps,
    async createCheckout(i) {
      const r = await gw.createPaymentLink({ tenantId: i.organisationId ?? "", invoiceId: i.subjectId ?? i.paymentId, amount: fromMinor(i.amountMinor, d), currency: i.currency, idempotencyKey: i.paymentId });
      return { pspRef: r.providerRef, checkoutUrl: r.paymentUrl, ...(r.referenceCode || r.instructionsEn ? { instructions: { reference: r.referenceCode ?? i.paymentId, en: r.instructionsEn ?? "", ar: r.instructionsAr ?? "" } } : {}) };
    },
    verifyWebhook(raw, headers) {
      const sig = String(headers["x-kiorly-signature"] ?? headers["x-signature"] ?? "") || undefined;
      let payload: unknown; try { payload = JSON.parse(raw); } catch { return null; }
      if (!gw.verifyWebhookSignature(raw, sig)) return null;
      const e = gw.parseWebhook(payload); const minor = toMinor(e.amount, d); if (minor === null) return null;
      const type = e.kind === "refund" ? (e.status === "failed" ? "refund.failed" : "refund.settled") : e.status === "succeeded" ? "payment.captured" : e.status === "failed" ? "payment.failed" : null;
      if (!type) return null; // pending events change nothing
      const out: PayEvent = { eventId: e.idempotencyKey, type, pspRef: e.providerRef, amountMinor: minor, currency: e.currency, occurredAt: new Date().toISOString(), ...(e.invoiceId ? { paymentId: e.invoiceId } : {}) };
      return out;
    },
    async refund(i) {
      const r = await gw.refund({ providerRef: i.pspRef, amount: fromMinor(i.amountMinor, d).toString(), currency: "EGP", idempotencyKey: i.refundId });
      if (r.status === "failed") throw new PayNotSupportedError(gw.key, "refund (gateway reported failure)");
      return { pspRefundRef: r.providerRef };
    },
  };
}
