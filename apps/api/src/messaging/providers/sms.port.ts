export type SmsFailureClass = "AUTH" | "TRANSIENT" | "POLICY" | "UNKNOWN";

export type SmsSendInput = {
  /** E.164 recipient. */
  to: string;
  body: string;
  /** Stable id (OutboundMessage.id) sent as the idempotency key so retries never double-send. */
  reference: string;
  tenantId?: string | null;
  templateKey?: string | null;
  variables?: Record<string, unknown> | null;
};

export type SmsSendResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; error: string; failureClass: SmsFailureClass; retryable: boolean };

export interface SmsProvider {
  readonly id: string;
  send(input: SmsSendInput): Promise<SmsSendResult>;
}
