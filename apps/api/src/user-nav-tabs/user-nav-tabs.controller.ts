import { Body, Controller, Get, Param, Put, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { SetUserNavTabsDto } from "./dto/set-user-nav-tabs.dto";
import { UserNavTabGrantResponseDto } from "./dto/user-nav-tab-grant-response.dto";
import { UserNavTabsService } from "./user-nav-tabs.service";

@ApiTags("user-nav-tabs")
@ApiBearerAuth("bearer")
@Controller("user-nav-tabs")
@UseGuards(JwtAuthGuard)
export class UserNavTabsController {
  constructor(private readonly svc: UserNavTabsService) {}

  @Get(":userId")
  @ApiOperation({ summary: "Get saved navigation tab grant for a user (null = role defaults)" })
  @ApiOkResponse({ type: UserNavTabGrantResponseDto })
  getOne(@CurrentUser() user: JwtUser, @Param("userId") userId: string) {
    return this.svc.getForUser(requireTenantId(user), userId, user);
  }

  @Put(":userId")
  @ApiOperation({
    summary: "Set which sidebar tabs a user may see (subset of their role; profile always included)",
  })
  @ApiOkResponse({ type: UserNavTabGrantResponseDto })
  putOne(@CurrentUser() user: JwtUser, @Param("userId") userId: string, @Body() body: SetUserNavTabsDto) {
    return this.svc.setForUser(requireTenantId(user), userId, body.tabKeys ?? [], user);
  }
}
