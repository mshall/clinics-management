import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { GroupOverviewKpisDto } from "../common/dto/dashboard.dto";
import { DashboardService } from "./dashboard.service";

@ApiTags("dashboards")
@ApiBearerAuth("bearer")
@Controller("dashboards")
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get("group-overview")
  @ApiOperation({ summary: "Group-level KPI snapshot" })
  @ApiOkResponse({ type: GroupOverviewKpisDto })
  groupOverview(
    @CurrentUser() user: JwtUser,
    @Query("from") from?: string,
    @Query("to") to?: string
  ) {
    return this.dashboard.groupOverview(requireTenantId(user), from, to);
  }
}
