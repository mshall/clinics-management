import { pickString } from "../../common/provider-http";
import type { SmsConfig } from "../../common/provider-env";
import { parseNeutralReceipts, type DeliveryReceipt } from "./delivery-receipt";
import type { SmsSendInput } from "./sms.port";

/**
 * THE ONLY FILE TO ADAPT for a specific SMS aggregator. Defaults are the neutral shape documented in
 * Docs/PROVIDER_INTEGRATION.md; change these three functions to match the vendor's JSON.
 */
export function toSmsRequestBody(input: SmsSendInput, cfg: Pick<SmsConfig, "senderId">): Record<string, unknown> {
  return { to: input.to.replace(/\s/g, ""), from: cfg.senderId, text: input.body, reference: input.reference };
}

export function authHeaders(apiKey: string): Record<string, string> {
  return { Authorization: `Bearer ${apiKey}` };
}

export function smsMessageIdFromResponse(json: unknown): string | null {
  return pickString(json, "id", "messageId", "message_id", "data.id", "messages.0.id");
}

export function smsReceiptsFromWebhook(payload: unknown): DeliveryReceipt[] {
  return parseNeutralReceipts(payload);
}
