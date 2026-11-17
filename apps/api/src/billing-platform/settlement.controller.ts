import { BadRequestException, Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { SettlementService } from "./settlement.service";

@ApiTags("billing")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("billing/settlement")
export class SettlementController {
  constructor(private readonly settlement: SettlementService) {}

  @Get("preview")
  @ApiOperation({ summary: "Dry-run monthly settlement for a period (YYYY-MM)" })
  preview(@CurrentUser() user: JwtUser, @Query("period") period: string, @Query("tenantId") tenantId?: string) {
    const targetTenant = tenantId?.trim() || requireTenantId(user);
    if (!period?.trim()) throw new BadRequestException("period is required (YYYY-MM)");
    return this.settlement.previewForTenant(user, targetTenant, period.trim());
  }
}