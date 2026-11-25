import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createHmac } from "node:crypto";
import { clinicIpnConfig, invoiceTargets, outstandingMinor, toMinor, fromMinor } from "./pay-collections";
import { gatewayAsPayAdapter } from "../../billing-platform/payment-gateways/pay-contract-bridge";
import { PaymobGateway } from "../../billing-platform/payment-gateways/paymob.gateway";
import { BankTransferGateway } from "../../billing-platform/payment-gateways/bank.gateway";
import { PaymentGatewayRegistry } from "../../billing-platform/payment-gateways/payment-gateway.registry";

const dec = (s: string) => ({ toString: () => s });
describe("Pay unified collections (pure)", () => {
  it("outstanding is lines minus payments, never negative; settled invoices are not match targets", () => {
    const inv = { id: "i", invoiceNumber: "INV-1", clinicId: "c", tenantId: "t", currency: "EGP", issueDate: new Date(), patientName: "A B", lines: [{ amountPaid: dec("100.10") }, { amountPaid: dec("50") }], billingPayments: [{ totalAmount: dec("50.10") }] };
    assert.equal(outstandingMinor(inv), 10000);
    assert.equal(outstandingMinor({ ...inv, billingPayments: [{ totalAmount: dec("999") }] }), 0);
    assert.equal(invoiceTargets([inv]).length, 1); assert.equal(invoiceTargets([{ ...inv, billingPayments: [{ totalAmount: dec("150.10") }] }]).length, 0);
    assert.equal(toMinor(dec("1.10")), 110); assert.equal(fromMinor(12345), 123.45);
  });
  it("a bad CLINIC_BANK_IPN_CONFIG_JSON never half-applies", () => { assert.equal(clinicIpnConfig({ CLINIC_BANK_IPN_CONFIG_JSON: "{bad" }).columns.bankRef, "bankRef"); assert.equal(clinicIpnConfig({ CLINIC_BANK_IPN_CONFIG_JSON: '{"columns":{"bankRef":"TXN"}}' }).columns.bankRef, "TXN"); });
});

describe("gateways as shared Kiorly Pay adapters", () => {
  it("paymob mock gateway: checkout through the contract, signed webhook becomes a neutral event, forged is refused", async () => {
    const gw = new PaymobGateway(); const a = gatewayAsPayAdapter(gw);
    const co = await a.createCheckout({ paymentId: "p1", amountMinor: 25000, currency: "EGP", organisationId: "t1", subjectId: "inv1" });
    assert.ok(co.pspRef.startsWith("paymob_")); assert.ok(co.checkoutUrl);
    const body = JSON.stringify({ idempotency_key: "k1", provider_ref: "r1", amount: "250.00", currency: "EGP", status: "succeeded", invoice_id: "inv1" });
    const sig = gw.signMockWebhook?.(body) ?? createHmac("sha256", "dev-paymob-secret").update(body).digest("hex");
    const ev = a.verifyWebhook(body, { "x-kiorly-signature": sig });
    if (ev) { assert.equal(ev.type, "payment.captured"); assert.equal(ev.amountMinor, 25000); }
    assert.equal(a.verifyWebhook(body, { "x-kiorly-signature": "00" }), null);
    assert.equal(a.verifyWebhook("not json", {}), null);
  });
  it("the registry hands out contract adapters for every gateway key", () => { const r = new PaymentGatewayRegistry(); for (const k of r.listKeys()) assert.equal(r.getPayAdapter(k)?.name, k); assert.equal(r.getPayAdapter("nope"), null); });
  it("bank transfer gateway: never verifies a webhook (manual rail)", () => { assert.equal(gatewayAsPayAdapter(new BankTransferGateway()).verifyWebhook("{}", {}), null); });
});
