import { providerHttp } from "../common/provider-http";
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