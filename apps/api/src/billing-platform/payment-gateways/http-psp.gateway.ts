import { pspConfig, type PspConfig } from "../../common/provider-env";
import { providerHttp, type ProviderHttpRequest } from "../../common/provider-http";
import { verifyWebhookSignature } from "../../common/webhook-hmac";
import type {
  CardSessionRequest,
  CardSessionResult,
  ChargeTokenRequest,
  ChargeTokenResult,
  KiorlyPaymentProviderKey,
  ParsedWebhookEvent,
  PaymentGateway,
  PaymentLinkRequest,
  PaymentLinkResult,
  RefundRequest,
  RefundResult,
  TokenizeResult,
} from "./payment-gateway.interface";
import * as map from "./psp.mapping";

/** Raised for PSP failures; message is secret-free. `retryable` lets callers decide whether to retry later. */
export class PspError extends Error {
  constructor(
    message: string,
    readonly failureClass: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

/**
 * Real PSP over generic JSON/HTTP (PSP_* env). Registered for `paymob` and `fawry` when the PSP mode is real, so the
 * provider keys, invoices and webhooks keep their meaning while the wire format is the neutral one in psp.mapping.ts.
 * Card data never touches Kiorly: sessions return a hosted iframe/redirect and charges use opaque tokens.
 */
export class HttpPspGateway implements PaymentGateway {
  constructor(
    readonly key: KiorlyPaymentProviderKey,
    private readonly cfg: PspConfig = pspConfig(),
    private readonly http: Pick<ProviderHttpRequest, "fetchImpl" | "sleep"> = {},
  ) {}

  private async call(path: string, body: unknown, idempotencyKey: string): Promise<unknown> {
    const res = await providerHttp({
      url: `${this.cfg.apiUrl.replace(/\/$/, "")}${path}`,
      headers: map.pspAuthHeaders(this.cfg.apiKey),
      body,
      timeoutMs: this.cfg.timeoutMs,
      retries: this.cfg.maxRetries,
      backoffMs: this.cfg.backoffMs,
      idempotencyKey,
      secrets: [this.cfg.apiKey, this.cfg.webhookSecret],
      ...this.http,
    });
    if (!res.ok) throw new PspError(`PSP ${path}: ${res.error}`, res.failureClass, res.retryable);
    return res.json;
  }

  private malformed(path: string): PspError {
    return new PspError(`PSP ${path}: unexpected response shape`, "UNKNOWN", false);
  }

  async createPaymentLink(req: PaymentLinkRequest): Promise<PaymentLinkResult> {
    const out = map.linkResult(await this.call(map.PSP_PATHS.paymentLink, map.linkBody(req, this.cfg), req.idempotencyKey));
    if (!out) throw this.malformed(map.PSP_PATHS.paymentLink);
    return out;
  }

  async createCardSession(req: CardSessionRequest): Promise<CardSessionResult> {
    const out = map.sessionResult(await this.call(map.PSP_PATHS.cardSession, map.sessionBody(req, this.cfg), `session_${req.tenantId}_${Date.now()}`));
    if (!out) throw this.malformed(map.PSP_PATHS.cardSession);
    return out;
  }

  tokenizeFromWebhook(payload: unknown): TokenizeResult | null {
    return map.tokenFromWebhook(payload);
  }

  async chargeToken(req: ChargeTokenRequest): Promise<ChargeTokenResult> {
    const out = map.chargeResult(await this.call(map.PSP_PATHS.charge, map.chargeBody(req, this.cfg), req.idempotencyKey));
    if (!out) throw this.malformed(map.PSP_PATHS.charge);
    return out;
  }

  verifyWebhookSignature(rawBody: string, signatureHeader: string | undefined): boolean {
    return verifyWebhookSignature({ secret: this.cfg.webhookSecret, rawBody, signature: signatureHeader });
  }

  parseWebhook(payload: unknown): ParsedWebhookEvent {
    return map.webhookEvent(payload);
  }

  async refund(req: RefundRequest): Promise<RefundResult> {
    const out = map.refundResult(await this.call(map.PSP_PATHS.refund, map.refundBody(req, this.cfg), req.idempotencyKey));
    if (!out) throw this.malformed(map.PSP_PATHS.refund);
    return out;
  }
}
