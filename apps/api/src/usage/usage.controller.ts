import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { UsageMeterService } from "./usage-meter.service";

@ApiTags("billing")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("billing")
export class UsageController {
  constructor(private readonly usage: UsageMeterService) {}

  @Get("usage")
  @ApiOperation({ summary: "PL-05 — monthly usage meters vs plan limits" })
  @ApiOkResponse()
  getUsage(@CurrentUser() user: JwtUser, @Query("period") period?: string) {
    const periodKey = period?.trim() || UsageMeterService.periodKey();
    return this.usage.summaryForTenant(requireTenantId(user), periodKey);
  }
}