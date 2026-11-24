import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, afterEach, before, describe, it } from "node:test";
import { UnauthorizedException } from "@nestjs/common";
import { providerEnvProblems, providerStatus, vendorPspConfig, type VendorPspConfig } from "../../common/provider-env";
import { providerMode } from "../../common/provider-mode";
import { fawryCallbackSignature } from "../../common/vendors/fawry";
import { paymobHmac } from "../../common/vendors/paymob";
import { KiorlyPaymentService } from "../kiorly-payment.service";
import { PspError, HttpPspGateway } from "./http-psp.gateway";
import { PaymentGatewayRegistry } from "./payment-gateway.registry";
import { FawryGateway } from "./fawry.gateway";
import { PaymobGateway } from "./paymob.gateway";
import { FawryVendorGateway, PaymobVendorGateway, toMinor } from "./vendor-psp.gateways";

type Seen = { method?: string; url?: string; headers: IncomingMessage["headers"]; body: any };
let server: Server; let base = ""; let seen: Seen[] = []; let script: Array<{ status: number; body: unknown }> = [];
before(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      seen.push({ method: req.method, url: req.url, headers: req.headers, body: raw ? JSON.parse(raw) : null });
      const out = script.shift() ?? { status: 200, body: {} };
      res.writeHead(out.status, { "content-type": "application/json" });
      res.end(JSON.stringify(out.body));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());
afterEach(() => { seen = []; script = []; });

const SECRET = "hmac-secret-XYZ"; const SK = "egy_sk_test_SECRET"; const FKEY = "fawry-secure-KEY";
const cfg = (): VendorPspConfig => ({
  timeoutMs: 2000, maxRetries: 2, backoffMs: 1, publicApiUrl: "https://api.kiorly.test", webUrl: "https://app.kiorly.test",
  paymob: { apiUrl: base, secretKey: SK, publicKey: "egy_pk_test_1", hmacSecret: SECRET, integrationIds: [4321, 4322] },
  fawry: { apiUrl: base, merchantCode: "MC1", secureKey: FKEY },
});
const fast = { sleep: async () => undefined };
const paymob = () => new PaymobVendorGateway(cfg(), fast); const fawry = () => new FawryVendorGateway(cfg(), fast);
const txn = (over: Record<string, unknown> = {}) => ({ type: "TRANSACTION", obj: { id: 998877, amount_cents: 15000, currency: "EGP", success: true, pending: false, is_refunded: false, is_voided: false, created_at: "2026-11-24T10:00:00.000000", order: { id: 5544, merchant_order_id: "pay_inv1_abc" }, ...over } });
const fawryCb = (over: Record<string, unknown> = {}) => { const b: Record<string, unknown> = { requestId: "r1", fawryRefNumber: "970505", merchantRefNumber: "pay_inv1_abc", paymentAmount: 150, orderAmount: 150, orderStatus: "PAID", paymentMethod: "PAYATFAWRY", paymentRefrenceNumber: "9988", paymentTime: 1700000000000, ...over }; return { ...b, messageSignature: fawryCallbackSignature(FKEY, b) }; };

describe("amounts", () => { it("parses decimal strings to minor units without floats and rejects junk", () => {
  assert.equal(toMinor("150.00"), 15000); assert.equal(toMinor("19.99"), 1999); assert.equal(toMinor("7"), 700); assert.equal(toMinor("0.5"), 50);
  assert.throws(() => toMinor("abc"), PspError); assert.throws(() => toMinor("0.00"), PspError); assert.throws(() => toMinor("-5"), PspError);
}); });

