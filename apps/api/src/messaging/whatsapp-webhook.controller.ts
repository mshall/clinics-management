import { Body, Controller, Get, Headers, Post, Query, RawBodyRequest, Req, UnauthorizedException } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { WhatsAppWebhookService } from "./whatsapp-webhook.service";

@ApiTags("webhooks")
@Controller("webhooks/whatsapp")
export class WhatsAppWebhookController {
  constructor(private readonly webhooks: WhatsAppWebhookService) {}

  @Get()
  @ApiOperation({ summary: "Meta WhatsApp webhook verification challenge" })
  verify(
    @Query("hub.mode") mode: string,
    @Query("hub.verify_token") token: string,
    @Query("hub.challenge") challenge: string,
  ) {
    const out = this.webhooks.verifySubscribe(mode, token, challenge);
    if (out == null) throw new UnauthorizedException("Invalid verification token");
    return out;
  }

  @Post()
  @ApiOperation({ summary: "Meta WhatsApp delivery status updates" })
  async event(
    @Req() req: RawBodyRequest<Request>,
    @Headers("x-hub-signature-256") signature: string | undefined,
    @Body() body: unknown,
  ) {
    const raw = req.rawBody?.toString("utf8") ?? JSON.stringify(body ?? {});
    if (!this.webhooks.assertSignature(raw, signature)) {
      throw new UnauthorizedException("Invalid webhook signature");
    }
    return this.webhooks.handlePayload(body);
  }
}