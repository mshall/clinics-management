import { Body, Controller, Get, Param, Put, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { SetUserNavTabsDto } from "./dto/set-user-nav-tabs.dto";
import { UserNavTabGrantResponseDto } from "./dto/user-nav-tab-grant-response.dto";
import { TenantRoleNavTabsService } from "./tenant-role-nav-tabs.service";

@ApiTags("tenant-role-nav-tabs")
@ApiBearerAuth("bearer")
@Controller("admin/role-nav-tabs")
@UseGuards(JwtAuthGuard)
export class TenantRoleNavTabsController {
  constructor(private readonly svc: TenantRoleNavTabsService) {}

  @Get(":role")
  @ApiOperation({ summary: "Get organization role sidebar permissions (null = platform defaults)" })
  @ApiOkResponse({ type: UserNavTabGrantResponseDto })
  getOne(@CurrentUser() user: JwtUser, @Param("role") role: string) {
    return this.svc.getRoleGrant(requireTenantId(user), role.trim().toUpperCase() as UserRole, user);
  }

  @Put(":role")
  @ApiOperation({ summary: "Set organization role sidebar permissions (subset of platform role max)" })
  @ApiOkResponse({ type: UserNavTabGrantResponseDto })
  putOne(@CurrentUser() user: JwtUser, @Param("role") role: string, @Body() body: SetUserNavTabsDto) {
    return this.svc.setRoleGrant(requireTenantId(user), role.trim().toUpperCase() as UserRole, body.tabKeys ?? [], user);
  }
}
