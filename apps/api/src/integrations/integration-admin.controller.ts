import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { CreateIntegrationClientDto } from "./dto/create-integration-client.dto";
import { IntegrationClientService } from "./integration-client.service";

@ApiTags("admin")
@ApiBearerAuth("bearer")
@Controller("admin/integration-clients")
@UseGuards(JwtAuthGuard)
export class IntegrationAdminController {
  constructor(private readonly clients: IntegrationClientService) {}

  @Get()
  @ApiOperation({ summary: "List API integration clients for the organization" })
  list(@CurrentUser() user: JwtUser) {
    this.clients.assertAdminManage(user);
    return this.clients.listClients(requireTenantId(user));
  }

  @Post()
  @ApiOperation({ summary: "Create integration client (bearer token shown once)" })
  create(@CurrentUser() user: JwtUser, @Body() body: CreateIntegrationClientDto) {
    this.clients.assertAdminManage(user);
    return this.clients.createClient(requireTenantId(user), user, body);
  }

  @Post(":id/rotate-secret")
  @ApiOperation({ summary: "Rotate integration client secret" })
  rotate(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    this.clients.assertAdminManage(user);
    return this.clients.rotateSecret(requireTenantId(user), id);
  }

  @Post(":id/deactivate")
  @ApiOperation({ summary: "Deactivate integration client" })
  deactivate(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    this.clients.assertAdminManage(user);
    return this.clients.deactivate(requireTenantId(user), id);
  }
}
