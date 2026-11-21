import { isMock } from "../../common/provider-mode";
import { smsConfig, type SmsConfig } from "../../common/provider-env";
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
    const res = await providerHttp({
      url: this.cfg.apiUrl,
      headers: authHeaders(this.cfg.apiKey),
      body: toSmsRequestBody(input, this.cfg),
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
    const id = smsMessageIdFromResponse(res.json);
    if (!id) return { ok: false, error: "SMS provider response missing message id", failureClass: "UNKNOWN", retryable: false };
    return { ok: true, providerMessageId: id };
  }
}

export function createSmsProvider(): SmsProvider {
  return isMock("sms") ? new MockSmsProvider() : new HttpSmsProvider(smsConfig());
}
