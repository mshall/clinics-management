import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, afterEach, before, describe, it } from "node:test";
import { assertProviderEnv, providerEnvProblems } from "../../common/provider-env";
import { providerHttp, redactSecrets } from "../../common/provider-http";
import { providerMode } from "../../common/provider-mode";
import { signWebhook, verifyWebhookSignature } from "../../common/webhook-hmac";
import { HttpPspGateway } from "../../billing-platform/payment-gateways/http-psp.gateway";
import { HttpEmailTransport } from "./email-http.provider";
import { parseNeutralReceipts } from "./delivery-receipt";
import { HttpSmsProvider } from "./sms.provider";
import { HttpWhatsAppProvider } from "./whatsapp-http.provider";

type Seen = { method?: string; url?: string; headers: IncomingMessage["headers"]; body: unknown };
let server: Server;
let base: string;
let seen: Seen[] = [];
/** Per-test scripted responses, consumed in order; falls back to 200 {id:"msg-1"}. */
let script: { status: number; body?: unknown; headers?: Record<string, string> }[] = [];

before(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      seen.push({ method: req.method, url: req.url, headers: req.headers, body: raw ? JSON.parse(raw) : null });
      const next = script.shift() ?? { status: 200, body: { id: "msg-1", status: "pending" } };
      res.writeHead(next.status, { "content-type": "application/json", ...(next.headers ?? {}) });
      res.end(JSON.stringify(next.body ?? {}));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());
afterEach(() => {
  seen = [];
  script = [];
});

const fast = { sleep: async () => undefined };
const baseCfg = { apiKey: "key-SECRET-123", webhookSecret: "whsec-456", timeoutMs: 2000, maxRetries: 2, backoffMs: 1 };

describe("providerHttp", () => {
  it("retries 5xx with the SAME idempotency key, then succeeds", async () => {
    script = [{ status: 503, body: { e: 1 } }, { status: 200, body: { id: "x" } }];
    const r = await providerHttp({ url: `${base}/a`, body: { a: 1 }, idempotencyKey: "idem-1", ...fast });
    assert.equal(r.ok, true);
    assert.equal(r.attempts, 2);
    assert.equal(seen.length, 2);
    assert.equal(seen[0]!.headers["idempotency-key"], "idem-1");
    assert.equal(seen[1]!.headers["idempotency-key"], "idem-1");
  });

  it("does not retry 4xx and maps 401 to AUTH, 422 to PERMANENT", async () => {
    script = [{ status: 401 }];
    const a = await providerHttp({ url: `${base}/a`, ...fast });
    assert.ok(!a.ok && a.failureClass === "AUTH" && !a.retryable && a.attempts === 1);
    script = [{ status: 422 }];
    const b = await providerHttp({ url: `${base}/a`, ...fast });
    assert.ok(!b.ok && b.failureClass === "PERMANENT" && !b.retryable);
  });

  it("gives up after retries and maps 429/5xx to TRANSIENT", async () => {
    script = [{ status: 429 }, { status: 500 }, { status: 502 }];
    const r = await providerHttp({ url: `${base}/a`, retries: 2, ...fast });
    assert.ok(!r.ok && r.failureClass === "TRANSIENT" && r.retryable && r.attempts === 3);
  });

  it("times out and reports TIMEOUT", async () => {
    const slow = createServer(() => undefined);
    await new Promise<void>((r) => slow.listen(0, "127.0.0.1", r));
    const url = `http://127.0.0.1:${(slow.address() as AddressInfo).port}`;
    const r = await providerHttp({ url, timeoutMs: 50, retries: 1, ...fast });
    slow.closeAllConnections();
    slow.close();
    assert.ok(!r.ok && r.failureClass === "TIMEOUT" && r.attempts === 2);
  });

  it("redacts secrets from error text", () => {
    assert.equal(redactSecrets("bad key key-SECRET-123 and Bearer abcdefghijkl", ["key-SECRET-123"]), "bad key *** and Bearer ***");
  });
});

