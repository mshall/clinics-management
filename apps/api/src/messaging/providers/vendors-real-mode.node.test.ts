import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { providerEnvProblems, providerStatus, smsConfig } from "../../common/provider-env";
import { HttpSmsProvider } from "./sms.provider";
import { MobilePushService } from "../../mobile/mobile-push.service";
import { PushSender } from "../../common/vendors/push";
import { signTwilio, verifyTwilioSignature } from "../../common/vendors/twilio-sms";

const TWILIO = { KIORLY_PROVIDER_MODE_SMS: "real", SMS_PROVIDER: "twilio", SMS_API_KEY: "ACabc:authtoken0123456789", SMS_SENDER_ID: "KIORLY", SMS_WEBHOOK_PUBLIC_URL: "https://api.kiorly.com/api/v1/webhooks/providers/sms" } as NodeJS.ProcessEnv;
const withEnv = async (e: Record<string, string>, fn: () => Promise<void> | void) => { const prev = { ...process.env }; Object.assign(process.env, e); try { await fn(); } finally { for (const k of Object.keys(e)) { if (prev[k] === undefined) delete process.env[k]; else process.env[k] = prev[k]; } } };
const fakeFetch = (...replies: Array<{ status?: number; json?: unknown }>) => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const f = (async (url: string, init: RequestInit) => { calls.push({ url, init }); const r = replies.shift() ?? { json: {} }; return new Response(JSON.stringify(r.json ?? {}), { status: r.status ?? 200 }); }) as unknown as typeof fetch;
  return { f, calls };
};

describe("SMS via Twilio (SMS_PROVIDER=twilio), faked HTTP", () => {
  it("startup validation: only the key, sender and public webhook URL are needed", () => {
    assert.deepEqual(providerEnvProblems({ ...TWILIO, KIORLY_PROVIDER_MODE_SMS: "real" } as NodeJS.ProcessEnv).filter((p) => p.startsWith("SMS")), []);
    assert.ok(providerEnvProblems({ ...TWILIO, SMS_WEBHOOK_PUBLIC_URL: "" } as NodeJS.ProcessEnv).some((p) => p.includes("SMS_WEBHOOK_PUBLIC_URL")));
    assert.equal(smsConfig(TWILIO).webhookSecret, "authtoken0123456789");
  });
  it("posts a form body with basic auth and returns the message sid", async () => {
    const t = fakeFetch({ status: 201, json: { sid: "SM123" } });
    await withEnv({ SMS_PROVIDER: "twilio", SMS_WEBHOOK_PUBLIC_URL: TWILIO.SMS_WEBHOOK_PUBLIC_URL! }, async () => {
      const r = await new HttpSmsProvider(smsConfig(TWILIO), { fetchImpl: t.f, sleep: async () => undefined }).send({ to: "+201000000001", body: "hi", reference: "ref-1" });
      assert.deepEqual(r, { ok: true, providerMessageId: "SM123" });
    });
    assert.equal(t.calls[0].url, "https://api.twilio.com/2010-04-01/Accounts/ACabc/Messages.json");
    assert.equal((t.calls[0].init.headers as Record<string, string>)["Content-Type"], "application/x-www-form-urlencoded");
    assert.deepEqual(Object.fromEntries(new URLSearchParams(String(t.calls[0].init.body))), { To: "+201000000001", Body: "hi", From: "KIORLY", StatusCallback: TWILIO.SMS_WEBHOOK_PUBLIC_URL });
  });
  it("verifies the callback signature", () => {
    const raw = "MessageSid=SM1&MessageStatus=delivered";
    assert.ok(verifyTwilioSignature("tok", "https://x/cb", raw, { "x-twilio-signature": signTwilio("tok", "https://x/cb", raw) }));
    assert.ok(!verifyTwilioSignature("tok", "https://x/cb", raw + "x", { "x-twilio-signature": signTwilio("tok", "https://x/cb", raw) }));
  });
});

describe("mobile push real mode (FCM v1 / Expo)", () => {
  it("fails fast on missing credentials and reports readiness", () => {
    assert.ok(providerEnvProblems({ MOBILE_PUSH_MODE: "real" } as NodeJS.ProcessEnv).some((p) => p.includes("PUSH") && p.includes("PUSH_FCM_SERVICE_ACCOUNT_JSON")));
    assert.deepEqual(providerEnvProblems({ MOBILE_PUSH_MODE: "real", PUSH_EXPO_ENABLED: "true" } as NodeJS.ProcessEnv), []);
    const s = providerStatus({ KIORLY_PROVIDER_MODE_PUSH: "real", PUSH_EXPO_ENABLED: "true" } as NodeJS.ProcessEnv).find((x) => x.provider === "push");
    assert.deepEqual(s, { provider: "push", mode: "real", vendor: "fcm+expo", ready: true });
    assert.ok(providerStatus({} as NodeJS.ProcessEnv).every((x) => x.mode === "mock" && x.ready));
  });
  it("Android channel per kind", () => {
    assert.deepEqual(["SAFETY", "CLINICAL", "OPS", "GENERAL"].map((k) => MobilePushService.channelFor(k as never)), ["safety", "clinical", "ops", "default"]);
  });
  it("PushSender hands Expo tokens to exp.host and reports dead tokens", async () => {
    const t = fakeFetch({ json: { data: [{ status: "error", details: { error: "DeviceNotRegistered" } }] } });
    assert.deepEqual(await new PushSender({}, t.f).send({ token: "ExponentPushToken[x]", title: "T", body: "B", channelId: "safety" }), { ok: false, error: "EXPO_DeviceNotRegistered", invalidToken: true });
    assert.equal(JSON.parse(String(t.calls[0].init.body))[0].channelId, "safety");
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
    const f = fakeFetch({ json: { access_token: "ya29", expires_in: 3600 } }, { json: { name: "projects/p/messages/1" } });
    const r = await new PushSender({ fcmServiceAccountJson: JSON.stringify({ project_id: "p", client_email: "a@b.iam.gserviceaccount.com", private_key: privateKey }) }, f.f).send({ token: "fcm-native", title: "T", body: "B" });
    assert.equal(r.ok, true);
    assert.equal(f.calls[1].url, "https://fcm.googleapis.com/v1/projects/p/messages:send");
  });
});
