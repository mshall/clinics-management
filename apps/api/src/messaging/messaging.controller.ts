import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { MessageChannel } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { EntitlementGuard } from "../entitlements/entitlement.guard";
import { RequiresEntitlement } from "../entitlements/requires-entitlement.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { MessagingService } from "./messaging.service";

@ApiTags("messaging")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard, EntitlementGuard)
@RequiresEntitlement("mod_messaging")
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
    @Body()
    body: {
      patientId?: string;
      appointmentId?: string;
      channel: MessageChannel;
      toPhone: string;
      templateKey?: string;
      body: string;
      variables?: Record<string, string>;
    },
  ) {
    return this.messaging.queueMessage(requireTenantId(user), body);
  }

  @Get("outbound")
  outbound(
    @CurrentUser() user: JwtUser,
    @Query("patientId") patientId?: string,
    @Query("appointmentId") appointmentId?: string,
    @Query("limit") limit?: string,
  ) {
    const tenantId = requireTenantId(user);
    return this.messaging.listOutbound(tenantId, {
      patientId: patientId?.trim() || undefined,
      appointmentId: appointmentId?.trim() || undefined,
      limit: limit ? Number.parseInt(limit, 10) : undefined,
    });
  }

  @Get("failures")
  failures(@CurrentUser() user: JwtUser) {
    return this.messaging.listFailures(requireTenantId(user));
  }

  @Get("recall-campaigns")
  recall(@CurrentUser() user: JwtUser) {
    return this.messaging.listRecallCampaigns(requireTenantId(user));
  }
}