describe("Paymob Accept (faked HTTP)", () => {
  it("createPaymentLink calls the Intention API with the secret key and returns the hosted checkout URL", async () => {
    script = [{ status: 200, body: { client_secret: "cs_abc", intention_order_id: 5544 } }];
    const r = await paymob().createPaymentLink({ tenantId: "t1", invoiceId: "inv1", amount: "150.00", currency: "EGP", idempotencyKey: "pay_inv1_abc" });
    assert.deepEqual(r, { providerRef: "5544", paymentUrl: `${base}/unifiedcheckout/?publicKey=egy_pk_test_1&clientSecret=cs_abc` });
    assert.equal(seen[0]!.url, "/v1/intention/"); assert.equal(seen[0]!.headers.authorization, `Token ${SK}`); assert.equal(seen[0]!.headers["idempotency-key"], "pay_inv1_abc");
    assert.deepEqual(seen[0]!.body, { ...seen[0]!.body, amount: 15000, currency: "EGP", payment_methods: [4321, 4322], special_reference: "pay_inv1_abc",
      notification_url: "https://api.kiorly.test/api/v1/webhooks/payments/paymob", redirection_url: "https://app.kiorly.test/billing?payment=pay_inv1_abc" });
    assert.equal(seen[0]!.body.items[0].name, "Kiorly subscription");
  });
  it("retries 5xx with the SAME idempotency key; 401 is a non-retried AUTH error that never echoes the key", async () => {
    script = [{ status: 503, body: {} }, { status: 200, body: { client_secret: "cs", intention_order_id: 1 } }];
    await paymob().createPaymentLink({ tenantId: "t", invoiceId: "i", amount: "10.00", currency: "EGP", idempotencyKey: "k1" });
    assert.equal(seen.length, 2); assert.equal(seen[1]!.headers["idempotency-key"], "k1");
    seen = []; script = [{ status: 401, body: { detail: `bad token ${SK}` } }];
    await assert.rejects(paymob().createPaymentLink({ tenantId: "t", invoiceId: "i", amount: "10.00", currency: "EGP", idempotencyKey: "k2" }), (e: unknown) => e instanceof PspError && e.failureClass === "AUTH" && !e.message.includes(SK));
    assert.equal(seen.length, 1);
  });
  it("verifies the HMAC-SHA512 callback (?hmac=), rejects tampering, a wrong secret and a missing hmac", () => {
    const body = txn(); const raw = JSON.stringify(body); const good = paymobHmac(SECRET, body.obj);
    assert.equal(paymob().verifyWebhookSignature(raw, good), true);
    assert.equal(paymob().verifyWebhookSignature(JSON.stringify(txn({ amount_cents: 1 })), good), false);
    assert.equal(paymob().verifyWebhookSignature(raw, paymobHmac("other", body.obj)), false);
    assert.equal(paymob().verifyWebhookSignature(raw, undefined), false);
    assert.equal(paymob().verifyWebhookSignature("not json", good), false);
  });
  it("parses captured / failed / refund / pending callbacks to deterministic idempotency keys and the order id", () => {
    const g = paymob();
    const ok = g.parseWebhook(txn());
    assert.deepEqual(ok, { idempotencyKey: "paymob_998877", providerRef: "5544", amount: "150.00", currency: "EGP", status: "succeeded", kind: "payment" });
    assert.deepEqual(g.parseWebhook(txn()), ok); // same payload -> same key (webhook dedupe)
    assert.equal(g.parseWebhook(txn({ success: false })).status, "failed");
    assert.deepEqual(g.parseWebhook(txn({ id: 998878, is_refunded: true })), { idempotencyKey: "paymob_998878_refund", providerRef: "5544", amount: "150.00", currency: "EGP", status: "succeeded", kind: "refund" });
    const pending = g.parseWebhook(txn({ pending: true, success: false }));
    assert.equal(pending.status, "pending"); assert.equal(pending.kind, undefined);
  });
  it("refund looks up the transaction from the order id, then refunds in minor units (pending until the callback)", async () => {
    script = [{ status: 200, body: { id: 998877 } }, { status: 200, body: { id: 77 } }];
    const r = await paymob().refund({ providerRef: "5544", amount: "50.00", currency: "EGP", idempotencyKey: "refund_p1_50.00" });
    assert.deepEqual(r, { providerRef: "77", status: "pending" });
    assert.equal(seen[0]!.url, "/api/ecommerce/orders/transaction_inquiry"); assert.deepEqual(seen[0]!.body, { order_id: "5544" });
    assert.equal(seen[1]!.url, "/api/acceptance/void_refund/refund"); assert.deepEqual(seen[1]!.body, { transaction_id: 998877, amount_cents: 5000 }); assert.equal(seen[1]!.headers["idempotency-key"], "refund_p1_50.00");
  });
  it("does NOT implement stored-card tokenisation (product decision pending)", async () => {
    const g = paymob();
    assert.equal(g.tokenizeFromWebhook(), null);
    await assert.rejects(g.createCardSession({ tenantId: "t", returnUrl: "https://x" }), (e: unknown) => e instanceof PspError && !e.retryable && /tokenisation is not enabled/.test(e.message));
    await assert.rejects(g.chargeToken({ tenantId: "t", tokenRef: "tok", amount: "1.00", currency: "EGP", invoiceId: "i", idempotencyKey: "k" }), PspError);
    assert.equal(seen.length, 0);
  });
});

