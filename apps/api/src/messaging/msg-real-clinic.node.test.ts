import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { EmailBounceController, basicPassword, parseSnsBody, snsConfirmUrl } from "./email-bounce.controller";
import {
  authenticationTemplateBody, classifyMetaCode, failureClassForAction, interactiveButtonsBody, metaCodeFromBody, MetaPayloadError, parseMetaAccountEvents, sanitizeTemplateParam, windowOpen,
} from "./meta-cloud-events";
import { MetaCloudWhatsAppProvider } from "./whatsapp-meta-cloud.provider";

const H = 3_600_000;
const wrap = (field: string, value: unknown) => ({ object: "whatsapp_business_account", entry: [{ changes: [{ field, value }] }] });

describe("MSG-REAL Clinic: Meta error codes, account events, window", () => {
  it("classifies by numeric code and maps to the Clinic failure classes", () => {
    assert.equal(classifyMetaCode(131047), "NEED_TEMPLATE"); assert.equal(classifyMetaCode("130429"), "THROTTLE"); assert.equal(classifyMetaCode(132001), "TEMPLATE"); assert.equal(classifyMetaCode(190), "AUTH"); assert.equal(classifyMetaCode(1), "RETRY"); assert.equal(classifyMetaCode(undefined), "UNKNOWN");
    assert.deepEqual(failureClassForAction("THROTTLE"), { failureClass: "TRANSIENT", retryable: true });
    assert.deepEqual(failureClassForAction("NEED_TEMPLATE"), { failureClass: "POLICY", retryable: false });
    assert.deepEqual(failureClassForAction("AUTH"), { failureClass: "AUTH", retryable: false });
    assert.equal(metaCodeFromBody(JSON.stringify({ error: { code: 131047, message: "secret +2010" } })), 131047); assert.equal(metaCodeFromBody("not json"), undefined);
  });
  it("template review, quality, tier and account events are parsed; messages are not account events", () => {
    assert.deepEqual(parseMetaAccountEvents(wrap("message_template_status_update", { event: "REJECTED", message_template_id: 7, message_template_name: "kiorly_reminder", message_template_language: "ar", reason: "INVALID_FORMAT" })), [{ type: "TEMPLATE_STATUS", templateId: "7", name: "kiorly_reminder", language: "ar", event: "REJECTED", reason: "INVALID_FORMAT" }]);
    assert.deepEqual(parseMetaAccountEvents(wrap("phone_number_quality_update", { event: "DOWNGRADE", current_limit: "TIER_1K" })), [{ type: "PHONE_QUALITY", event: "DOWNGRADE", tier: "TIER_1K" }]);
    assert.deepEqual(parseMetaAccountEvents(wrap("messages", { messages: [] })), []); assert.deepEqual(parseMetaAccountEvents(null), []);
  });
  it("24 h window: open for 24 hours, closed after, a future stamp is not trusted", () => {
    const t = Date.UTC(2026, 10, 25, 9);
    assert.equal(windowOpen(t, t + 23 * H), true); assert.equal(windowOpen(t, t + 24 * H), false); assert.equal(windowOpen(null, t), false); assert.equal(windowOpen(t + 5 * H, t), false);
  });
});

describe("MSG-REAL Clinic: Meta provider sends (stubbed fetch, no network)", () => {
  const real = globalThis.fetch;
  afterEach(() => { globalThis.fetch = real; });
  const provider = new MetaCloudWhatsAppProvider({ phoneNumberId: "1055", accessToken: "EAAGsecret" });
  const stub = (status: number, json: unknown, calls: Array<{ url: string; body: any }> = []) => { globalThis.fetch = (async (u: string, init: RequestInit) => { calls.push({ url: String(u), body: JSON.parse(String(init.body)) }); return new Response(JSON.stringify(json), { status }); }) as never; return calls; };
  it("OTP goes as an AUTHENTICATION template with the code as body and button parameter", async () => {
    const calls = stub(200, { messages: [{ id: "wamid.1" }] });
    assert.deepEqual(await provider.sendAuthenticationOtp({ toPhone: "+201001234567", code: "123456", templateName: "kiorly_auth_otp", languageCode: "en" }), { ok: true, providerMessageId: "wamid.1" });
    assert.deepEqual(calls[0].body, authenticationTemplateBody({ to: "+201001234567", templateName: "kiorly_auth_otp", languageCode: "en", code: "123456" }));
    assert.deepEqual(calls[0].body.template.components, [{ type: "body", parameters: [{ type: "text", text: "123456" }] }, { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "123456" }] }]);
  });
  it("outside the window (131047) is a POLICY failure, never retried; throttled (130429) is retryable", async () => {
    process.env.WHATSAPP_MAX_RETRIES = "0";
    stub(400, { error: { code: 131047, message: "Re-engagement" } });
    const r = await provider.sendSessionText({ toPhone: "+201001234567", body: "hi" });
    assert.equal(r.ok, false); assert.equal((r as { failureClass: string }).failureClass, "POLICY"); assert.equal((r as { retryable: boolean }).retryable, false); assert.ok(!(r as { error: string }).error.includes("Re-engagement"));
    stub(400, { error: { code: 130429 } });
    assert.equal(((await provider.sendSessionText({ toPhone: "+201001234567", body: "hi" })) as { retryable: boolean }).retryable, true);
    delete process.env.WHATSAPP_MAX_RETRIES;
  });
  it("interactive buttons keep the payload id exactly; a payload Meta would cut is refused before any call", async () => {
    const calls = stub(200, { messages: [{ id: "wamid.2" }] });
    await provider.sendInteractiveButtons({ toPhone: "+201001234567", body: "Confirm?", buttons: [{ id: "KIORLY_CONFIRM:apt1:n0nce", title: "Confirm" }] });
    assert.equal(calls[0].body.interactive.action.buttons[0].reply.id, "KIORLY_CONFIRM:apt1:n0nce");
    const refused = await provider.sendInteractiveButtons({ toPhone: "+201001234567", body: "x", buttons: [{ id: "a".repeat(300), title: "t" }] });
    assert.equal(refused.ok, false); assert.equal(calls.length, 1);
    assert.throws(() => interactiveButtonsBody({ to: "+2010", body: "b", buttons: [] }), MetaPayloadError);
    assert.equal(sanitizeTemplateParam("a\nb"), "a | b");
  });
});