describe("SMS http adapter (real mode wiring)", () => {
  const cfg = { ...baseCfg, senderId: "KIORLY", apiUrl: "" };
  it("sends the neutral request shape with bearer auth and idempotency key", async () => {
    const p = new HttpSmsProvider({ ...cfg, apiUrl: `${base}/sms` }, fast);
    const r = await p.send({ to: "+20 100 111 2233", body: "hello", reference: "ob-1" });
    assert.deepEqual(r, { ok: true, providerMessageId: "msg-1" });
    const s = seen[0]!;
    assert.equal(s.url, "/sms");
    assert.equal(s.headers.authorization, "Bearer key-SECRET-123");
    assert.equal(s.headers["idempotency-key"], "ob-1");
    assert.deepEqual(s.body, { to: "+201001112233", from: "KIORLY", text: "hello", reference: "ob-1" });
  });
  it("maps failures without leaking the key", async () => {
    script = [{ status: 401, body: { error: "bad key key-SECRET-123" } }];
    const r = await new HttpSmsProvider({ ...cfg, apiUrl: `${base}/sms` }, fast).send({ to: "+201", body: "x", reference: "ob-2" });
    assert.ok(!r.ok && r.failureClass === "AUTH" && !r.retryable);
    assert.ok(!r.ok && !r.error.includes("key-SECRET-123"));
  });
  it("retries transient errors", async () => {
    script = [{ status: 503 }, { status: 200, body: { data: { id: "late" } } }];
    const r = await new HttpSmsProvider({ ...cfg, apiUrl: `${base}/sms` }, fast).send({ to: "+201", body: "x", reference: "ob-3" });
    assert.deepEqual(r, { ok: true, providerMessageId: "late" });
    assert.equal(seen.length, 2);
  });
});

describe("WhatsApp http adapter", () => {
  it("sends a template with parameters and quick replies", async () => {
    const p = new HttpWhatsAppProvider({ ...baseCfg, apiUrl: `${base}/wa`, senderId: "+201000000000" }, fast);
    const r = await p.sendTemplate({
      toPhone: "+201001112233",
      templateName: "appointment_reminder",
      languageCode: "ar",
      bodyParameters: [{ type: "text", text: "Sara" }],
      quickReplyPayloads: ["CONFIRM"],
      reference: "ob-9",
    });
    assert.equal(r.ok, true);
    assert.equal(seen[0]!.headers["idempotency-key"], "ob-9");
    assert.deepEqual((seen[0]!.body as { template: unknown }).template, {
      name: "appointment_reminder",
      language: "ar",
      body_parameters: ["Sara"],
      quick_reply_payloads: ["CONFIRM"],
    });
  });
  it("classifies template rejections as non-retryable TEMPLATE", async () => {
    script = [{ status: 400, body: { error: "template not approved" } }];
    const p = new HttpWhatsAppProvider({ ...baseCfg, apiUrl: `${base}/wa`, senderId: "s" }, fast);
    const r = await p.sendTemplate({ toPhone: "+2010", templateName: "t", languageCode: "en", bodyParameters: [] });
    assert.ok(!r.ok && r.failureClass === "TEMPLATE" && !r.retryable);
  });
});

describe("Email http transport", () => {
  it("posts subject/text/html with the from address and reference", async () => {
    const t = new HttpEmailTransport({ ...baseCfg, apiUrl: `${base}/mail`, fromAddress: "noreply@example.test" }, fast);
    const r = await t.send({ to: "a@b.test", subject: "S", text: "T", html: "<p>H</p>", reference: "em-1" });
    assert.deepEqual(r, { ok: true, providerMessageId: "msg-1" });
    assert.deepEqual(seen[0]!.body, { from: "noreply@example.test", to: "a@b.test", subject: "S", text: "T", html: "<p>H</p>", tags: {}, reference: "em-1" });
  });
});