describe("FawryPay (faked HTTP)", () => {
  it("createPaymentLink returns a signed FawryPay checkout URL keyed by merchantRefNum", async () => {
    const r = await fawry().createPaymentLink({ tenantId: "t1", invoiceId: "inv1", amount: "150.00", currency: "EGP", idempotencyKey: "pay_inv1_abc" });
    assert.equal(r.providerRef, "pay_inv1_abc");
    const u = new URL(r.paymentUrl!); assert.equal(u.pathname, "/ECommercePlugin/FawryPay.jsp");
    const cr = JSON.parse(u.searchParams.get("chargeRequest")!);
    assert.equal(cr.merchantCode, "MC1"); assert.equal(cr.merchantRefNum, "pay_inv1_abc"); assert.equal(cr.chargeItems[0].price, "150.00");
    assert.equal(cr.orderWebHookUrl, "https://api.kiorly.test/api/v1/webhooks/payments/fawry"); assert.match(cr.signature, /^[0-9a-f]{64}$/);
    assert.ok(!r.paymentUrl!.includes(FKEY)); assert.ok(r.instructionsEn && r.instructionsAr);
  });
  it("verifies the in-body SHA-256 signature and rejects tampered amounts / wrong key", () => {
    const cb = fawryCb(); assert.equal(fawry().verifyWebhookSignature(JSON.stringify(cb)), true);
    assert.equal(fawry().verifyWebhookSignature(JSON.stringify({ ...cb, paymentAmount: 1 })), false);
    assert.equal(new FawryVendorGateway({ ...cfg(), fawry: { ...cfg().fawry, secureKey: "other" } }).verifyWebhookSignature(JSON.stringify(cb)), false);
    assert.equal(fawry().verifyWebhookSignature("nope"), false);
  });
  it("parses PAID / FAILED / REFUNDED / NEW callbacks (providerRef = merchantRefNumber, stable keys)", () => {
    const g = fawry();
    const paid = g.parseWebhook(fawryCb());
    assert.deepEqual(paid, { idempotencyKey: "fawry_970505_PAID", providerRef: "pay_inv1_abc", amount: "150.00", currency: "EGP", status: "succeeded", kind: "payment" });
    assert.deepEqual(g.parseWebhook(fawryCb()), paid);
    assert.equal(g.parseWebhook(fawryCb({ orderStatus: "FAILED" })).status, "failed");
    assert.deepEqual(g.parseWebhook(fawryCb({ orderStatus: "REFUNDED" })), { idempotencyKey: "fawry_970505_REFUNDED", providerRef: "pay_inv1_abc", amount: "150.00", currency: "EGP", status: "succeeded", kind: "refund" });
    assert.equal(g.parseWebhook(fawryCb({ orderStatus: "NEW" })).status, "pending");
  });
  it("refund reads the Fawry reference from the status API, then posts a signed refund (pending until REFUNDED arrives)", async () => {
    script = [{ status: 200, body: { fawryRefNumber: "970505" } }, { status: 200, body: { statusCode: 200 } }];
    const r = await fawry().refund({ providerRef: "pay_inv1_abc", amount: "20.00", currency: "EGP", idempotencyKey: "refund_p1_20.00" });
    assert.equal(r.status, "pending"); assert.equal(r.providerRef, "970505_refund_refund_p1_20.00");
    assert.equal(seen[0]!.method, "GET"); assert.match(seen[0]!.url!, /^\/ECommerceWeb\/Fawry\/payments\/status\/v2\?merchantCode=MC1&merchantRefNumber=pay_inv1_abc&signature=[0-9a-f]{64}$/);
    assert.equal(seen[1]!.url, "/ECommerceWeb/Fawry/payments/refund"); assert.equal(seen[1]!.body.referenceNumber, "970505"); assert.equal(seen[1]!.body.refundAmount, 20);
    script = [{ status: 200, body: { fawryRefNumber: "1" } }, { status: 200, body: { statusCode: 9901 } }];
    await assert.rejects(fawry().refund({ providerRef: "x", amount: "1.00", currency: "EGP", idempotencyKey: "k" }), PspError);
  });
  it("has no card tokens either", async () => {
    await assert.rejects(fawry().createCardSession(), PspError); assert.equal(fawry().tokenizeFromWebhook(), null);
  });
});

