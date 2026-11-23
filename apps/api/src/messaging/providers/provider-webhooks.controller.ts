import { BadRequestException, Body, Controller, Headers, HttpCode, NotFoundException, Param, Post, RawBodyRequest, Req, UnauthorizedException } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { emailHttpConfig, smsConfig, whatsAppHttpConfig } from "../../common/provider-env";
import { verifyWebhookSignature } from "../../common/webhook-hmac";
import { emailReceiptsFromWebhook } from "./email-http.mapping";
import { smsReceiptsFromWebhook } from "./sms.mapping";
import { whatsAppReceiptsFromWebhook } from "./whatsapp-http.mapping";
import { DeliveryReceiptService } from "./delivery-receipt.service";
import type { DeliveryReceipt } from "./delivery-receipt";

const KINDS = ["sms", "whatsapp", "email"] as const;
type Kind = (typeof KINDS)[number];

/**
 * Provider-neutral delivery-receipt webhooks (generic HTTP adapters):
 *   POST /api/v1/webhooks/providers/{sms|whatsapp|email}
 *   X-Kiorly-Signature: HMAC-SHA256(<KIND>_WEBHOOK_SECRET, rawBody) hex|base64 [`sha256=` prefix ok]
 *   X-Kiorly-Timestamp (optional): when sent the signed string is `${timestamp}.${rawBody}` and +-5 min skew is enforced.
 * Meta Cloud (`/webhooks/whatsapp`) and SES (`/webhooks/email/ses`) keep their own vendor endpoints.
 */
@ApiTags("webhooks")
@Controller("webhooks/providers")
export class ProviderWebhooksController {
  constructor(private readonly receipts: DeliveryReceiptService) {}

  @Post(":kind")
  @HttpCode(200)
  @ApiOperation({ summary: "Delivery receipts from the SMS / WhatsApp / Email provider (HMAC verified)" })
  async receive(
    @Param("kind") kind: string,
    @Req() req: RawBodyRequest<Request>,
    @Headers("x-kiorly-signature") signature: string | undefined,
    @Headers("x-signature") altSignature: string | undefined,
    @Headers("x-kiorly-timestamp") timestamp: string | undefined,
    @Body() body: unknown,
  ) {
    if (!(KINDS as readonly string[]).includes(kind)) throw new NotFoundException();
    const k = kind as Kind;
    const secret = k === "sms" ? smsConfig().webhookSecret : k === "email" ? emailHttpConfig().webhookSecret : whatsAppHttpConfig().webhookSecret;
    const raw = req.rawBody?.toString("utf8") ?? JSON.stringify(body ?? {});
    if (!verifyWebhookSignature({ secret, rawBody: raw, signature: signature ?? altSignature, timestamp })) {
      throw new UnauthorizedException("Invalid webhook signature");
    }
    let events: DeliveryReceipt[];
    try {
      events = k === "sms" ? smsReceiptsFromWebhook(body) : k === "email" ? emailReceiptsFromWebhook(body) : whatsAppReceiptsFromWebhook(body);
    } catch {
      throw new BadRequestException("Unparseable receipt payload");
    }
    return { ok: true, ...(await this.receipts.apply(k, events)) };
  }
}
