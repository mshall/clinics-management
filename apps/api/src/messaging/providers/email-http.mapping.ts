import { pickString } from "../../common/provider-http";
import type { EmailHttpConfig } from "../../common/provider-env";
import { parseNeutralReceipts, type DeliveryReceipt } from "./delivery-receipt";

export type EmailHttpMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
  tags?: Record<string, string>;
  reference: string;
};

/** THE ONLY FILE TO ADAPT for a specific transactional-email vendor (Postmark, Mailgun, Resend, ...). */
export function toEmailRequestBody(m: EmailHttpMessage, cfg: Pick<EmailHttpConfig, "fromAddress">): Record<string, unknown> {
  return { from: cfg.fromAddress, to: m.to, subject: m.subject, text: m.text, html: m.html, tags: m.tags ?? {}, reference: m.reference };
}

export const emailAuthHeaders = (apiKey: string): Record<string, string> => ({ Authorization: `Bearer ${apiKey}` });

export const emailMessageIdFromResponse = (json: unknown): string | null => pickString(json, "id", "messageId", "message_id", "MessageID", "data.id");

export const emailReceiptsFromWebhook = (payload: unknown): DeliveryReceipt[] => parseNeutralReceipts(payload);
