import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import { assertNoPanOrCvvInBody } from "./kiorly-payment-no-pan";
import { isKiorlyDunningPaused } from "./kiorly-dunning";
import { PaymobGateway } from "./payment-gateways/paymob.gateway";

describe("SB-02 Kiorly payments", () => {
  it("rejects PAN/CVV fields on billing payment payloads", () => {
    assert.throws(
      () => assertNoPanOrCvvInBody({ method: "card", cardNumber: "4111111111111111" }),
      /must not be sent to Kiorly/,
    );
    assert.throws(() => assertNoPanOrCvvInBody({ nested: { cvv: "123" } }), /must not be sent/);
    assert.doesNotThrow(() => assertNoPanOrCvvInBody({ method: "fawry", paymentMethodId: "pm_1" }));
  });

  it("dunning pause flag blocks past-due transition window", () => {
    const future = new Date(Date.now() + 86_400_000);
    assert.equal(isKiorlyDunningPaused({ kiorlyDunningPausedUntil: future }), true);
    assert.equal(isKiorlyDunningPaused({ kiorlyDunningPausedUntil: null }), false);
  });

  it("Paymob webhook signature verifies HMAC", () => {
    const gateway = new PaymobGateway();
    const body = JSON.stringify({ idempotency_key: "evt1", success: true, amount: 100 });
    const secret = process.env.KIORLY_PAYMOB_WEBHOOK_SECRET ?? "dev-paymob-secret";
    const sig = createHmac("sha256", secret).update(body, "utf8").digest("hex");
    assert.equal(gateway.verifyWebhookSignature(body, sig), true);
    assert.equal(gateway.verifyWebhookSignature(body, "bad"), false);
  });
});