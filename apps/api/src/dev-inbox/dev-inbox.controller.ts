import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { DevInboxGuard } from "./dev-inbox.guard";
import { DevInboxService, type DevDeliveryState } from "./dev-inbox.service";
import { DevInboxDeliveryBodyDto, DevInboxInboundBodyDto, DevInboxPspBodyDto, DevInboxPspRefundBodyDto, DevInboxSendTestBodyDto } from "./dev-inbox.controller.dto";

@ApiTags("dev-inbox")
@Controller("dev/inbox")
@UseGuards(DevInboxGuard)
export class DevInboxController {
  constructor(private readonly inbox: DevInboxService) {}

  @Get("status")
  @ApiOperation({ summary: "Provider modes (mock | real) per integration" })
  status() {
    return this.inbox.status();
  }

  @Get()
  @ApiOperation({ summary: "Rendered mock messages (email / WhatsApp / SMS / push) and simulated replies" })
  list(
    @Query("channel") channel?: string,
    @Query("to") to?: string,
    @Query("direction") direction?: string,
    @Query("limit") limit?: string,
  ) {
    return this.inbox.list({ channel, to, direction, limit: limit ? Number(limit) : undefined });
  }

  @Get("messages/:id")
  @ApiOperation({ summary: "One rendered message" })
  get(@Param("id") id: string) {
    return this.inbox.get(id);
  }

  @Post("messages/:id/delivery")
  @HttpCode(200)
  @ApiOperation({ summary: "Simulate a delivery receipt: delivered | read | failed | bounced" })
  delivery(@Param("id") id: string, @Body() body: DevInboxDeliveryBodyDto) {
    return this.inbox.simulateDelivery(id, body?.state, body?.error);
  }

  @Post("inbound/whatsapp")
  @HttpCode(200)
  @ApiOperation({ summary: "Simulate a patient WhatsApp reply (text or quick-reply button payload)" })
  inbound(@Body() body: DevInboxInboundBodyDto) {
    return this.inbox.simulateInboundWhatsApp(body);
  }

  @Post("psp/callback")
  @HttpCode(200)
  @ApiOperation({ summary: "Simulate a Paymob / Fawry payment callback for a Kiorly invoice" })
  psp(
    @Body()
    body: DevInboxPspBodyDto,
  ) {
    return this.inbox.simulatePspCallback(body);
  }

  @Post("psp/refund")
  @HttpCode(200)
  @ApiOperation({ summary: "Refund a succeeded Kiorly payment (mock settles via the signed refund webhook)" })
  pspRefund(@Body() body: DevInboxPspRefundBodyDto) {
    return this.inbox.simulatePspRefund(body);
  }

  @Post("send-test")
  @HttpCode(200)
  @ApiOperation({ summary: "Smoke-test sms | email | whatsapp through the live provider port (mock => inbox, real => provider)" })
  sendTest(@Body() body: DevInboxSendTestBodyDto) {
    return this.inbox.sendTest(body);
  }
}
