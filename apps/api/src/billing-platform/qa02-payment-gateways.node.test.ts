import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FawryGateway } from "./payment-gateways/fawry.gateway";
import { PaymobGateway } from "./payment-gateways/paymob.gateway";
import { PaymentGatewayRegistry } from "./payment-gateways/payment-gateway.registry";

describe("QA-02 payment gateway money primitives", () => {
  const reg = new PaymentGatewayRegistry();

  it("registry exposes all Egypt aggregator stubs", () => {
    assert.ok(reg.get("paymob"));
    assert.ok(reg.get("fawry"));
    assert.ok(reg.get("instapay"));
    assert.ok(reg.get("bank"));
  });

  it("Fawry creates payment link and refund stub", async () => {
    const g = new FawryGateway();
    const link = await g.createPaymentLink({
      tenantId: "t1",
      invoiceId: "inv1",
      amount: "100.00",
      currency: "EGP",
      idempotencyKey: "key1",
    });
    assert.ok(link.providerRef);
    const refund = await g.refund({
      amount: "50",
      currency: "EGP",
      providerRef: link.providerRef,
      idempotencyKey: "ref1",
    });
    assert.equal(refund.status, "pending");
  });

  it("InstaPay and bank gateways issue links and pending refunds", async () => {
    const instapay = reg.get("instapay");
    const bank = reg.get("bank");
    assert.ok(instapay && bank);
    for (const g of [instapay, bank]) {
      const link = await g.createPaymentLink({
        tenantId: "t2",
        invoiceId: "inv2",
        amount: "200",
        currency: "EGP",
        idempotencyKey: `id-${g.key}`,
      });
      assert.ok(link.instructionsEn);
      const refund = await g.refund({
        amount: "200",
        currency: "EGP",
        providerRef: link.providerRef,
        idempotencyKey: "ref2",
      });
      assert.equal(refund.status, "pending");
    }
  });

  it("Paymob card session, charge, webhook parse, and refund", async () => {
    const g = new PaymobGateway();
    const session = await g.createCardSession({
      tenantId: "t3",
      returnUrl: "https://app.kiorly.test/billing",
      customerEmail: "billing@test.com",
    });
    assert.ok(session.iframeUrl.includes("session="));

    const charge = await g.chargeToken({
      tenantId: "t3",
      tokenRef: "tok_test",
      amount: "500",
      currency: "EGP",
      invoiceId: "inv3",
      idempotencyKey: "chg1",
    });
    assert.ok(charge.providerRef);

    const payload = { idempotency_key: "wh1", transaction_id: "tx1", amount: "500", currency: "EGP", success: true };
    const raw = JSON.stringify(payload);
    const parsed = g.parseWebhook(payload);
    assert.equal(parsed.status, "succeeded");

    const refund = await g.refund({
      amount: "500",
      currency: "EGP",
      providerRef: charge.providerRef,
      idempotencyKey: "ref3",
    });
    assert.equal(refund.status, "succeeded");

    const token = g.tokenizeFromWebhook({ token: "tok_xyz", brand: "VISA", last4: "4242" });
    assert.ok(token?.tokenRef);

    assert.equal(g.verifyWebhookSignature(raw, "sha256=invalid"), false);
  });
});