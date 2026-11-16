import { Body, Controller, Get, Param, Put, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { UserMoneyVisibilityDto, UserMoneyVisibilityResponseDto } from "./dto/user-money-visibility.dto";
import { UserMoneyVisibilityService } from "./user-money-visibility.service";

@ApiTags("user-money-visibility")
@ApiBearerAuth("bearer")
@Controller("user-money-visibility")
@UseGuards(JwtAuthGuard)
export class UserMoneyVisibilityController {
  constructor(private readonly svc: UserMoneyVisibilityService) {}

  @Get(":userId")
  @ApiOperation({ summary: "Per-user override for seeing money on operations, encounters, and appointments" })
  @ApiOkResponse({ type: UserMoneyVisibilityResponseDto })
  getOne(@CurrentUser() user: JwtUser, @Param("userId") userId: string) {
    return this.svc.getForUser(requireTenantId(user), userId, user);
  }

  @Put(":userId")
  @ApiOperation({ summary: "Set money visibility overrides (ROLE_DEFAULT removes custom row)" })
  @ApiOkResponse({ type: UserMoneyVisibilityResponseDto })
  putOne(@CurrentUser() user: JwtUser, @Param("userId") userId: string, @Body() body: UserMoneyVisibilityDto) {
    return this.svc.setForUser(requireTenantId(user), userId, body, user);
  }
}