describe("configuration: PAYMENT_MODE / PAYMENT_PROVIDER, registry, fail-fast", () => {
  const saved = { ...process.env };
  const reset = () => { for (const k of Object.keys(process.env)) if (/^(PSP_|PAYMENT_|PAYMOB_|FAWRY_|KIORLY_PROVIDER)/.test(k)) delete process.env[k]; };
  afterEach(() => { reset(); Object.assign(process.env, saved); });
  const vendorEnv = { PAYMENT_MODE: "real", PAYMENT_PROVIDER: "vendor", PAYMENT_PUBLIC_API_URL: "https://api.kiorly.com", APP_WEB_URL: "https://app.kiorly.com", PAYMOB_SECRET_KEY: "sk", PAYMOB_PUBLIC_KEY: "pk", PAYMOB_HMAC_SECRET: "h", PAYMOB_INTEGRATION_IDS: "1, 2", FAWRY_MERCHANT_CODE: "m", FAWRY_SECURE_KEY: "s" };

  it("mock stays the default; PAYMENT_MODE=real is an alias of the psp mode", () => {
    reset(); assert.equal(providerMode("psp"), "mock");
    assert.ok(new PaymentGatewayRegistry().get("paymob") instanceof PaymobGateway); assert.ok(new PaymentGatewayRegistry().get("fawry") instanceof FawryGateway);
    process.env.PAYMENT_MODE = "real"; assert.equal(providerMode("psp"), "real");
    process.env.PSP_MODE = "mock"; assert.equal(providerMode("psp"), "mock"); // the specific name still wins
  });
  it("real + PAYMENT_PROVIDER unset keeps the neutral gateway; =vendor registers the native clients; PAYMENT_ENABLED_PSPS limits them", () => {
    reset(); process.env.PAYMENT_MODE = "real";
    assert.ok(new PaymentGatewayRegistry().get("paymob") instanceof HttpPspGateway);
    Object.assign(process.env, vendorEnv);
    const r = new PaymentGatewayRegistry();
    assert.ok(r.get("paymob") instanceof PaymobVendorGateway); assert.ok(r.get("fawry") instanceof FawryVendorGateway);
    process.env.PAYMENT_ENABLED_PSPS = "fawry";
    const only = new PaymentGatewayRegistry(); assert.equal(only.get("paymob"), null); assert.ok(only.get("fawry")); assert.ok(only.get("instapay"));
  });
  it("fail-fast names the missing variables (never values) and a complete config is clean", () => {
    const bad = providerEnvProblems({ PAYMENT_MODE: "real", PAYMENT_PROVIDER: "vendor", PAYMOB_SECRET_KEY: "sk_live_supersecret" } as NodeJS.ProcessEnv).filter((p) => p.startsWith("PSP"));
    assert.ok(bad.some((p) => p.includes("PAYMOB_HMAC_SECRET"))); assert.ok(bad.some((p) => p.includes("FAWRY_SECURE_KEY"))); assert.ok(bad.some((p) => p.includes("PAYMENT_PUBLIC_API_URL")));
    assert.ok(!JSON.stringify(bad).includes("sk_live_supersecret"));
    const env = { ...vendorEnv } as NodeJS.ProcessEnv; process.env.PAYMENT_MODE = "real";
    assert.deepEqual(providerEnvProblems(env).filter((p) => p.startsWith("PSP")), []);
    assert.equal(vendorPspConfig(env).paymob.integrationIds.join(), "1,2");
    assert.equal(providerStatus(env).find((r) => r.provider === "psp")!.vendor, "native:paymob+fawry");
  });
});

describe("webhook wiring through KiorlyPaymentService (signature, then idempotency)", () => {
  const svc = (dup: boolean) => {
    const prisma = { kiorlyPaymentWebhookEvent: { findUnique: async () => (dup ? { paymentId: "pay-1" } : null) } } as never;
    const reg = Object.assign(new PaymentGatewayRegistry(), { get: (k: string) => (k === "paymob" ? paymob() : k === "fawry" ? fawry() : null) });
    return new KiorlyPaymentService(prisma, reg as never, {} as never, {} as never, {} as never);
  };
  it("a Paymob callback with a wrong or missing hmac is 401; a replay of a verified one is acknowledged as a duplicate", async () => {
    const body = txn(); const raw = JSON.stringify(body);
    await assert.rejects(svc(false).handleWebhook("paymob", raw, "deadbeef", body), UnauthorizedException);
    await assert.rejects(svc(false).handleWebhook("paymob", raw, undefined, body), UnauthorizedException);
    assert.deepEqual(await svc(true).handleWebhook("paymob", raw, paymobHmac(SECRET, body.obj), body), { ok: true, duplicate: true, paymentId: "pay-1" });
  });
  it("a Fawry callback with a forged signature is 401; a replay of a verified one is a duplicate", async () => {
    const cb = fawryCb(); const raw = JSON.stringify(cb);
    await assert.rejects(svc(false).handleWebhook("fawry", JSON.stringify({ ...cb, paymentAmount: 999 }), undefined, { ...cb, paymentAmount: 999 }), UnauthorizedException);
    assert.deepEqual(await svc(true).handleWebhook("fawry", raw, undefined, cb), { ok: true, duplicate: true, paymentId: "pay-1" });
  });
});