describe("PSP http gateway", () => {
  const cfg = { ...baseCfg, apiUrl: "", merchantId: "m-1", callbackUrl: "https://api.example.test/api/v1/webhooks/payments/paymob" };
  it("creates a payment link, charges a token and refunds with idempotency keys", async () => {
    const g = new HttpPspGateway("fawry", { ...cfg, apiUrl: `${base}/v1` }, fast);
    script = [{ status: 200, body: { id: "pay_1", payment_url: "https://pay.example.test/pay_1", reference_code: "123" } }];
    const link = await g.createPaymentLink({ tenantId: "t1", invoiceId: "i1", amount: "100.00", currency: "EGP", idempotencyKey: "k1" });
    assert.equal(link.providerRef, "pay_1");
    assert.equal(link.paymentUrl, "https://pay.example.test/pay_1");
    assert.equal(seen[0]!.url, "/v1/payment-links");
    assert.equal(seen[0]!.headers["idempotency-key"], "k1");
    assert.deepEqual((seen[0]!.body as { metadata: unknown }).metadata, { tenant_id: "t1", invoice_id: "i1" });

    script = [{ status: 200, body: { id: "pay_2", status: "succeeded" } }];
    const ch = await g.chargeToken({ tenantId: "t1", tokenRef: "tok", amount: "5.00", currency: "EGP", invoiceId: "i1", idempotencyKey: "k2" });
    assert.deepEqual(ch, { providerRef: "pay_2", status: "succeeded" });

    script = [{ status: 200, body: { id: "rf_1", status: "pending" } }];
    const rf = await g.refund({ providerRef: "pay_2", amount: "5.00", currency: "EGP", idempotencyKey: "refund_pay_2" });
    assert.deepEqual(rf, { providerRef: "rf_1", status: "pending" });
    assert.equal(seen[2]!.url, "/v1/refunds");
  });
  it("throws a secret-free error on provider failure and verifies HMAC webhooks", async () => {
    const g = new HttpPspGateway("paymob", { ...cfg, apiUrl: `${base}/v1` }, fast);
    script = [{ status: 401, body: { e: "key-SECRET-123" } }];
    await assert.rejects(g.chargeToken({ tenantId: "t", tokenRef: "x", amount: "1", currency: "EGP", invoiceId: "i", idempotencyKey: "k" }), (e: Error) => !e.message.includes("key-SECRET-123") && /401/.test(e.message));
    const raw = JSON.stringify({ event_id: "e1", type: "refund.succeeded", payment_id: "pay_2", amount: "5.00", currency: "EGP", metadata: { tenant_id: "t1" } });
    assert.equal(g.verifyWebhookSignature(raw, signWebhook("whsec-456", raw)), true);
    assert.equal(g.verifyWebhookSignature(raw, `sha256=${signWebhook("whsec-456", raw)}`), true);
    assert.equal(g.verifyWebhookSignature(raw, signWebhook("wrong", raw)), false);
    assert.equal(g.verifyWebhookSignature(raw, undefined), false);
    const ev = g.parseWebhook(JSON.parse(raw));
    assert.equal(ev.kind, "refund");
    assert.equal(ev.status, "succeeded");
    assert.equal(ev.providerRef, "pay_2");
    assert.equal(ev.idempotencyKey, "e1");
    assert.equal(g.parseWebhook({ event_id: "e2", type: "payment.failed", payment_id: "p" }).status, "failed");
  });
});

describe("webhook HMAC + receipts", () => {
  it("rejects missing secret, stale timestamps and tampered bodies; accepts base64", () => {
    const raw = '{"a":1}';
    assert.equal(verifyWebhookSignature({ secret: "", rawBody: raw, signature: signWebhook("", raw) }), false);
    assert.equal(verifyWebhookSignature({ secret: "s", rawBody: raw + " ", signature: signWebhook("s", raw) }), false);
    const ts = String(Math.floor(Date.now() / 1000));
    assert.equal(verifyWebhookSignature({ secret: "s", rawBody: raw, signature: signWebhook("s", raw, ts), timestamp: ts }), true);
    const old = String(Math.floor(Date.now() / 1000) - 3600);
    assert.equal(verifyWebhookSignature({ secret: "s", rawBody: raw, signature: signWebhook("s", raw, old), timestamp: old }), false);
    const b64 = Buffer.from(signWebhook("s", raw), "hex").toString("base64");
    assert.equal(verifyWebhookSignature({ secret: "s", rawBody: raw, signature: b64 }), true);
  });
  it("normalises neutral receipt bodies", () => {
    const r = parseNeutralReceipts({ events: [{ id: "m1", status: "Delivered", timestamp: 1735689600 }, { id: "m2", status: "undelivered", error: "blocked" }, { id: "", status: "sent" }, { id: "m3", status: "???" }] });
    assert.deepEqual(r.map((x) => [x.providerMessageId, x.status]), [["m1", "delivered"], ["m2", "failed"]]);
    assert.equal(r[0]!.at?.toISOString(), "2025-01-01T00:00:00.000Z");
    assert.equal(r[1]!.error, "blocked");
  });
});

