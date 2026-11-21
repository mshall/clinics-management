import { whatsAppHttpConfig, type WhatsAppHttpConfig } from "../../common/provider-env";
import { providerHttp, type ProviderHttpRequest } from "../../common/provider-http";
import type { WhatsAppBusinessProvider, WhatsAppSendResult, WhatsAppTemplateSendInput } from "../whatsapp-provider.types";
import { toWhatsAppRequestBody, whatsAppAuthHeaders, whatsAppFailureFromBody, whatsAppMessageIdFromResponse } from "./whatsapp-http.mapping";

/** Generic JSON-over-HTTP WhatsApp BSP (WHATSAPP_PROVIDER=http). Meta Cloud stays in whatsapp-meta-cloud.provider.ts. */
export class HttpWhatsAppProvider implements WhatsAppBusinessProvider {
  readonly id = "http";
  constructor(
    private readonly cfg: WhatsAppHttpConfig,
    private readonly http: Pick<ProviderHttpRequest, "fetchImpl" | "sleep"> = {},
  ) {}

  async sendTemplate(input: WhatsAppTemplateSendInput & { reference?: string }): Promise<WhatsAppSendResult> {
    const reference = input.reference ?? `wa-${input.toPhone}-${input.templateName}-${Date.now()}`;
    const res = await providerHttp({
      url: this.cfg.apiUrl,
      headers: whatsAppAuthHeaders(this.cfg.apiKey),
      body: toWhatsAppRequestBody(input, this.cfg, reference),
      timeoutMs: this.cfg.timeoutMs,
      retries: this.cfg.maxRetries,
      backoffMs: this.cfg.backoffMs,
      idempotencyKey: reference,
      secrets: [this.cfg.apiKey, this.cfg.webhookSecret],
      ...this.http,
    });
    if (!res.ok) {
      const mapped = res.retryable ? null : whatsAppFailureFromBody(res.text);
      const failureClass = res.failureClass === "AUTH" ? "AUTH" : mapped ?? (res.retryable ? "TRANSIENT" : "UNKNOWN");
      return { ok: false, error: `WhatsApp provider: ${res.error}`, failureClass, retryable: res.retryable };
    }
    const id = whatsAppMessageIdFromResponse(res.json);
    if (!id) return { ok: false, error: "WhatsApp provider response missing message id", failureClass: "UNKNOWN", retryable: false };
    return { ok: true, providerMessageId: id };
  }
}

export function httpWhatsAppProviderFromEnv(): HttpWhatsAppProvider {
  return new HttpWhatsAppProvider(whatsAppHttpConfig());
}
