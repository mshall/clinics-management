import { Body, Controller, Headers, Param, Post, RawBodyRequest, Req, UnauthorizedException } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { KiorlyPaymentService } from "./kiorly-payment.service";

@ApiTags("webhooks")
@Controller("webhooks/payments")
export class KiorlyPaymentsWebhookController {
  constructor(private readonly payments: KiorlyPaymentService) {}

  @Post(":provider")
  @ApiOperation({ summary: "Payment provider webhook (HMAC verified, idempotent)" })
  async handle(
    @Param("provider") provider: string,
    @Req() req: RawBodyRequest<Request>,
    @Headers("x-kiorly-signature") signature: string | undefined,
    @Headers("x-signature") altSignature: string | undefined,
    @Body() body: unknown,
  ) {
    const raw = req.rawBody?.toString("utf8") ?? JSON.stringify(body ?? {});
    try {
      return await this.payments.handleWebhook(provider, raw, signature ?? altSignature, body);
    } catch (e) {
      if (e instanceof UnauthorizedException) throw e;
      throw e;
    }
  }
}