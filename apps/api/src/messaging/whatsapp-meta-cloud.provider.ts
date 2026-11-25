import { providerHttp } from "../common/provider-http";
import { authenticationTemplateBody, classifyMetaCode, failureClassForAction, interactiveButtonsBody, MetaPayloadError, metaCodeFromBody, sessionTextBody } from "./meta-cloud-events";
import type {
  WhatsAppBusinessProvider,
  WhatsAppFailureClass,
  WhatsAppSendResult,
  WhatsAppTemplateSendInput,
} from "./whatsapp-provider.types";

function normalizePhoneE164(phone: string): string {
  return phone.replace(/[^\d+]/g, "").replace(/^\+/, "");
}

function classifyError(status: number, body: string): { failureClass: WhatsAppFailureClass; retryable: boolean } {
  const code = metaCodeFromBody(body); // the numeric Meta error code decides first (131047 outside the window, 132001 template missing, 130429 throttled, 190 token)
  if (code !== undefined && classifyMetaCode(code) !== "UNKNOWN") return failureClassForAction(classifyMetaCode(code));
  if (status === 401 || status === 403) return { failureClass: "AUTH", retryable: false };
  if (status === 429 || status >= 500) return { failureClass: "TRANSIENT", retryable: true };
  if (/template|1320|1320\d/i.test(body)) return { failureClass: "TEMPLATE", retryable: false };
  if (/policy|1310|outside.*window|24.*hour/i.test(body)) return { failureClass: "POLICY", retryable: false };
  return { failureClass: "UNKNOWN", retryable: status >= 500 };
}

export type MetaCloudWhatsAppConfig = {
  phoneNumberId: string;
  accessToken: string;
  apiVersion?: string;
};

export class MetaCloudWhatsAppProvider implements WhatsAppBusinessProvider {
  readonly id = "meta_cloud";

  constructor(private readonly config: MetaCloudWhatsAppConfig) {}

  async sendTemplate(input: WhatsAppTemplateSendInput): Promise<WhatsAppSendResult> {
    const version = this.config.apiVersion?.trim() || "v21.0";
    const base = process.env.WHATSAPP_CLOUD_API_BASE?.trim() || "https://graph.facebook.com";
    const url = `${base.replace(/\/$/, "")}/${version}/${this.config.phoneNumberId}/messages`;
    const components: Record<string, unknown>[] = [];
    if (input.documentLink) {
      components.push({
        type: "header",
        parameters: [
          {
            type: "document",
            document: { link: input.documentLink, filename: input.documentFilename ?? "document.pdf" },
          },
        ],
      });
    }
    components.push({
      type: "body",
      parameters: input.bodyParameters.map((p) => ({ type: "text", text: p.text })),
    });
    if (input.quickReplyPayloads?.length) {
      input.quickReplyPayloads.forEach((payload, index) => {
        components.push({
          type: "button",
          sub_type: "quick_reply",
          index: String(index),
          parameters: [{ type: "payload", payload }],
        });
      });
    }
    const payload = {
      messaging_product: "whatsapp",
      to: normalizePhoneE164(input.toPhone),
      type: "template",
      template: {
        name: input.templateName,
        language: { code: input.languageCode },
        components,
      },
    };
    const res = await providerHttp({
      url,
      headers: { Authorization: `Bearer ${this.config.accessToken}` },
      body: payload,
      timeoutMs: Number(process.env.WHATSAPP_TIMEOUT_MS) || 10_000,
      retries: process.env.WHATSAPP_MAX_RETRIES ? Number(process.env.WHATSAPP_MAX_RETRIES) : 2,
      secrets: [this.config.accessToken],
    });
    if (!res.ok) {
      const cls = res.retryable || res.status === undefined ? { failureClass: "TRANSIENT" as const, retryable: res.retryable } : classifyError(res.status, res.text);
      return { ok: false, error: `Meta WhatsApp ${res.status ?? "network"}: ${res.error}`.slice(0, 450), ...cls };
    }
    const id = (res.json as { messages?: { id?: string }[] } | null)?.messages?.[0]?.id;
    if (!id) {
      return { ok: false, error: "Meta WhatsApp response missing message id", failureClass: "UNKNOWN", retryable: false };
    }
    return { ok: true, providerMessageId: id };
  }

  private url(): string {
    const version = this.config.apiVersion?.trim() || "v21.0";
    const base = process.env.WHATSAPP_CLOUD_API_BASE?.trim() || "https://graph.facebook.com";
    return `${base.replace(/\/$/, "")}/${version}/${this.config.phoneNumberId}/messages`;
  }
  private async post(payload: unknown): Promise<WhatsAppSendResult> {
    const res = await providerHttp({ url: this.url(), headers: { Authorization: `Bearer ${this.config.accessToken}` }, body: payload, timeoutMs: Number(process.env.WHATSAPP_TIMEOUT_MS) || 10_000, retries: process.env.WHATSAPP_MAX_RETRIES ? Number(process.env.WHATSAPP_MAX_RETRIES) : 2, secrets: [this.config.accessToken] });
    if (!res.ok) { const cls = res.status === undefined ? { failureClass: "TRANSIENT" as const, retryable: res.retryable } : classifyError(res.status, res.text); return { ok: false, error: `Meta WhatsApp ${res.status ?? "network"}${metaCodeFromBody(res.text) !== undefined ? ` code ${metaCodeFromBody(res.text)}` : ""}`.slice(0, 450), ...cls }; }
    const id = (res.json as { messages?: { id?: string }[] } | null)?.messages?.[0]?.id;
    return id ? { ok: true, providerMessageId: id } : { ok: false, error: "Meta WhatsApp response missing message id", failureClass: "UNKNOWN", retryable: false };
  }
  /** OTP over an approved AUTHENTICATION template (the only way a sign-in code can go out in production: free text is refused outside the 24 h window). */
  sendAuthenticationOtp(i: { toPhone: string; code: string; templateName: string; languageCode: string }): Promise<WhatsAppSendResult> { return this.post(authenticationTemplateBody({ to: i.toPhone, code: i.code, templateName: i.templateName, languageCode: i.languageCode })); }
  /** Session text, valid only inside the 24 h window (the caller decides with the stored inbound time). */
  sendSessionText(i: { toPhone: string; body: string }): Promise<WhatsAppSendResult> { return this.post(sessionTextBody({ to: i.toPhone, body: i.body })); }
  /** Interactive reply buttons, session only. A payload that Meta would cut is refused before any call. */
  async sendInteractiveButtons(i: { toPhone: string; body: string; buttons: Array<{ id: string; title: string }> }): Promise<WhatsAppSendResult> {
    try { return await this.post(interactiveButtonsBody({ to: i.toPhone, body: i.body, buttons: i.buttons })); } catch (e) { if (e instanceof MetaPayloadError) return { ok: false, error: e.code, failureClass: "TEMPLATE", retryable: false }; throw e; }
  }

}

export function metaCloudProviderFromEnv(phoneNumberIdOverride?: string): MetaCloudWhatsAppProvider | null {
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim() || process.env.WHATSAPP_API_TOKEN?.trim();
  const phoneNumberId = phoneNumberIdOverride || process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!token || !phoneNumberId) return null;
  return new MetaCloudWhatsAppProvider({
    phoneNumberId,
    accessToken: token,
    apiVersion: process.env.WHATSAPP_API_VERSION?.trim(),
  });
}
