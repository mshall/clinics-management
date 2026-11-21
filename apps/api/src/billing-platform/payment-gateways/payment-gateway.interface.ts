export type KiorlyPaymentProviderKey = "paymob" | "fawry" | "instapay" | "bank";

export type CardSessionRequest = {
  tenantId: string;
  returnUrl: string;
  customerEmail?: string;
};

export type CardSessionResult = {
  sessionId: string;
  /** Hosted iframe or redirect — card data is collected only on the provider. */
  iframeUrl: string;
  redirectUrl: string;
};

export type TokenizeResult = {
  tokenRef: string;
  brand?: string;
  last4?: string;
  expMonth?: number;
  expYear?: number;
};

export type ChargeTokenRequest = {
  tenantId: string;
  tokenRef: string;
  amount: string;
  currency: string;
  invoiceId: string;
  idempotencyKey: string;
};

export type ChargeTokenResult = {
  providerRef: string;
  status: "pending" | "succeeded" | "failed";
};

export type PaymentLinkRequest = {
  tenantId: string;
  invoiceId: string;
  amount: string;
  currency: string;
  idempotencyKey: string;
};

export type PaymentLinkResult = {
  providerRef: string;
  referenceCode?: string;
  paymentUrl?: string;
  instructionsEn?: string;
  instructionsAr?: string;
};

export type ParsedWebhookEvent = {
  idempotencyKey: string;
  providerRef: string;
  tenantId?: string;
  invoiceId?: string;
  amount: string;
  currency: string;
  status: "succeeded" | "failed" | "pending";
  /** Default "payment". "refund" events finalise a refund started with {@link PaymentGateway.refund}. */
  kind?: "payment" | "refund";
};

export type RefundRequest = {
  providerRef: string;
  amount: string;
  currency: string;
  idempotencyKey: string;
};

export type RefundResult = {
  providerRef: string;
  status: "pending" | "succeeded" | "failed";
};

export interface PaymentGateway {
  readonly key: KiorlyPaymentProviderKey;
  createPaymentLink(req: PaymentLinkRequest): Promise<PaymentLinkResult>;
  createCardSession(req: CardSessionRequest): Promise<CardSessionResult>;
  tokenizeFromWebhook(payload: unknown): TokenizeResult | null;
  chargeToken(req: ChargeTokenRequest): Promise<ChargeTokenResult>;
  verifyWebhookSignature(rawBody: string, signatureHeader: string | undefined): boolean;
  parseWebhook(payload: unknown): ParsedWebhookEvent;
  refund(req: RefundRequest): Promise<RefundResult>;
  /** Mock mode only (dev inbox "simulate PSP callback"): signs a body exactly as the provider would. */
  signMockWebhook?(rawBody: string): string;
}