describe("startup fail-fast", () => {
  it("is silent in mock mode (default)", () => {
    assert.deepEqual(providerEnvProblems({ NODE_ENV: "production" }), []);
  });
  it("lists every missing variable name when MODE=real, never values", () => {
    const env = { NODE_ENV: "production", KIORLY_PROVIDER_MODE_SMS: "real", SMS_API_KEY: "topsecretvalue", SMS_API_URL: "http://insecure.example.test" } as NodeJS.ProcessEnv;
    const problems = providerEnvProblems(env);
    assert.ok(problems.some((p) => p.includes("SMS_SENDER_ID")));
    assert.ok(problems.some((p) => p.includes("SMS_WEBHOOK_SECRET")));
    assert.ok(problems.some((p) => /https/.test(p)));
    assert.throws(() => assertProviderEnv(env), (e: Error) => /SMS_SENDER_ID/.test(e.message) && !e.message.includes("topsecretvalue"));
  });
  it("supports <KIND>_MODE aliases and per-backend requirements", () => {
    const wa = { KIORLY_PROVIDER_MODE_WHATSAPP: "real" } as NodeJS.ProcessEnv;
    assert.ok(providerEnvProblems(wa).some((p) => p.includes("WHATSAPP_PHONE_NUMBER_ID")));
    const http = { WHATSAPP_MODE: "real", WHATSAPP_PROVIDER: "http" } as NodeJS.ProcessEnv;
    assert.ok(providerEnvProblems(http).some((p) => p.includes("WHATSAPP_API_URL")));
    const email = { EMAIL_MODE: "real", EMAIL_TRANSPORT: "http" } as NodeJS.ProcessEnv;
    assert.ok(providerEnvProblems(email).some((p) => p.includes("EMAIL_API_KEY")));
    const ok = { PSP_MODE: "real", PSP_API_URL: "https://psp.example.test", PSP_API_KEY: "k", PSP_WEBHOOK_SECRET: "s" } as NodeJS.ProcessEnv;
    assert.deepEqual(providerEnvProblems(ok), []);
    const prev = process.env.SMS_MODE;
    process.env.SMS_MODE = "real";
    assert.equal(providerMode("sms"), "real");
    if (prev === undefined) delete process.env.SMS_MODE;
    else process.env.SMS_MODE = prev;
  });
});

describe("receipt webhook controller", () => {
  it("verifies HMAC, rejects bad/missing signatures and unknown kinds, persists via the service", async () => {
    const { ProviderWebhooksController } = await import("./provider-webhooks.controller");
    const applied: unknown[] = [];
    const ctl = new ProviderWebhooksController({ apply: async (k: string, e: unknown) => (applied.push([k, e]), { received: 1, updated: 1, unknown: 0 }) } as never);
    process.env.SMS_WEBHOOK_SECRET = "sms-whsec";
    try {
      const body = { events: [{ id: "m1", status: "delivered" }] };
      const raw = JSON.stringify(body);
      const req = { rawBody: Buffer.from(raw) } as never;
      const ok = await ctl.receive("sms", req, signWebhook("sms-whsec", raw), undefined, undefined, body);
      assert.equal(ok.updated, 1);
      assert.equal(applied.length, 1);
      await assert.rejects(ctl.receive("sms", req, "bad", undefined, undefined, body), /Invalid webhook signature/);
      await assert.rejects(ctl.receive("sms", req, undefined, undefined, undefined, body), /Invalid webhook signature/);
      await assert.rejects(ctl.receive("push", req, signWebhook("sms-whsec", raw), undefined, undefined, body), /Not Found/);
      await assert.rejects(ctl.receive("whatsapp", req, signWebhook("sms-whsec", raw), undefined, undefined, body), /Invalid webhook signature/); // no WHATSAPP_WEBHOOK_SECRET => fail closed
    } finally {
      delete process.env.SMS_WEBHOOK_SECRET;
    }
  });
});
