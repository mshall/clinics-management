import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { MessageChannel } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { MessagingService } from "./messaging.service";

@ApiTags("messaging")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("messaging")
export class MessagingController {
  constructor(private readonly messaging: MessagingService) {}

  @Get("templates")
  templates(@CurrentUser() user: JwtUser) {
    return this.messaging.listTemplates(requireTenantId(user));
  }

  @Post("send")
  send(
    @CurrentUser() user: JwtUser,
    @Body() body: { patientId?: string; channel: MessageChannel; toPhone: string; templateKey?: string; body: string },
  ) {
    return this.messaging.queueMessage(requireTenantId(user), body);
  }

  @Get("recall-campaigns")
  recall(@CurrentUser() user: JwtUser) {
    return this.messaging.listRecallCampaigns(requireTenantId(user));
  }
}