describe("MSG-REAL Clinic: SES / SNS bounce endpoint", () => {
  const sns = (eventType: string, extra: Record<string, unknown>) => ({ Type: "Notification", Message: JSON.stringify({ eventType, mail: { messageId: "ses-1" }, ...extra }) });
  const make = () => { const calls: unknown[] = []; const c = new EmailBounceController({ recordBounce: async (i: unknown) => { calls.push(i); return { updated: 1 }; } } as never); return { c, calls }; };
  const req = {} as never;
  it("accepts the SNS basic-auth password (SNS cannot send a custom header) and a text/plain string body; refuses a wrong one", async () => {
    process.env.EMAIL_SES_WEBHOOK_SECRET = "sns_secret_0123456789";
    try {
      const { c, calls } = make(); const auth = `Basic ${Buffer.from("sns:sns_secret_0123456789").toString("base64")}`;
      const body = JSON.stringify(sns("Bounce", { bounce: { bounceType: "Permanent", bouncedRecipients: [{ emailAddress: "gone@example.com" }] } }));
      assert.deepEqual(await c.ses(body, req, undefined, auth), { ok: true, updated: 1 }); assert.equal(calls.length, 1);
      await assert.rejects(() => c.ses(body, req, undefined, `Basic ${Buffer.from("sns:wrong").toString("base64")}`)); await assert.rejects(() => c.ses(body, req, undefined, undefined));
      assert.equal((await c.ses(body, req, "sns_secret_0123456789", undefined)).ok, true);
    } finally { delete process.env.EMAIL_SES_WEBHOOK_SECRET; }
  });
  it("only a permanent bounce or a complaint marks the e-mail; Send, Delivery, Reject and a transient bounce do not", async () => {
    const { c, calls } = make();
    for (const e of [sns("Delivery", { delivery: {} }), sns("Send", {}), sns("Reject", { reject: { reason: "x" } }), sns("Bounce", { bounce: { bounceType: "Transient", bouncedRecipients: [{ emailAddress: "full@example.com" }] } })]) assert.equal(((await c.ses(e, req)) as { ignored?: string }).ignored !== undefined, true);
    assert.equal(calls.length, 0);
    await c.ses(sns("Complaint", { complaint: { complainedRecipients: [{ emailAddress: "angry@example.com" }] } }), req); assert.equal(calls.length, 1);
  });
  it("subscription confirmation is followed only on an https sns host; helpers", () => {
    assert.ok(snsConfirmUrl({ SubscribeURL: "https://sns.eu-central-1.amazonaws.com/?Action=ConfirmSubscription" })); assert.equal(snsConfirmUrl({ SubscribeURL: "https://evil.example.com/x" }), null); assert.equal(snsConfirmUrl({ SubscribeURL: "http://sns.eu-central-1.amazonaws.com/x" }), null);
    assert.equal(basicPassword(`Basic ${Buffer.from("u:p:w").toString("base64")}`), "p:w"); assert.equal(basicPassword("Bearer x"), undefined);
    assert.deepEqual(parseSnsBody("not json"), {}); assert.deepEqual(parseSnsBody({}, Buffer.from('{"Type":"Notification"}')), { Type: "Notification" });
  });
});
