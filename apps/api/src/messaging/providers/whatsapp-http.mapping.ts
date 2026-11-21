import { pickString } from "../../common/provider-http";
import type { WhatsAppHttpConfig } from "../../common/provider-env";
import type { WhatsAppTemplateSendInput } from "../whatsapp-provider.types";
import { parseNeutralReceipts, type DeliveryReceipt } from "./delivery-receipt";

/** THE ONLY FILE TO ADAPT for a non-Meta WhatsApp BSP (360dialog, Twilio, Infobip, Gupshup, ...). */
export function toWhatsAppRequestBody(input: WhatsAppTemplateSendInput, cfg: Pick<WhatsAppHttpConfig, "senderId">, reference: string): Record<string, unknown> {
  return {
    from: cfg.senderId,
    to: input.toPhone.replace(/[^\d+]/g, ""),
    reference,
    template: {
      name: input.templateName,
      language: input.languageCode,
      body_parameters: input.bodyParameters.map((p) => p.text),
      quick_reply_payloads: input.quickReplyPayloads ?? [],
      ...(input.documentLink ? { document: { link: input.documentLink, filename: input.documentFilename ?? "document.pdf" } } : {}),
    },
  };
}

export const whatsAppAuthHeaders = (token: string): Record<string, string> => ({ Authorization: `Bearer ${token}` });

export const whatsAppMessageIdFromResponse = (json: unknown): string | null => pickString(json, "id", "messageId", "message_id", "messages.0.id", "data.id");

export const whatsAppReceiptsFromWebhook = (payload: unknown): DeliveryReceipt[] => parseNeutralReceipts(payload);

/** Maps vendor error text to a failure class (template rejected vs window/policy). */
export function whatsAppFailureFromBody(text: string): "TEMPLATE" | "POLICY" | null {
  if (/template/i.test(text)) return "TEMPLATE";
  if (/policy|window|opt.?out|consent/i.test(text)) return "POLICY";
  return null;
}
