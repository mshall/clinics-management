export type WhatsAppBodyParameter = { type: "text"; text: string };

export type WhatsAppTemplateSendInput = {
  toPhone: string;
  templateName: string;
  languageCode: string;
  bodyParameters: WhatsAppBodyParameter[];
  quickReplyPayloads?: string[];
  documentLink?: string;
  documentFilename?: string;
};

export type WhatsAppSendSuccess = {
  ok: true;
  providerMessageId: string;
};

export type WhatsAppSendFailure = {
  ok: false;
  error: string;
  failureClass: WhatsAppFailureClass;
  retryable: boolean;
};

export type WhatsAppSendResult = WhatsAppSendSuccess | WhatsAppSendFailure;

export type WhatsAppFailureClass = "TRANSIENT" | "TEMPLATE" | "POLICY" | "AUTH" | "UNKNOWN";

export interface WhatsAppBusinessProvider {
  readonly id: string;
  sendTemplate(input: WhatsAppTemplateSendInput): Promise<WhatsAppSendResult>;
}