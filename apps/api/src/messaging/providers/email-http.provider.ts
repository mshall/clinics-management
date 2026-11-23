import { emailHttpConfig, type EmailHttpConfig } from "../../common/provider-env";
import { providerHttp, type ProviderHttpRequest } from "../../common/provider-http";
import { emailAuthHeaders, emailMessageIdFromResponse, toEmailRequestBody } from "./email-http.mapping";

export type HttpEmailSendResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; error: string; failureClass: "AUTH" | "TRANSIENT" | "UNKNOWN"; retryable: boolean };

/** Generic JSON-over-HTTP transactional email (EMAIL_TRANSPORT=http). */
export class HttpEmailTransport {
  constructor(
    private readonly cfg: EmailHttpConfig = emailHttpConfig(),
    private readonly http: Pick<ProviderHttpRequest, "fetchImpl" | "sleep"> = {},
  ) {}

  async send(m: { to: string; subject: string; text: string; html: string; tags?: Record<string, string>; reference: string }): Promise<HttpEmailSendResult> {
    const res = await providerHttp({
      url: this.cfg.apiUrl,
      headers: emailAuthHeaders(this.cfg.apiKey),
      body: toEmailRequestBody(m, this.cfg),
      timeoutMs: this.cfg.timeoutMs,
      retries: this.cfg.maxRetries,
      backoffMs: this.cfg.backoffMs,
      idempotencyKey: m.reference,
      secrets: [this.cfg.apiKey, this.cfg.webhookSecret],
      ...this.http,
    });
    if (!res.ok) {
      return {
        ok: false,
        error: `Email provider: ${res.error}`,
        failureClass: res.failureClass === "AUTH" ? "AUTH" : res.retryable ? "TRANSIENT" : "UNKNOWN",
        retryable: res.retryable,
      };
    }
    const id = emailMessageIdFromResponse(res.json);
    if (!id) return { ok: false, error: "Email provider response missing message id", failureClass: "UNKNOWN", retryable: false };
    return { ok: true, providerMessageId: id };
  }
}
