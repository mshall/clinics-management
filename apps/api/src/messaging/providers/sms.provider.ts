import { isMock } from "../../common/provider-mode";
import { smsConfig, smsVendor, type SmsConfig } from "../../common/provider-env";
import { parseTwilioSend, twilioAuth, twilioForm, twilioPath } from "../../common/vendors/twilio-sms";
import { providerHttp, type ProviderHttpRequest } from "../../common/provider-http";
import { DevInboxRecorder } from "../dev-inbox.recorder";
import { authHeaders, smsMessageIdFromResponse, toSmsRequestBody } from "./sms.mapping";
import type { SmsFailureClass, SmsProvider, SmsSendInput, SmsSendResult } from "./sms.port";

/** Mock mode (default): renders into the dev inbox, never opens a socket. */
export class MockSmsProvider implements SmsProvider {
  readonly id = "mock";
  async send(input: SmsSendInput): Promise<SmsSendResult> {
    const providerMessageId = `dev-sms-${input.reference}`;
    await DevInboxRecorder.record({
      channel: "SMS",
      tenantId: input.tenantId ?? null,
      toAddress: input.to,
      templateKey: input.templateKey ?? null,
      bodyText: input.body,
      variables: input.variables ?? null,
      providerMessageId,
      relatedId: input.reference,
    });
    return { ok: true, providerMessageId };
  }
}

/** Real mode: generic JSON-over-HTTP aggregator driven purely by SMS_* env. */
export class HttpSmsProvider implements SmsProvider {
  readonly id = "http";
  constructor(
    private readonly cfg: SmsConfig,
    private readonly http: Pick<ProviderHttpRequest, "fetchImpl" | "sleep"> = {},
  ) {}

  async send(input: SmsSendInput): Promise<SmsSendResult> {
    const twilio = smsVendor() === "twilio";
    const res = await providerHttp({
      url: twilio ? `${this.cfg.apiUrl.replace(/\/$/, "")}${twilioPath(this.cfg.apiKey)}` : this.cfg.apiUrl,
      headers: twilio ? twilioAuth(this.cfg.apiKey) : authHeaders(this.cfg.apiKey),
      ...(twilio ? { form: twilioForm({ to: input.to.replace(/\s/g, ""), from: this.cfg.senderId, body: input.body, statusCallback: process.env.SMS_WEBHOOK_PUBLIC_URL?.trim() || undefined }) } : { body: toSmsRequestBody(input, this.cfg) }),
      timeoutMs: this.cfg.timeoutMs,
      retries: this.cfg.maxRetries,
      backoffMs: this.cfg.backoffMs,
      idempotencyKey: input.reference,
      secrets: [this.cfg.apiKey, this.cfg.webhookSecret],
      ...this.http,
    });
    if (!res.ok) {
      const failureClass: SmsFailureClass = res.failureClass === "AUTH" ? "AUTH" : res.retryable ? "TRANSIENT" : res.status === 400 || res.status === 422 ? "POLICY" : "UNKNOWN";
      return { ok: false, error: `SMS provider: ${res.error}`, failureClass, retryable: res.retryable };
    }
    const id = twilio ? ((): string | null => { try { return parseTwilioSend(res.json).providerRef; } catch { return null; } })() : smsMessageIdFromResponse(res.json);
    if (!id) return { ok: false, error: "SMS provider response missing message id", failureClass: "UNKNOWN", retryable: false };
    return { ok: true, providerMessageId: id };
  }
}

export function createSmsProvider(): SmsProvider {
  return isMock("sms") ? new MockSmsProvider() : new HttpSmsProvider(smsConfig());
}
