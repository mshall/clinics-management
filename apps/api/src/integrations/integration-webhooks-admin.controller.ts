import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { CreateIntegrationWebhookDto } from "./dto/create-integration-webhook.dto";
import { IntegrationClientService } from "./integration-client.service";
import { IntegrationWebhookService } from "./integration-webhook.service";

@ApiTags("admin")
@ApiBearerAuth("bearer")
@Controller("admin/integration-clients/:clientId/webhooks")
@UseGuards(JwtAuthGuard)
export class IntegrationWebhooksAdminController {
  constructor(
    private readonly clients: IntegrationClientService,
    private readonly webhooks: IntegrationWebhookService,
  ) {}

  @Get()
  @ApiOperation({ summary: "List outbound webhooks for an integration client" })
  list(@CurrentUser() user: JwtUser, @Param("clientId") clientId: string) {
    this.clients.assertAdminManage(user);
    return this.webhooks.listWebhooks(requireTenantId(user), clientId);
  }

  @Post()
  @ApiOperation({ summary: "Register webhook endpoint (signing secret shown once)" })
  create(
    @CurrentUser() user: JwtUser,
    @Param("clientId") clientId: string,
    @Body() body: CreateIntegrationWebhookDto,
  ) {
    this.clients.assertAdminManage(user);
    return this.webhooks.createWebhook(requireTenantId(user), clientId, body);
  }

  @Post(":webhookId/deactivate")
  @ApiOperation({ summary: "Deactivate webhook endpoint" })
  deactivate(
    @CurrentUser() user: JwtUser,
    @Param("clientId") clientId: string,
    @Param("webhookId") webhookId: string,
  ) {
    this.clients.assertAdminManage(user);
    return this.webhooks.deactivateWebhook(requireTenantId(user), clientId, webhookId);
  }
}
